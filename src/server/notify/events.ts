// Order events → notifications. Filled in phase 4.
import type { OrderFull } from "../orders/serialize";

export async function onOrderOpened(_order: OrderFull) {}
export async function onOrderCancelled(_order: OrderFull, _info: { by: "customer" | "admin" | "system"; reason?: string }) {}
