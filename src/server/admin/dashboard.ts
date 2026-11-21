// Dashboard figures. Every figure maps to a filter of the admin order list, so numbers can be checked by hand.
import { Prisma } from "@prisma/client";
import { addDays, tashkentDate, tashkentInstant } from "../../domain/time";
import { db } from "../db";

export type Period = "today" | "week" | "month";

export function periodRange(period: Period, now = new Date()) {
  const today = tashkentDate(now);
  const fromDate = period === "today" ? today : addDays(today, period === "week" ? -6 : -29);
  return { fromDate, toDate: today, from: tashkentInstant(fromDate, 0), to: tashkentInstant(addDays(today, 1), 0) };
}

export async function dashboard(period: Period, cityId?: number, now = new Date()) {
  const { from, to, fromDate, toDate } = periodRange(period, now);
  const where: Prisma.OrderWhereInput = { createdAt: { gte: from, lt: to }, ...(cityId ? { cityId } : {}) };
  const cityFilter = cityId ? Prisma.sql`AND o."cityId" = ${cityId}` : Prisma.empty;

  const [byStatus, byType, byCity, payments, cashCollected, cashOut, couriers, perDay] = await Promise.all([
    db().order.groupBy({ by: ["status"], where, _count: true }),
    db().order.groupBy({ by: ["trashTypeId"], where, _count: true }),
    db().order.groupBy({ by: ["cityId"], where, _count: true }),
    // Online money: paid payments in the period (orders and subscription sales).
    db().payment.groupBy({ by: ["method"], where: { status: "paid", paidAt: { gte: from, lt: to }, ...(cityId ? { order: { cityId } } : {}) }, _sum: { amount: true }, _count: true }),
    // Cash: collected by couriers on completion in the period.
    db().order.aggregate({ where: { paymentMethod: "cash", status: "completed", completedAt: { gte: from, lt: to }, ...(cityId ? { cityId } : {}) }, _sum: { cashCollected: true }, _count: true }),
    // Cash not yet handed over (all time).
    db().order.aggregate({ where: { paymentMethod: "cash", status: "completed", cashHandoverId: null, cashCollected: { not: null }, ...(cityId ? { cityId } : {}) }, _sum: { cashCollected: true }, _count: true }),
    db().$queryRaw<{ courierId: number; name: string; pickups: bigint; avgMinutes: number | null; avgRating: number | null }[]>`
      SELECT o."courierId", u.name, COUNT(*) AS pickups,
             AVG(EXTRACT(EPOCH FROM (o."completedAt" - o."createdAt")) / 60) AS "avgMinutes",
             AVG(o.rating) AS "avgRating"
      FROM "Order" o JOIN "User" u ON u.id = o."courierId"
      WHERE o.status = 'completed' AND o."completedAt" >= ${from} AND o."completedAt" < ${to} ${cityFilter}
      GROUP BY o."courierId", u.name ORDER BY pickups DESC LIMIT 20`,
    db().$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(o."createdAt" + interval '5 hours', 'YYYY-MM-DD') AS day, COUNT(*) AS count
      FROM "Order" o WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} ${cityFilter}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const count = (s: string[]) => byStatus.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count, 0);
  const revenue: Record<string, number> = {};
  for (const p of payments) revenue[p.method] = (revenue[p.method] ?? 0) + (p._sum.amount ?? 0);
  revenue.cash = cashCollected._sum.cashCollected ?? 0;

  const days: { day: string; count: number }[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) days.push({ day: d, count: Number(perDay.find((x) => x.day === d)?.count ?? 0) });

  return {
    period,
    fromDate,
    toDate,
    orders: {
      total: count(["awaiting_payment", "open", "accepted", "on_the_way", "completed", "cancelled", "expired"]),
      completed: count(["completed"]),
      pending: count(["open", "accepted", "on_the_way"]),
      awaitingPayment: count(["awaiting_payment"]),
      cancelled: count(["cancelled", "expired"]),
    },
    revenue,
    revenueTotal: Object.values(revenue).reduce((a, b) => a + b, 0),
    cashNotHandedOver: cashOut._sum.cashCollected ?? 0,
    cashNotHandedOverOrders: cashOut._count,
    byType: byType.map((r) => ({ trashTypeId: r.trashTypeId, count: r._count })).sort((a, b) => b.count - a.count),
    byCity: byCity.map((r) => ({ cityId: r.cityId, count: r._count })).sort((a, b) => b.count - a.count),
    couriers: couriers.map((c) => ({
      courierId: c.courierId,
      name: c.name,
      pickups: Number(c.pickups),
      avgMinutes: c.avgMinutes == null ? null : Math.round(Number(c.avgMinutes)),
      avgRating: c.avgRating == null ? null : Math.round(Number(c.avgRating) * 10) / 10,
    })),
    perDay: days,
  };
}
