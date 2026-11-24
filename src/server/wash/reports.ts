// Admin reports for carpet & curtain: revenue, washer payouts, courier pay, margin, measurement accuracy.
import { areaDiffPct } from "../../domain/wash";
import { db } from "../db";

export type ServiceFilter = "all" | "trash" | "carpet" | "curtain";

export async function washReport(from: Date, to: Date, service: "carpet" | "curtain" | null, cityId?: number) {
  const where = {
    createdAt: { gte: from, lt: to },
    ...(service ? { service } : {}),
    ...(cityId ? { cityId } : {}),
  };
  const [byStatus, delivered, online, cash, perDay] = await Promise.all([
    db().washOrder.groupBy({ by: ["status"], where, _count: true }),
    // Money is counted when the order is delivered (that's when the washer and courier are owed).
    db().washOrder.aggregate({
      where: { status: { in: ["delivered_paid", "closed"] }, statusAt: { gte: from, lt: to }, ...(service ? { service } : {}), ...(cityId ? { cityId } : {}) },
      _sum: { total: true, washerPayout: true, courierPay: true },
      _count: true,
    }),
    db().payment.groupBy({ by: ["method"], where: { status: "paid", paidAt: { gte: from, lt: to }, washOrderId: { not: null }, ...(service || cityId ? { washOrder: { ...(service ? { service } : {}), ...(cityId ? { cityId } : {}) } } : {}) }, _sum: { amount: true } }),
    db().washOrder.aggregate({ where: { cashCollected: { not: null }, statusAt: { gte: from, lt: to }, ...(service ? { service } : {}), ...(cityId ? { cityId } : {}) }, _sum: { cashCollected: true } }),
    db().washOrder.findMany({ where, select: { createdAt: true } }),
  ]);
  const count = (s: string[]) => byStatus.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count, 0);
  const revenue: Record<string, number> = {};
  for (const p of online) revenue[p.method] = (revenue[p.method] ?? 0) + (p._sum.amount ?? 0);
  revenue.cash = cash._sum.cashCollected ?? 0;
  const washerPayouts = delivered._sum.washerPayout ?? 0;
  const courierPay = delivered._sum.courierPay ?? 0;
  const deliveredTotal = delivered._sum.total ?? 0;
  return {
    orders: {
      total: byStatus.reduce((n, r) => n + r._count, 0),
      completed: count(["delivered_paid", "closed"]),
      pending: count(["created", "courier_assigned", "measured", "quote_sent", "client_confirmed", "picked_up", "at_washer", "washed", "out_for_delivery"]),
      cancelled: count(["cancelled"]),
    },
    revenue,
    deliveredTotal,
    washerPayouts,
    courierPay,
    margin: deliveredTotal - washerPayouts - courierPay,
    createdDays: perDay.map((o) => new Date(o.createdAt.getTime() + 5 * 3600_000).toISOString().slice(0, 10)),
  };
}

/** Each courier's average difference from the washer's measurements (orders the washer has re-measured). */
export async function measurementAccuracy(from: Date, to: Date, service: "carpet" | "curtain" | null) {
  const orders = await db().washOrder.findMany({
    where: { courierId: { not: null }, statusAt: { gte: from, lt: to }, ...(service ? { service } : {}), items: { some: { washerAreaTenths: { not: null } } } },
    select: { courierId: true, courier: { select: { name: true } }, items: { select: { areaTenths: true, washerAreaTenths: true } } },
  });
  const per = new Map<number, { name: string; diffs: number[] }>();
  for (const o of orders) {
    const courierArea = o.items.reduce((s, i) => s + i.areaTenths, 0);
    const washerArea = o.items.reduce((s, i) => s + (i.washerAreaTenths ?? i.areaTenths), 0);
    const cur = per.get(o.courierId!) ?? { name: o.courier?.name ?? "", diffs: [] };
    cur.diffs.push(areaDiffPct(courierArea, washerArea));
    per.set(o.courierId!, cur);
  }
  return [...per.entries()]
    .map(([courierId, v]) => ({ courierId, name: v.name, orders: v.diffs.length, avgDiffPct: Math.round((v.diffs.reduce((a, b) => a + b, 0) / v.diffs.length) * 10) / 10 }))
    .sort((a, b) => b.avgDiffPct - a.avgDiffPct);
}
