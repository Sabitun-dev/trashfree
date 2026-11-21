// Which provider handles a method, and whether it is configured.
import type { PaymentMethod } from "../../domain/types";
import { env } from "../env";
import type { AppSettings } from "../settings";

export type ProviderName = "click" | "payme";

export function providerFor(method: PaymentMethod, settings: AppSettings): ProviderName | null {
  if (method === "click" || method === "payme") return method;
  if (method === "card") return settings.cardProvider;
  return null;
}

export function paymentAvailable(method: PaymentMethod, settings: AppSettings): boolean {
  const p = providerFor(method, settings);
  if (!p) return false;
  if (settings.paymentMode[p] === "telegram") return !!(p === "click" ? env.tgProviderClick : env.tgProviderPayme);
  return p === "click" ? !!(env.clickServiceId && env.clickMerchantId && env.clickSecretKey) : !!(env.paymeMerchantId && (env.paymeKey || env.paymeTestKey));
}
