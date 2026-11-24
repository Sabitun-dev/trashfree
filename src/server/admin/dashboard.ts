// Dashboard figures. Every figure maps to a filter of the admin order list, so numbers can be checked by hand.
import { Prisma } from "@prisma/client";
import { addDays, tashkentDate, tashkentInstant } from "../../domain/time";
import { db } from "../db";
import { measurementAccuracy, washReport, type ServiceFilter } from "../wash/reports";
import { outstandingCash } from "./orders";

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

/**
 * Dashboard with a service filter: trash, carpet, curtain or all.
 * "trash" returns exactly the trash numbers as before; carpet/curtain add washer payouts, courier pay and margin.
 */
export async function dashboardByService(period: Period, service: ServiceFilter, cityId?: number, now = new Date()) {
  const range = periodRange(period, now);
  const washService = service === "carpet" || service === "curtain" ? service : null;
  const [trash, wash, accuracy, cash, byService] = await Promise.all([
    service === "all" || service === "trash" ? dashboard(period, cityId, now) : null,
    service === "trash" ? null : washReport(range.from, range.to, washService, cityId),
    service === "trash" ? [] : measurementAccuracy(range.from, range.to, washService),
    outstandingCash(),
    db().washOrder.groupBy({ by: ["service"], where: { createdAt: { gte: range.from, lt: range.to }, ...(cityId ? { cityId } : {}) }, _count: true }),
  ]);
  const revenue: Record<string, number> = {};
  for (const src of [trash?.revenue, wash?.revenue]) for (const [k, v] of Object.entries(src ?? {})) revenue[k] = (revenue[k] ?? 0) + v;
  const revenueTotal = Object.values(revenue).reduce((a, b) => a + b, 0);
  const washerPayouts = wash?.washerPayouts ?? 0;
  const courierPay = wash?.courierPay ?? 0;
  const perDay = (trash?.perDay ?? []).map((d) => ({ ...d }));
  if (!trash) for (let d = range.fromDate; d <= range.toDate; d = addDays(d, 1)) perDay.push({ day: d, count: 0 });
  for (const day of wash?.createdDays ?? []) {
    const row = perDay.find((p) => p.day === day);
    if (row) row.count++;
  }
  const trashCount = trash ? trash.orders.total : 0;
  return {
    period,
    service,
    fromDate: range.fromDate,
    toDate: range.toDate,
    orders: {
      total: (trash?.orders.total ?? 0) + (wash?.orders.total ?? 0),
      completed: (trash?.orders.completed ?? 0) + (wash?.orders.completed ?? 0),
      pending: (trash?.orders.pending ?? 0) + (wash?.orders.pending ?? 0),
      awaitingPayment: trash?.orders.awaitingPayment ?? 0,
      cancelled: (trash?.orders.cancelled ?? 0) + (wash?.orders.cancelled ?? 0),
    },
    revenue,
    revenueTotal,
    washerPayouts,
    courierPay,
    margin: revenueTotal - washerPayouts - courierPay,
    cashNotHandedOver: cash.reduce((s, c) => s + c.amount, 0),
    cashNotHandedOverOrders: cash.reduce((s, c) => s + c.orders, 0),
    cashByCourier: cash,
    byService: [
      ...(service === "all" || service === "trash" ? [{ service: "trash", count: trashCount }] : []),
      ...byService.filter((r) => service === "all" || r.service === service).map((r) => ({ service: r.service, count: r._count })),
    ],
    byType: trash?.byType ?? [],
    byCity: trash?.byCity ?? [],
    couriers: trash?.couriers ?? [],
    measurement: accuracy,
    perDay,
  };
}
