// One PaymentProvider interface: Telegram Payments (Click/Payme in BotFather) or the direct merchant APIs.
import { localName, type PaymentMethod } from "../../domain/types";
import { formatSlot } from "../../domain/time";
import { appLink } from "../bot/telegram";
import { asLang, bt } from "../bot/texts";
import { catalog } from "../catalog";
import { db } from "../db";
import { env } from "../env";
import { bad } from "../errors";
import type { OrderFull } from "../orders/serialize";
import { getSettings, type AppSettings } from "../settings";
import type { AuthUser } from "../users";
import { findAccount, subAccountId, type Account } from "./accounts";
import { paymentAvailable, providerFor, type ProviderName } from "./availability";
import { clickCheckoutUrl } from "./click";
import { paymeCheckoutUrl } from "./payme";
import { createTelegramInvoice } from "./telegramPay";

export type PaymentStart = { mode: "telegram"; invoiceUrl: string } | { mode: "merchant"; url: string };

interface StartContext {
  account: Account;
  user: AuthUser;
  method: PaymentMethod;
  title: string;
  description: string;
  returnUrl: string;
  settings: AppSettings;
}

export interface PaymentProvider {
  start(ctx: StartContext): Promise<PaymentStart>;
}

const telegramProvider = (name: ProviderName): PaymentProvider => ({
  async start(ctx) {
    const invoiceUrl = await createTelegramInvoice({
      account: ctx.account,
      provider: name,
      method: ctx.method === "subscription" ? name : (ctx.method as "click" | "payme" | "card"),
      userId: ctx.user.id,
      title: ctx.title,
      description: ctx.description,
      settings: ctx.settings,
    });
    return { mode: "telegram", invoiceUrl };
  },
});

const paymeMerchant: PaymentProvider = {
  async start(ctx) {
    if (!env.paymeMerchantId) throw bad("payment_unavailable");
    return {
      mode: "merchant",
      url: paymeCheckoutUrl({ merchantId: env.paymeMerchantId, accountId: ctx.account.id, amountSom: ctx.account.amount, lang: ctx.user.language, returnUrl: ctx.returnUrl, test: ctx.settings.paymeTestMode }),
    };
  },
};

const clickMerchant: PaymentProvider = {
  async start(ctx) {
    if (!env.clickServiceId || !env.clickMerchantId) throw bad("payment_unavailable");
    return {
      mode: "merchant",
      url: clickCheckoutUrl({ serviceId: env.clickServiceId, merchantId: env.clickMerchantId, merchantUserId: env.clickMerchantUserId, accountId: ctx.account.id, amountSom: ctx.account.amount, returnUrl: ctx.returnUrl }),
    };
  },
};

export function getProvider(name: ProviderName, settings: AppSettings): PaymentProvider {
  if (settings.paymentMode[name] === "telegram") return telegramProvider(name);
  return name === "payme" ? paymeMerchant : clickMerchant;
}

export async function startOrderPayment(order: OrderFull, user: AuthUser): Promise<PaymentStart> {
  const settings = await getSettings();
  const provider = providerFor(order.paymentMethod, settings);
  if (!provider || !paymentAvailable(order.paymentMethod, settings)) throw bad("payment_unavailable");
  const account = await findAccount(order.id);
  if (!account || !account.payable) throw bad("bad_status");
  const lang = asLang(user.language);
  const cat = await catalog();
  const type = cat.trashTypes.find((t) => t.id === order.trashTypeId);
  const size = cat.packageSizes.find((t) => t.id === order.packageSizeId);
  return getProvider(provider, settings).start({
    account,
    user,
    method: order.paymentMethod,
    title: bt(lang, "invoice_title", { n: order.number }),
    description: bt(lang, "invoice_desc", {
      type: type ? localName(type, lang) : "",
      size: size ? localName(size, lang) : "",
      qty: order.quantity,
      date: order.pickupDate.split("-").reverse().join("."),
      slot: formatSlot(order.slot.startMinute, order.slot.endMinute),
    }),
    returnUrl: await appLink({ name: "order", id: order.id }),
    settings,
  });
}

export async function startSubscriptionPayment(subId: number, user: AuthUser, method: PaymentMethod): Promise<PaymentStart> {
  const settings = await getSettings();
  const provider = providerFor(method, settings);
  if (!provider || !paymentAvailable(method, settings)) throw bad("payment_unavailable");
  const account = await findAccount(subAccountId(subId));
  if (!account || !account.payable) throw bad("bad_status");
  const lang = asLang(user.language);
  const sub = (await db().subscription.findUnique({ where: { id: subId }, include: { plan: true } }))?.plan;
  return getProvider(provider, settings).start({
    account,
    user,
    method,
    title: bt(lang, "sub_invoice_title", { plan: sub ? localName(sub, lang) : "" }),
    description: bt(lang, "sub_invoice_desc", { pickups: sub?.pickups ?? "" }),
    returnUrl: await appLink({ name: "plans" }),
    settings,
  });
}
