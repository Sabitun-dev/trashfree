// The grammY bot. Handlers are small; the business logic lives in services.
import { Bot, type Context } from "grammy";
import { db } from "../db";
import { env } from "../env";
import { safeLog } from "../errors";
import { normalizePhone, upsertTelegramUser, type AuthUser } from "../users";
import { registerPaymentHandlers } from "../payments/telegramBot";
import { registerSupportHandlers } from "../support/relay";
import { appLink } from "./telegram";
import { bt } from "./texts";
import { InlineKeyboard } from "grammy";

export type BotCtx = Context & { appUser?: AuthUser };

let bot: Bot<BotCtx> | undefined;

export async function getBot(): Promise<Bot<BotCtx>> {
  if (bot) return bot;
  const b = new Bot<BotCtx>(env.botToken);

  // Load our user for private chats (not for the admin/courier groups).
  b.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot && ctx.chat?.type === "private") {
      ctx.appUser = await upsertTelegramUser(ctx.from);
      // They are writing to the bot, so the bot can write back.
      if (ctx.appUser.botBlocked) {
        await db().user.update({ where: { id: ctx.appUser.id }, data: { botBlocked: false } });
        ctx.appUser = { ...ctx.appUser, botBlocked: false };
      }
    }
    await next();
  });

  b.command("start", async (ctx) => {
    const u = ctx.appUser;
    if (!u) return;
    if (u.blocked) return void (await ctx.reply(bt(u.language, "blocked")));
    const isCourier = u.role === "courier";
    const screen = isCourier ? ({ name: "courier" } as const) : ({ name: "home" } as const);
    await ctx.reply(bt(u.language, isCourier ? "welcome_courier" : "welcome"), {
      reply_markup: new InlineKeyboard().url(bt(u.language, "open"), await appLink(screen)),
    });
  });

  b.command("orders", async (ctx) => {
    const u = ctx.appUser;
    if (!u) return;
    await ctx.reply(bt(u.language, "cmd_orders"), {
      reply_markup: new InlineKeyboard().url(bt(u.language, "open"), await appLink({ name: "home" })),
    });
  });

  b.command("help", async (ctx) => {
    const u = ctx.appUser;
    if (!u) return;
    await ctx.reply(bt(u.language, "help"));
  });

  // Phone number: accepted ONLY from a contact the user shares about themselves.
  b.on("message:contact", async (ctx) => {
    const u = ctx.appUser;
    if (!u) return;
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply(bt(u.language, "phone_not_own"));
      return;
    }
    await db().user.update({ where: { id: u.id }, data: { phone: normalizePhone(contact.phone_number) } });
    await ctx.reply(bt(u.language, "phone_saved"), { reply_markup: { remove_keyboard: true } });
  });

  registerPaymentHandlers(b);
  registerSupportHandlers(b);

  b.catch((err) => safeLog("Bot handler error", err.error));
  await b.init();
  bot = b;
  return b;
}

/** Handles one webhook update exactly once (dedup by update_id). */
export async function handleWebhookUpdate(update: { update_id: number }): Promise<"ok" | "duplicate"> {
  const id = BigInt(update.update_id);
  try {
    await db().processedUpdate.create({ data: { updateId: id } });
  } catch {
    return "duplicate";
  }
  try {
    const b = await getBot();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await b.handleUpdate(update as any);
    return "ok";
  } catch (e) {
    // Let Telegram retry this update later.
    await db().processedUpdate.delete({ where: { updateId: id } }).catch(() => {});
    throw e;
  }
}
