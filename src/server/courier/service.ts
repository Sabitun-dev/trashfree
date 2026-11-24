// Courier service on Postgres.
import { isAdmin } from "../../domain/permissions";
import { tashkentDate, tashkentInstant } from "../../domain/time";
import { audit } from "../audit";
import { db } from "../db";
import { bad, conflict, forbidden, notFound } from "../errors";
import { courierHandles } from "../../domain/services";
import { onOrderAccepted, onOrderCompleted, onOrderOnTheWay, onOrderReleased } from "../notify/events";
import { loadOrder } from "../orders/service";
import type { AuthUser } from "../users";
import { acceptOrder, CompleteError, completeOrders, type CourierStore } from "./core";

export const prismaCourierStore: CourierStore = {
  async tryAccept(orderId, courierId, cityIds, at) {
    const n = await db().order.updateMany({
      where: { id: orderId, status: "open", courierId: null, ...(cityIds ? { cityId: { in: cityIds } } : {}) },
      data: { status: "accepted", courierId, acceptedAt: at },
    });
    return n.count === 1;
  },
  async tryComplete(orderId, courierId, cashCollected, at) {
    const n = await db().order.updateMany({
      where: { id: orderId, courierId, status: { in: ["accepted", "on_the_way"] } },
      data: { status: "completed", completedAt: at, cashCollected },
    });
    return n.count === 1;
  },
  async findMine(orderIds, courierId) {
    return db().order.findMany({ where: { id: { in: orderIds }, courierId }, select: { id: true, status: true, paymentMethod: true, priceTotal: true, courierId: true } });
  },
};

/** Admins acting as couriers are still limited to their own cities for new orders. */
const cityScope = (u: AuthUser) => (isAdmin(u.role) && u.cityIds.length === 0 ? null : u.cityIds);

export async function courierAccept(user: AuthUser, orderId: string) {
  if (!courierHandles(user.role, user.services, "trash")) throw forbidden("service_not_allowed");
  const res = await acceptOrder(prismaCourierStore, orderId, { id: user.id, cityIds: cityScope(user) });
  if (!res.ok) {
    const o = await db().order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!o) throw notFound();
    throw conflict("taken");
  }
  const order = (await loadOrder(orderId))!;
  await onOrderAccepted(order);
  return order;
}

export async function courierOnTheWay(user: AuthUser, orderId: string) {
  const n = await db().order.updateMany({ where: { id: orderId, courierId: user.id, status: "accepted" }, data: { status: "on_the_way", onTheWayAt: new Date() } });
  if (n.count !== 1) throw conflict("bad_status");
  const order = (await loadOrder(orderId))!;
  await onOrderOnTheWay(order);
  return order;
}

/** The courier gives an accepted order back; it becomes open for other couriers again. */
export async function courierGiveBack(user: AuthUser, orderId: string) {
  const n = await db().order.updateMany({
    where: { id: orderId, courierId: user.id, status: "accepted" },
    data: { status: "open", courierId: null, acceptedAt: null },
  });
  if (n.count !== 1) throw conflict("bad_status");
  await audit({ actorId: user.id, action: "order.give_back", entity: "order", entityId: orderId });
  const order = (await loadOrder(orderId))!;
  await onOrderReleased(order);
  return order;
}

export async function courierComplete(user: AuthUser, orderIds: string[], cashConfirmed: number | null, photoId?: string | null) {
  let res;
  try {
    res = await completeOrders(prismaCourierStore, user.id, orderIds, cashConfirmed);
  } catch (e) {
    if (e instanceof CompleteError) throw e.code === "bad_status" ? conflict("bad_status") : bad(e.code, e.data);
    throw e;
  }
  if (photoId && res.completed.length === 1) {
    await db().orderPhoto.updateMany({ where: { id: photoId, uploaderId: user.id, orderId: null, kind: "completion" }, data: { orderId: res.completed[0] } });
  }
  for (const id of res.completed) {
    const o = await loadOrder(id);
    if (o) await onOrderCompleted(o);
  }
  return res;
}

export async function courierToday(user: AuthUser, now = new Date()) {
  const start = tashkentInstant(tashkentDate(now), 0);
  const [doneToday, cashToday, onlineToday, outstanding, wDone, wCashToday, wOutstanding] = await Promise.all([
    db().order.count({ where: { courierId: user.id, status: "completed", completedAt: { gte: start } } }),
    db().order.aggregate({ where: { courierId: user.id, status: "completed", completedAt: { gte: start }, paymentMethod: "cash" }, _sum: { cashCollected: true } }),
    db().order.aggregate({ where: { courierId: user.id, status: "completed", completedAt: { gte: start }, paymentStatus: "paid" }, _sum: { priceTotal: true }, _count: true }),
    db().order.aggregate({ where: { courierId: user.id, status: "completed", paymentMethod: "cash", cashHandoverId: null, cashCollected: { not: null } }, _sum: { cashCollected: true }, _count: true }),
    // Carpet & curtain: deliveries and the cash the courier recorded himself (never the price).
    db().washOrder.count({ where: { courierId: user.id, status: { in: ["delivered_paid", "closed"] }, statusAt: { gte: start } } }),
    db().washOrder.aggregate({ where: { courierId: user.id, status: { in: ["delivered_paid", "closed"] }, statusAt: { gte: start }, cashCollected: { not: null } }, _sum: { cashCollected: true } }),
    db().washOrder.aggregate({ where: { courierId: user.id, status: { in: ["delivered_paid", "closed"] }, cashHandoverId: null, cashCollected: { not: null } }, _sum: { cashCollected: true }, _count: true }),
  ]);
  return {
    doneToday: doneToday + wDone,
    cashToday: (cashToday._sum.cashCollected ?? 0) + (wCashToday._sum.cashCollected ?? 0),
    onlineToday: onlineToday._sum.priceTotal ?? 0,
    onlineCount: onlineToday._count,
    cashToHandOver: (outstanding._sum.cashCollected ?? 0) + (wOutstanding._sum.cashCollected ?? 0),
    cashOrders: outstanding._count + wOutstanding._count,
  };
}
