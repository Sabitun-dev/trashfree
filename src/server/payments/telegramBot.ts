// Telegram Payments bot handlers.
// pre_checkout_query: re-check the order (still awaiting payment, same amount) and answer within 10 s.
// successful_payment: mark paid, idempotent by Telegram's charge ids.
import type { Bot } from "grammy";
import { somToTiyin } from "../../domain/money";
import type { BotCtx } from "../bot/bot";
import { bt } from "../bot/texts";
import { db } from "../db";
import { safeLog } from "../errors";
import { findAccount, settlePayment } from "./accounts";

export type PreCheckoutVerdict = { ok: true } | { ok: false; reason: "pay_expired_answer" | "pay_amount_answer" };

export async function checkPreCheckout(paymentId: string, currency: string, totalAmount: number, now = new Date()): Promise<PreCheckoutVerdict> {
  const p = await db().payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "created") return { ok: false, reason: "pay_expired_answer" };
  const account = await findAccount(p.orderId ?? (p.washOrderId ? `w${p.washOrderId}` : `s${p.subscriptionId}`), now);
  if (!account || !account.payable) return { ok: false, reason: "pay_expired_answer" };
  if (currency !== "UZS" || totalAmount !== somToTiyin(account.amount) || p.amount !== account.amount) return { ok: false, reason: "pay_amount_answer" };
  return { ok: true };
}

export function registerPaymentHandlers(bot: Bot<BotCtx>) {
  bot.on("pre_checkout_query", async (ctx) => {
    const q = ctx.preCheckoutQuery;
    let verdict: PreCheckoutVerdict;
    try {
      verdict = await checkPreCheckout(q.invoice_payload, q.currency, q.total_amount);
    } catch (e) {
      safeLog("pre_checkout check failed", e);
      verdict = { ok: false, reason: "pay_expired_answer" };
    }
    await db().payment.updateMany({ where: { id: q.invoice_payload }, data: { rawCallback: { push: { pre_checkout: { id: q.id, total_amount: q.total_amount, currency: q.currency, ok: verdict.ok } } } } }).catch(() => {});
    if (verdict.ok) await ctx.answerPreCheckoutQuery(true);
    else await ctx.answerPreCheckoutQuery(false, { error_message: bt(ctx.appUser?.language, verdict.reason) });
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const paymentId = sp.invoice_payload;
    // The charge id is unique: a duplicate update can't attach it twice.
    await db().payment.updateMany({
      where: { id: paymentId, providerTxId: null },
      data: { providerTxId: `tg:${sp.telegram_payment_charge_id}` },
    });
    await settlePayment(paymentId, {
      successful_payment: {
        currency: sp.currency,
        total_amount: sp.total_amount,
        telegram_payment_charge_id: sp.telegram_payment_charge_id,
        provider_payment_charge_id: sp.provider_payment_charge_id,
      },
    });
  });
}
