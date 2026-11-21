// Opens a payment: Telegram's own payment sheet (openInvoice) or the provider's checkout page.
import { openInvoice, openLink } from "./tg";
import type { CreateOrderResult } from "./types";

export type PayOutcome = "paid" | "cancelled" | "failed" | "pending";

export async function runPayment(payment: CreateOrderResult["payment"]): Promise<PayOutcome> {
  if (!payment) return "pending";
  if (payment.mode === "telegram") return openInvoice(payment.invoiceUrl);
  openLink(payment.url);
  return "pending";
}
