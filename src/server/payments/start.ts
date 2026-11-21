// Starts an online payment for an order. Filled in phase 5.
import { bad } from "../errors";
import type { OrderFull } from "../orders/serialize";
import type { AuthUser } from "../users";

export type PaymentStart = { mode: "telegram"; invoiceUrl: string } | { mode: "merchant"; url: string };

export async function startOrderPayment(_order: OrderFull, _user: AuthUser): Promise<PaymentStart> {
  throw bad("payment_unavailable");
}
