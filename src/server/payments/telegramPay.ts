// Telegram Payments (Click / Payme connected in BotFather). The card is entered in Telegram's own sheet.
// Telegram amounts for UZS are in the smallest unit (×100), like Payme's tiyin.
import { somToTiyin } from "../../domain/money";
import { tg } from "../bot/telegram";
import { db } from "../db";
import { env } from "../env";
import { bad } from "../errors";
import type { AppSettings } from "../settings";
import { receiptItems, type Account } from "./accounts";
import type { ProviderName } from "./availability";

export function providerToken(p: ProviderName) {
  return p === "click" ? env.tgProviderClick : env.tgProviderPayme;
}

export async function createTelegramInvoice(opts: {
  account: Account;
  provider: ProviderName;
  method: "click" | "payme" | "card" | "subscription";
  userId: number;
  title: string;
  description: string;
  settings: AppSettings;
}): Promise<string> {
  const token = providerToken(opts.provider);
  if (!token) throw bad("payment_unavailable");
  const payment = await db().payment.create({
    data: {
      userId: opts.userId,
      orderId: opts.account.kind === "order" ? String(opts.account.refId) : null,
      subscriptionId: opts.account.kind === "subscription" ? Number(opts.account.refId) : null,
      washOrderId: opts.account.kind === "wash" ? String(opts.account.refId) : null,
      provider: `telegram_${opts.provider}`,
      method: opts.method === "subscription" ? opts.provider : opts.method,
      amount: opts.account.amount,
      status: "created",
    },
  });
  const items = await receiptItems(opts.account);
  // Fiscal data for the provider's receipt (IKPU + package code). Confirm the exact format with your provider.
  const providerData = opts.settings.telegramFiscalData
    ? JSON.stringify({ receipt: { items: items.map((i) => ({ ...i, price: somToTiyin(i.price) })) } })
    : undefined;
  return tg().createInvoiceLink(opts.title.slice(0, 32), opts.description.slice(0, 255), payment.id, token, "UZS", [{ label: opts.title.slice(0, 32), amount: somToTiyin(opts.account.amount) }], {
    provider_data: providerData,
  });
}
