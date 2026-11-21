// Support relay. A user's message to the bot is copied into ADMIN_SUPPORT_CHAT_ID (a forum group),
// one topic per user, with a pinned card (name, phone, recent orders, buttons). An admin's reply in the topic
// goes back to the user. Messages starting with "//" stay internal (notes between admins).
import { GrammyError, InlineKeyboard, type Bot } from "grammy";
import type { Message } from "grammy/types";
import { formatSom } from "../../domain/money";
import type { BotCtx } from "../bot/bot";
import { appLink, tg } from "../bot/telegram";
import { bt } from "../bot/texts";
import { db } from "../db";
import { env } from "../env";
import { safeLog } from "../errors";
import { hit } from "../ratelimit";
import { getSettings } from "../settings";
import type { AuthUser } from "../users";

const topicGone = (e: unknown) => e instanceof GrammyError && /thread not found|TOPIC_DELETED|TOPIC_CLOSED|message thread/i.test(e.description);

async function cardText(user: AuthUser) {
  const orders = await db().order.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { number: true, status: true, priceTotal: true, pickupDate: true } });
  const lines = orders.map((o) => `#${o.number} · ${o.status} · ${o.pickupDate} · ${formatSom(o.priceTotal)}`);
  return [`👤 ${user.name}${user.username ? ` (@${user.username})` : ""}`, `📞 ${user.phone ?? "—"}`, `🌐 ${user.language} · ${user.role}`, "", ...(lines.length ? lines : ["—"])].join("\n");
}

async function topicTitle(user: AuthUser) {
  const last = await db().order.findFirst({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, select: { number: true } });
  return [user.name, user.phone, last ? `#${last.number}` : null].filter(Boolean).join(" · ").slice(0, 128);
}

async function cardKeyboard(user: AuthUser) {
  return new InlineKeyboard().url("👤 Admin", await appLink({ name: "admin_user", id: user.id }));
}

async function ensureThread(user: AuthUser, forceNew = false) {
  const chatId = env.supportChatId!;
  const existing = await db().supportThread.findUnique({ where: { userId: user.id } });
  if (existing && !forceNew) return existing;
  const topic = await tg().createForumTopic(chatId, await topicTitle(user));
  const card = await tg().sendMessage(chatId, await cardText(user), { message_thread_id: topic.message_thread_id, reply_markup: await cardKeyboard(user) });
  await tg().pinChatMessage(chatId, card.message_id, { disable_notification: true }).catch(() => {});
  return db().supportThread.upsert({
    where: { userId: user.id },
    create: { userId: user.id, topicId: topic.message_thread_id, cardMessageId: card.message_id },
    update: { topicId: topic.message_thread_id, cardMessageId: card.message_id },
  });
}

function summary(m: Message) {
  return { text: (m.text ?? m.caption ?? "").slice(0, 4000) || null, hasPhoto: !!m.photo };
}

export async function relayFromUser(user: AuthUser, m: Message): Promise<"ok" | "off" | "rate"> {
  if (!env.supportChatId) return "off";
  const settings = await getSettings();
  if (!(await hit(`support:${user.id}`, settings.supportMessagesPerMinute, 60))) return "rate";
  let thread = await ensureThread(user);
  try {
    await tg().copyMessage(env.supportChatId, m.chat.id, m.message_id, { message_thread_id: thread.topicId });
  } catch (e) {
    if (!topicGone(e)) throw e;
    thread = await ensureThread(user, true);
    await tg().copyMessage(env.supportChatId, m.chat.id, m.message_id, { message_thread_id: thread.topicId });
  }
  await db().supportMessage.create({ data: { threadId: thread.id, direction: "in", ...summary(m) } });
  if (thread.cardMessageId) {
    await tg()
      .editMessageText(env.supportChatId, thread.cardMessageId, await cardText(user), { reply_markup: await cardKeyboard(user) })
      .catch(() => {}); // "message is not modified" is fine
  }
  return "ok";
}

export async function relayFromAdmin(m: Message) {
  if (!m.message_thread_id || !m.from || m.from.is_bot) return;
  if (m.forum_topic_created || m.forum_topic_edited || m.pinned_message) return;
  if ((m.text ?? m.caption ?? "").startsWith("//")) return; // internal note
  const thread = await db().supportThread.findFirst({ where: { topicId: m.message_thread_id }, include: { user: true } });
  if (!thread || thread.user.deletedAt || thread.user.telegramId < 0n) return;
  try {
    await tg().copyMessage(Number(thread.user.telegramId), m.chat.id, m.message_id);
    await db().supportMessage.create({ data: { threadId: thread.id, direction: "out", ...summary(m) } });
  } catch (e) {
    safeLog("support reply failed", e);
    await tg()
      .setMessageReaction(m.chat.id, m.message_id, [{ type: "emoji", emoji: "👎" }])
      .catch(() => {});
  }
}

export function registerSupportHandlers(bot: Bot<BotCtx>) {
  // Admin replies inside the support forum group.
  bot.on("message", async (ctx, next) => {
    if (env.supportChatId && String(ctx.chat.id) === String(env.supportChatId)) {
      await relayFromAdmin(ctx.message);
      return;
    }
    await next();
  });

  // Anything a user writes to the bot (that isn't a command, contact or payment) goes to support.
  bot.on("message", async (ctx) => {
    const u = ctx.appUser;
    const m = ctx.message;
    if (!u || ctx.chat.type !== "private") return;
    if (m.text?.startsWith("/") || m.contact || m.successful_payment || m.web_app_data) return;
    if (u.blocked) return void (await ctx.reply(bt(u.language, "blocked")));
    try {
      const isFirst = !(await db().supportThread.findUnique({ where: { userId: u.id } }));
      const r = await relayFromUser(u, m);
      if (r === "off") await ctx.reply(bt(u.language, "support_off"));
      else if (r === "rate") await ctx.reply(bt(u.language, "support_rate"));
      else if (isFirst) await ctx.reply(bt(u.language, "support_ack"));
    } catch (e) {
      safeLog("support relay failed", e);
      await ctx.reply(bt(u.language, "support_off"));
    }
  });
}
