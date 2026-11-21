// Courier actions behind a small store interface, so the race and batch rules are unit-tested.
//
// Accept is "first courier wins": one conditional UPDATE … WHERE status = 'open'. Postgres locks the row
// for the first UPDATE; the second waits, re-checks the WHERE clause, finds the order no longer open and
// changes nothing. So exactly one courier gets the order, with no separate SELECT … FOR UPDATE needed.

export interface CompletableOrder {
  id: string;
  status: string;
  paymentMethod: string;
  priceTotal: number;
  courierId: number | null;
}

export interface CourierStore {
  /** Atomically: open → accepted for this courier. True if this call won. */
  tryAccept(orderId: string, courierId: number, cityIds: number[] | null, at: Date): Promise<boolean>;
  /** Atomically: (accepted | on_the_way) of this courier → completed. True if this call changed it. */
  tryComplete(orderId: string, courierId: number, cashCollected: number | null, at: Date): Promise<boolean>;
  findMine(orderIds: string[], courierId: number): Promise<CompletableOrder[]>;
}

export type AcceptResult = { ok: true } | { ok: false; code: "taken" };

export async function acceptOrder(store: CourierStore, orderId: string, courier: { id: number; cityIds: number[] | null }, at = new Date()): Promise<AcceptResult> {
  const won = await store.tryAccept(orderId, courier.id, courier.cityIds, at);
  return won ? { ok: true } : { ok: false, code: "taken" };
}

export class CompleteError extends Error {
  constructor(
    public code: "cash_not_confirmed" | "bad_status",
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export interface CompleteResult {
  completed: string[];
  skipped: string[];
  cashTotal: number;
}

/**
 * Completes one or more of the courier's orders. If any of them is cash, the courier must confirm the total cash
 * (`cashConfirmed` must equal the expected total) — this is the "Naqd olindi: 35 000 so'm" confirmation.
 */
export async function completeOrders(
  store: CourierStore,
  courierId: number,
  orderIds: string[],
  cashConfirmed: number | null,
  at = new Date(),
): Promise<CompleteResult> {
  const unique = [...new Set(orderIds)];
  const mine = (await store.findMine(unique, courierId)).filter((o) => o.status === "accepted" || o.status === "on_the_way");
  if (!mine.length) throw new CompleteError("bad_status");
  const expectedCash = mine.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.priceTotal, 0);
  if (expectedCash > 0 && cashConfirmed !== expectedCash) throw new CompleteError("cash_not_confirmed", { cashTotal: expectedCash });

  const completed: string[] = [];
  let cashTotal = 0;
  for (const o of mine) {
    const cash = o.paymentMethod === "cash" ? o.priceTotal : null;
    if (await store.tryComplete(o.id, courierId, cash, at)) {
      completed.push(o.id);
      cashTotal += cash ?? 0;
    }
  }
  return { completed, skipped: unique.filter((id) => !completed.includes(id)), cashTotal };
}
