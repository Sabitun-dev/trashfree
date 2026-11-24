// One notification = a bell entry + a bot message with an "Ochish" button to the exact screen.
// De-duplicated by (user, dedupKey). A failed send never throws; users who blocked the bot are marked.
import { getStore } from "@netlify/blobs";
import { InlineKeyboard, InputFile } from "grammy";
import type { Screen } from "../../domain/deeplink";
import type { MutableCategory } from "../../domain/types";
import { appLink, isBlockedError, retryAfter, sleep, tg } from "../bot/telegram";
import { bt, type TextKey } from "../bot/texts";
import { db } from "../db";
import { safeLog } from "../errors";

export type NotificationType =
  | "order_placed"
  | "order_accepted"
  | "order_on_the_way"
  | "order_completed"
  | "order_cancelled"
  | "order_expired"
  | "order_assigned"
  | "order_unassigned"
  | "payment_paid"
  | "payment_failed"
  | "sub_activated"
  | "sub_expiring"
  | "sub_expires_today"
  | "sub_expired"
  | "rate_ask"
  | "new_order"
  | "cash_handover"
  | "broadcast"
  | "wash_placed"
  | "wash_new"
  | "wash_assigned"
  | "wash_quote"
  | "wash_courier_confirmed"
  | "wash_courier_declined"
  | "wash_picked"
  | "wash_cancelled"
  | "wash_status"
  | "admin_alert";

const CATEGORY: Partial<Record<NotificationType, MutableCategory>> = {
  new_order: "new_orders",
  wash_new: "new_orders",
  rate_ask: "reminders",
  sub_expiring: "reminders",
  sub_expires_today: "reminders",
  sub_expired: "reminders",
  broadcast: "news",
};

/** Order and payment messages are critical and can never be muted. */
export const categoryOf = (type: NotificationType) => CATEGORY[type] ?? "critical";

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  /** Values for the text and the bell (n = order number, total, …). */
  params?: Record<string, string | number>;
  screen: Screen;
  dedupKey?: string;
  /** Extra buttons under "Ochish": [text key, screen]. */
  extraButtons?: { key: TextKey; screen: Screen }[];
  photoBlobKey?: string | null;
  /** Override the text (broadcasts). */
  text?: string;
  /** Store in the bell only, no bot message. */
  silent?: boolean;
  /** Buttons that answer inside the chat (e.g. confirm / decline a quote): [text key, callback data ≤ 64 bytes]. */
  callbackButtons?: { key: TextKey; data: string }[];
}

export async function notify(n: NotifyInput): Promise<"sent" | "muted" | "duplicate" | "blocked" | "failed" | "silent"> {
  const payload = { ...(n.params ?? {}), screen: n.screen.name, ...("id" in n.screen ? { id: n.screen.id } : {}) };
  let noteId: number;
  try {
    noteId = (await db().notification.create({ data: { userId: n.userId, type: n.type, payload, dedupKey: n.dedupKey ?? null } })).id;
  } catch {
    return "duplicate"; // unique (userId, dedupKey)
  }
  if (n.silent) return "silent";
  const result = await deliver(n);
  await db()
    .notification.update({ where: { id: noteId }, data: { delivery: result.error ? `${result.status}: ${result.error}`.slice(0, 300) : result.status } })
    .catch(() => {});
  return result.status;
}

async function deliver(n: NotifyInput): Promise<{ status: "sent" | "muted" | "blocked" | "failed"; error?: string }> {
  const user = await db().user.findUnique({ where: { id: n.userId }, select: { telegramId: true, language: true, mutedCategories: true, botBlocked: true, deletedAt: true } });
  if (!user || user.deletedAt || user.telegramId < 0n) return { status: "failed", error: "no_user" };
  const cat = categoryOf(n.type);
  if (cat !== "critical" && user.mutedCategories.includes(cat)) return { status: "muted" };
  // Broadcasts skip people who blocked the bot. Order messages are always tried: the flag may be stale.
  if (user.botBlocked && n.type === "broadcast") return { status: "blocked" };
  const r = await sendBotMessage(user.telegramId, user.language, n);
  if (r.status === "sent" && user.botBlocked) await db().user.updateMany({ where: { telegramId: user.telegramId }, data: { botBlocked: false } });
  return r;
}

async function sendBotMessage(chatId: bigint, lang: string, n: NotifyInput): Promise<{ status: "sent" | "blocked" | "failed"; error?: string }> {
  const text = n.text ?? bt(lang, n.type as TextKey, n.params ?? {});
  const kb = new InlineKeyboard().url(bt(lang, "open"), await appLink(n.screen));
  for (const b of n.extraButtons ?? []) kb.row().url(bt(lang, b.key), await appLink(b.screen));
  if (n.callbackButtons?.length) {
    kb.row();
    for (const b of n.callbackButtons) kb.text(bt(lang, b.key), b.data);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (n.photoBlobKey) {
        const data = await getStore({ name: "photos", consistency: "strong" }).get(n.photoBlobKey, { type: "arrayBuffer" });
        if (data) {
          await tg().sendPhoto(Number(chatId), new InputFile(new Uint8Array(data), "photo.jpg"), { caption: text.slice(0, 1024), reply_markup: kb });
          return { status: "sent" };
        }
      }
      await tg().sendMessage(Number(chatId), text, { reply_markup: kb, link_preview_options: { is_disabled: true } });
      return { status: "sent" };
    } catch (e) {
      if (isBlockedError(e)) {
        await db().user.updateMany({ where: { telegramId: chatId }, data: { botBlocked: true } });
        return { status: "blocked", error: e instanceof Error ? e.message : String(e) };
      }
      const wait = retryAfter(e);
      if (wait && attempt === 0) {
        await sleep(Math.min(wait, 5) * 1000);
        continue;
      }
      safeLog(`notify ${n.type} failed`, e);
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { status: "failed", error: "retry" };
}

/** Send to many users; one failure never stops the rest. */
export async function notifyMany(inputs: NotifyInput[]) {
  const results: Record<string, number> = {};
  for (const i of inputs) {
    const r = await notify(i).catch(() => "failed" as const);
    results[r] = (results[r] ?? 0) + 1;
  }
  return results;
}
