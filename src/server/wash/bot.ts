// Bot buttons under a quote: "wq:<orderId>:<version>:y|n". Only the order's client can answer,
// and only the current quote version — an old message's buttons can't confirm a newer price.
import type { Bot } from "grammy";
import type { BotCtx } from "../bot/bot";
import { bt } from "../bot/texts";
import { ApiError, safeLog } from "../errors";
import { respondToQuote } from "./service";

export function registerWashHandlers(bot: Bot<BotCtx>) {
  bot.callbackQuery(/^wq:([a-z0-9]{10,40}):(\d{1,4}):([yn])$/, async (ctx) => {
    const u = ctx.appUser;
    const [, orderId, version, answer] = ctx.match;
    if (!u) return void (await ctx.answerCallbackQuery());
    const accept = answer === "y";
    try {
      await respondToQuote(u, orderId, Number(version), accept);
      await ctx.answerCallbackQuery({ text: bt(u.language, accept ? "wash_confirmed" : "wash_declined") });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await ctx.reply(bt(u.language, accept ? "wash_confirmed" : "wash_declined"));
    } catch (e) {
      if (!(e instanceof ApiError)) safeLog("quote button failed", e);
      await ctx.answerCallbackQuery({ text: bt(u.language, "wash_quote_stale"), show_alert: true }).catch(() => {});
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    }
  });
}
