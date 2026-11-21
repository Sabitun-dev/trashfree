// Subscriptions: monthly pickup packs, paid each month (no auto-renew).
import { pickupsLeft } from "../../domain/subscription";
import { db, type Tx } from "../db";

export async function activeSubscription(userId: number, tx?: Tx) {
  const now = new Date();
  return (tx ?? db()).subscription.findFirst({
    where: { userId, status: "active", periodEnd: { gt: now } },
    orderBy: { periodEnd: "desc" },
    include: { plan: true },
  });
}

type SubWithPlan = NonNullable<Awaited<ReturnType<typeof activeSubscription>>>;

export function serializeSubscription(s: SubWithPlan) {
  return {
    id: s.id,
    status: s.status,
    plan: { id: s.plan.id, code: s.plan.code, nameUz: s.plan.nameUz, nameRu: s.plan.nameRu, nameEn: s.plan.nameEn, pickups: s.plan.pickups },
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    pickupsTotal: s.pickupsTotal,
    pickupsUsed: s.pickupsUsed,
    left: pickupsLeft(s),
  };
}

/**
 * Atomically use one pickup. The WHERE clause makes it safe under concurrency:
 * two parallel orders can never both take the last pickup.
 */
export async function consumePickupTx(tx: Tx, subscriptionId: number): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "Subscription" SET "pickupsUsed" = "pickupsUsed" + 1
    WHERE id = ${subscriptionId} AND status = 'active' AND "periodEnd" > now() AND "pickupsUsed" < "pickupsTotal"`;
  return n === 1;
}

export async function returnPickupTx(tx: Tx, subscriptionId: number) {
  await tx.$executeRaw`UPDATE "Subscription" SET "pickupsUsed" = GREATEST(0, "pickupsUsed" - 1) WHERE id = ${subscriptionId}`;
}
