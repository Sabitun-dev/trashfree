// Admin order tools: filters/search, reassign, CSV export to the admin's chat, cash handovers.
import { Prisma } from "@prisma/client";
import { InputFile } from "grammy";
import { z } from "zod";
import { ORDER_STATUSES, PAYMENT_METHODS } from "../../domain/types";
import { tashkentInstant, addDays } from "../../domain/time";
import { audit } from "../audit";
import { tg } from "../bot/telegram";
import { db } from "../db";
import { bad, conflict, notFound } from "../errors";
import { onOrderAssigned } from "../notify/events";
import { notify } from "../notify/send";
import { loadOrder } from "../orders/service";
import { orderInclude } from "../orders/serialize";
import type { AuthUser } from "../users";

export const orderFilterSchema = z.object({
  status: z.string().optional(), // comma separated
  cityId: z.coerce.number().int().optional(),
  courierId: z.coerce.number().int().optional(),
  customerId: z.coerce.number().int().optional(),
  trashTypeId: z.coerce.number().int().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // created, Tashkent date
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashOutstanding: z.enum(["1"]).optional(),
  refundNeeded: z.enum(["1"]).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(40).optional(),
});
export type OrderFilter = z.infer<typeof orderFilterSchema>;

export function orderWhere(f: OrderFilter): Prisma.OrderWhereInput {
  const statuses = f.status?.split(",").filter((s): s is (typeof ORDER_STATUSES)[number] => (ORDER_STATUSES as readonly string[]).includes(s));
  const and: Prisma.OrderWhereInput[] = [];
  if (statuses?.length) and.push({ status: { in: statuses } });
  if (f.cityId) and.push({ cityId: f.cityId });
  if (f.courierId) and.push({ courierId: f.courierId });
  if (f.customerId) and.push({ customerId: f.customerId });
  if (f.trashTypeId) and.push({ trashTypeId: f.trashTypeId });
  if (f.method) and.push({ paymentMethod: f.method });
  if (f.dateFrom) and.push({ createdAt: { gte: tashkentInstant(f.dateFrom, 0) } });
  if (f.dateTo) and.push({ createdAt: { lt: tashkentInstant(addDays(f.dateTo, 1), 0) } });
  if (f.completedFrom) and.push({ completedAt: { gte: tashkentInstant(f.completedFrom, 0) } });
  if (f.cashOutstanding) and.push({ paymentMethod: "cash", status: "completed", cashHandoverId: null, cashCollected: { not: null } });
  if (f.refundNeeded) and.push({ status: { in: ["cancelled", "expired"] }, paymentStatus: "paid", refundNote: null });
  if (f.q) {
    const q = f.q.replace(/^#/, "");
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        ...(/^\d{1,9}$/.test(q) ? [{ number: Number(q) }] : []),
        ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits } } }] : []),
        { address: { contains: q, mode: "insensitive" as const } },
        { customer: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listOrders(f: OrderFilter, take = 30) {
  return db().order.findMany({
    where: orderWhere(f),
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
}

/** Reassign to another courier (or unassign with null). Required reason, audit-logged, everyone notified. */
export async function reassign(admin: AuthUser, orderId: string, courierId: number | null, reason: string) {
  const o = await db().order.findUnique({ where: { id: orderId } });
  if (!o) throw notFound();
  if (!["open", "accepted", "on_the_way"].includes(o.status)) throw conflict("bad_status");
  if (courierId) {
    const c = await db().user.findUnique({ where: { id: courierId }, include: { courierCities: true } });
    if (!c || !(c.role === "courier" || c.role === "admin" || c.role === "owner") || c.blocked) throw bad("invalid");
  }
  const n = await db().order.updateMany({
    where: { id: orderId, status: o.status, courierId: o.courierId },
    data: courierId ? { courierId, status: o.status === "open" ? "accepted" : o.status, acceptedAt: o.acceptedAt ?? new Date() } : { courierId: null, status: "open", acceptedAt: null, onTheWayAt: null },
  });
  if (n.count !== 1) throw conflict("bad_status");
  await audit({ actorId: admin.id, action: courierId ? "order.reassign" : "order.unassign", entity: "order", entityId: orderId, before: { courierId: o.courierId, status: o.status }, after: { courierId }, reason });
  const full = (await loadOrder(orderId))!;
  await onOrderAssigned(full, o.courierId);
  return full;
}

export async function setRefundNote(admin: AuthUser, orderId: string, note: string) {
  const o = await db().order.findUnique({ where: { id: orderId } });
  if (!o) throw notFound();
  await db().order.update({ where: { id: orderId }, data: { refundNote: note } });
  await audit({ actorId: admin.id, action: "order.refund_manual", entity: "order", entityId: orderId, before: { refundNote: o.refundNote }, after: { refundNote: note }, reason: note });
  return (await loadOrder(orderId))!;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function exportCsv(admin: AuthUser, f: OrderFilter) {
  const rows = await db().order.findMany({
    where: orderWhere({ ...f, cursor: undefined }),
    include: { customer: true, courier: true, city: true, trashType: true, packageSize: true, slot: true },
    orderBy: { createdAt: "desc" },
    take: 10_000,
  });
  const header = ["number", "created_at", "status", "city", "address", "trash_type", "package_size", "quantity", "pickup_date", "slot", "price_total", "payment_method", "payment_status", "customer", "customer_phone", "courier", "completed_at", "cash_collected", "rating"];
  const lines = [header.join(",")];
  for (const o of rows) {
    lines.push(
      [
        o.number,
        o.createdAt,
        o.status,
        o.city.code,
        o.address,
        o.trashType.code,
        o.packageSize.code,
        o.quantity,
        o.pickupDate,
        `${o.slot.startMinute / 60}-${o.slot.endMinute / 60}`,
        o.priceTotal,
        o.paymentMethod,
        o.paymentStatus,
        o.customer.name,
        o.customer.phone,
        o.courier?.name,
        o.completedAt,
        o.cashCollected,
        o.rating,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\n");
  const name = `trashfree-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  await tg().sendDocument(Number(admin.telegramId), new InputFile(new TextEncoder().encode(csv), name), { caption: `${rows.length} orders` });
  await audit({ actorId: admin.id, action: "orders.export", entity: "order", after: { count: rows.length, filter: f } });
  return { count: rows.length };
}

// ---- Cash handovers ----
export async function outstandingCash() {
  const rows = await db().order.groupBy({
    by: ["courierId"],
    where: { paymentMethod: "cash", status: "completed", cashHandoverId: null, cashCollected: { not: null }, courierId: { not: null } },
    _sum: { cashCollected: true },
    _count: true,
  });
  const users = await db().user.findMany({ where: { id: { in: rows.map((r) => r.courierId!) } }, select: { id: true, name: true, phone: true } });
  return rows.map((r) => ({ courier: users.find((u) => u.id === r.courierId)!, amount: r._sum.cashCollected ?? 0, orders: r._count })).sort((a, b) => b.amount - a.amount);
}

/** "Naqd topshirildi": the admin confirms the exact amount they received. Audit-logged. */
export async function confirmHandover(admin: AuthUser, courierId: number, amount: number) {
  const result = await db().$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { courierId, paymentMethod: "cash", status: "completed", cashHandoverId: null, cashCollected: { not: null } }, select: { id: true, cashCollected: true } });
    const total = orders.reduce((s, o) => s + (o.cashCollected ?? 0), 0);
    if (!orders.length) throw conflict("bad_status");
    if (total !== amount) throw conflict("bad_status", { amount: total });
    const h = await tx.cashHandover.create({ data: { courierId, amount: total, confirmedById: admin.id } });
    await tx.order.updateMany({ where: { id: { in: orders.map((o) => o.id) }, cashHandoverId: null }, data: { cashHandoverId: h.id } });
    await audit({ actorId: admin.id, action: "cash.handover", entity: "user", entityId: courierId, after: { amount: total, orders: orders.length, handoverId: h.id } }, tx);
    return h;
  });
  await notify({ userId: courierId, type: "cash_handover", params: { total: `${result.amount.toLocaleString("ru-RU").replace(/ /g, " ")} so'm` }, screen: { name: "courier" }, dedupKey: `handover:${result.id}` });
  return result;
}

export async function handoverHistory() {
  return db().cashHandover.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { courier: { select: { name: true } }, confirmedBy: { select: { name: true } }, _count: { select: { orders: true } } } });
}
