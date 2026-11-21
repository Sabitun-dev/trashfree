// Order events → notifications. Filled in phase 4.
import type { OrderFull } from "../orders/serialize";

export async function onOrderOpened(_order: OrderFull) {}
export async function onOrderCancelled(_order: OrderFull, _info: { by: "customer" | "admin" | "system"; reason?: string }) {}
export async function onOrderAccepted(_order: OrderFull) {}
export async function onOrderOnTheWay(_order: OrderFull) {}
export async function onOrderCompleted(_order: OrderFull) {}
export async function onOrderReleased(_order: OrderFull) {}
