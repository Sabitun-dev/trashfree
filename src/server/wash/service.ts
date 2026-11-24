// Carpet & curtain orders: create, take, measure → quote → confirm/decline, pick up.
// Every status change goes through transition(): a conditional UPDATE (only if still in the expected status)
// plus a log row with who and when — so two people can never move the same order at once.
import { z } from "zod";
import { findServiceCity } from "../../domain/geo";
import { courierHandles, type ServiceCode } from "../../domain/services";
import { dateInWindow, slotAvailability } from "../../domain/slots";
import {
  canWashTransition,
  courierCanMeasure,
  quoteWash,
  WASH_FINAL,
  WashPriceError,
  washLabel,
  washNumber,
  type WashActor,
  type WashService,
  type WashStatus,
} from "../../domain/wash";
import { audit } from "../audit";
import { catalog } from "../catalog";
import { db, type Tx } from "../db";
import { bad, conflict, forbidden, notFound, tooMany } from "../errors";
import { assertServiceOpen } from "../services";
import { getSettings } from "../settings";
import type { AuthUser } from "../users";
import { alertAdmins, notifyQuoteAnswer, notifyWashAssigned, notifyWashCancelled, notifyWashPicked, notifyWashPlaced, sendQuoteToClient } from "./notify";
import { serializeWash, washInclude, washViewFor, type WashOrderFull } from "./serialize";
import { currentWashSettings, toPricing } from "./settings";

export async function loadWash(id: string, tx?: Tx): Promise<WashOrderFull | null> {
  return (tx ?? db()).washOrder.findUnique({ where: { id }, include: washInclude });
}

const actorOf = (u: AuthUser): WashActor => (u.role === "admin" || u.role === "owner" ? "admin" : u.role === "courier" ? "courier" : u.role === "washer" ? "washer" : "customer");

/**
 * Moves an order from one status to another, only if it is still in `from`. Logs who and when.
 * Returns false when someone else changed it first.
 */
export async function transition(
  tx: Tx,
  orderId: string,
  from: WashStatus | WashStatus[],
  to: WashStatus,
  actorId: number | null,
  data: Record<string, unknown> = {},
  note?: string,
): Promise<boolean> {
  const fromList = Array.isArray(from) ? from : [from];
  const current = await tx.washOrder.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!current || !fromList.includes(current.status as WashStatus)) return false;
  const n = await tx.washOrder.updateMany({ where: { id: orderId, status: current.status }, data: { ...data, status: to, statusAt: new Date() } });
  if (n.count !== 1) return false;
  await tx.washStatusLog.create({ data: { orderId, from: current.status, to, actorId, note: note ?? null } });
  return true;
}

function assertCan(from: WashStatus, to: WashStatus, actor: WashActor) {
  if (!canWashTransition(from, to, actor)) throw conflict("bad_status");
}

// ---------------- Client ----------------

export const createWashSchema = z.object({
  service: z.enum(["carpet", "curtain"]),
  idempotencyKey: z.string().min(8).max(80),
  lat: z.number().finite(),
  lng: z.number().finite(),
  address: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(300).nullable().optional(),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.number().int().positive(),
  paymentMethod: z.enum(["cash", "click", "payme", "card"]).default("cash"),
  photoIds: z.array(z.string().max(40)).max(10).default([]),
});

export async function washBookedCount(service: string, date: string, slotId: number, tx?: Tx) {
  return (tx ?? db()).washOrder.count({ where: { service: service as ServiceCode, pickupDate: date, slotId, status: { not: "cancelled" } } });
}

export async function createWashOrder(user: AuthUser, input: z.infer<typeof createWashSchema>, now = new Date()) {
  if (!user.phone) throw bad("phone_required");
  const key = `${user.id}:w:${input.idempotencyKey}`;
  const existing = await db().washOrder.findUnique({ where: { idempotencyKey: key }, include: washInclude });
  if (existing) return existing; // a retry never creates a second order

  await assertServiceOpen(input.service, now); // the server rejects orders for a switched-off service
  const settings = await getSettings();
  const recent = await db().washOrder.count({ where: { customerId: user.id, createdAt: { gte: new Date(now.getTime() - 3600_000) } } });
  if (recent >= settings.orderLimitPerHour) throw tooMany("order_limit");

  const cat = await catalog();
  const area = findServiceCity(cat.cities, input.lat, input.lng);
  if (!area.ok) throw bad(area.reason === "invalid" ? "invalid" : area.reason);
  if (!dateInWindow(input.pickupDate, now, settings.bookingDaysAhead)) throw bad("date_invalid");
  const slot = cat.slots.find((s) => s.id === input.slotId);
  if (!slot) throw bad("slot_unavailable");

  const photos = input.photoIds.length ? await db().orderPhoto.findMany({ where: { id: { in: input.photoIds }, uploaderId: user.id, orderId: null, washOrderId: null, kind: "customer" } }) : [];
  if (input.photoIds.length > settings.maxPhotos) throw bad("too_many_photos", { max: settings.maxPhotos });

  const created = await db().$transaction(async (tx) => {
    // Capacity per service and slot (carpet and curtain don't use up trash pickup capacity).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wslot:${input.service}:${input.pickupDate}:${slot.id}`}))`;
    const booked = await washBookedCount(input.service, input.pickupDate, slot.id, tx);
    const avail = slotAvailability(slot, input.pickupDate, now, booked, { cutoffMinutes: settings.slotCutoffMinutes, daysAhead: settings.bookingDaysAhead });
    if (!avail.available) throw conflict("slot_unavailable", { reason: avail.reason });
    // The order keeps the price settings that are current right now; later changes never touch it.
    const priceSettings = await currentWashSettings(input.service, tx);
    const o = await tx.washOrder.create({
      data: {
        service: input.service,
        customerId: user.id,
        cityId: area.cityId,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        notes: input.notes || null,
        pickupDate: input.pickupDate,
        slotId: slot.id,
        settingsId: priceSettings.id,
        idempotencyKey: key,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === "cash" ? "cod_pending" : "pending",
      },
    });
    await tx.washStatusLog.create({ data: { orderId: o.id, from: null, to: "created", actorId: user.id } });
    if (photos.length) await tx.orderPhoto.updateMany({ where: { id: { in: photos.map((p) => p.id) } }, data: { washOrderId: o.id } });
    return o;
  });
  const full = (await loadWash(created.id))!;
  await notifyWashPlaced(full);
  return full;
}

export async function getWashFor(user: AuthUser, id: string) {
  const o = await loadWash(id);
  if (!o) throw notFound();
  const view = washViewFor(user, o);
  if (view === "none") throw notFound();
  return { order: o, dto: serializeWash(o, view) };
}

/** The client can cancel until the courier has measured (after that: decline the quote). */
export async function cancelWashByCustomer(user: AuthUser, id: string) {
  const o = await db().washOrder.findUnique({ where: { id } });
  if (!o || o.customerId !== user.id) throw notFound();
  assertCan(o.status as WashStatus, "cancelled", "customer");
  if (o.status === "quote_sent") return respondToQuote(user, id, o.quoteVersion, false);
  const ok = await db().$transaction((tx) => transition(tx, id, ["created", "courier_assigned"], "cancelled", user.id, { cancelledBy: "customer", cancelReason: null }));
  if (!ok) throw conflict("bad_status");
  const full = (await loadWash(id))!;
  await notifyWashCancelled(full, null, "customer");
  return full;
}

/** Confirm or decline the current quote (from the app or the bot buttons). */
export async function respondToQuote(user: AuthUser, id: string, version: number, accept: boolean) {
  const o = await db().washOrder.findUnique({ where: { id } });
  if (!o || o.customerId !== user.id) throw notFound();
  if (o.status !== "quote_sent" || o.quoteVersion !== version) throw conflict("quote_stale");
  const ok = await db().$transaction(async (tx) => {
    const moved = accept
      ? await transition(tx, id, "quote_sent", "client_confirmed", user.id)
      : await transition(tx, id, "quote_sent", "cancelled", user.id, { cancelledBy: "customer", cancelReason: "client_declined" }, "client declined the quote");
    if (moved) await tx.washQuote.updateMany({ where: { orderId: id, version }, data: { status: accept ? "confirmed" : "declined", respondedAt: new Date() } });
    return moved;
  });
  if (!ok) throw conflict("quote_stale");
  const full = (await loadWash(id))!;
  await notifyQuoteAnswer(full, accept);
  if (!accept) await alertAdmins("alert_declined", { num: washNumber(full.service as WashService, full.number), total: `${full.total ?? 0}` }, full, `declined:${id}:${version}`);
  return full;
}

// ---------------- Courier ----------------

function assertCourierFor(user: AuthUser, o: { service: string; cityId: number }) {
  if (!courierHandles(user.role, user.services, o.service as ServiceCode)) throw forbidden("service_not_allowed");
}

/** First courier wins (conditional update), only couriers who handle this service in this city. */
export async function takeWash(user: AuthUser, id: string) {
  const o = await db().washOrder.findUnique({ where: { id } });
  if (!o) throw notFound();
  assertCourierFor(user, o);
  const cityOk = user.role !== "courier" || user.cityIds.includes(o.cityId);
  if (!cityOk) throw forbidden();
  const ok = await db().$transaction((tx) => transition(tx, id, "created", "courier_assigned", user.id, { courierId: user.id }));
  if (!ok) throw conflict("taken");
  const full = (await loadWash(id))!;
  await notifyWashAssigned(full);
  return full;
}

export async function giveBackWash(user: AuthUser, id: string) {
  const ok = await db().$transaction(async (tx) => {
    const o = await tx.washOrder.findUnique({ where: { id } });
    if (!o || o.courierId !== user.id) return false;
    return transition(tx, id, "courier_assigned", "created", user.id, { courierId: null });
  });
  if (!ok) throw conflict("bad_status");
  return (await loadWash(id))!;
}

export const measureSchema = z.object({
  items: z.array(z.object({ lengthCm: z.number().int(), widthCm: z.number().int() })).min(1).max(50),
});

/**
 * The courier enters each item's length and width. The server prices it with the order's own settings
 * and sends the quote — unless it's above the maximum order, then an admin must approve first.
 * Allowed only before the client confirmed (after that, sizes are locked).
 */
export async function measureWash(user: AuthUser, id: string, items: { lengthCm: number; widthCm: number }[]) {
  const o = await db().washOrder.findUnique({ where: { id }, include: { settings: true } });
  if (!o || (o.courierId !== user.id && !(user.role === "admin" || user.role === "owner"))) throw notFound();
  if (!courierCanMeasure(o.status as WashStatus)) throw conflict("measure_locked");
  let q;
  try {
    q = quoteWash(items, toPricing(o.settings), { waiveDelivery: o.waiveDelivery });
  } catch (e) {
    if (e instanceof WashPriceError) throw bad(e.code, { max: o.settings.maxItems });
    throw e;
  }
  const service = o.service as WashService;
  const version = o.quoteVersion + 1;
  const ok = await db().$transaction(async (tx) => {
    const moved = await transition(tx, id, ["courier_assigned", "measured", "quote_sent"], "measured", user.id, {
      quoteVersion: version,
      subtotal: q.subtotal,
      total: q.total,
      deliveryFee: q.deliveryFee,
      washerPayout: q.washerPayout,
      courierPay: q.courierPay,
      needsApproval: q.needsApproval,
      approvedById: null,
      approvedAt: null,
    });
    if (!moved) return false;
    await tx.washItem.deleteMany({ where: { orderId: id } });
    await tx.washItem.createMany({
      data: q.lines.map((l, i) => ({ orderId: id, position: i + 1, type: service, lengthCm: l.lengthCm, widthCm: l.widthCm, areaTenths: l.areaTenths, label: washLabel(service, o.number, i + 1) })),
    });
    await tx.washQuote.updateMany({ where: { orderId: id, status: "sent" }, data: { status: "superseded" } });
    await tx.washQuote.create({
      data: { orderId: id, version, lines: q.lines as object, subtotal: q.subtotal, total: q.total, deliveryFee: q.deliveryFee, washerPayout: q.washerPayout, minimumApplied: q.minimumApplied },
    });
    return true;
  });
  if (!ok) throw conflict("bad_status");
  if (q.needsApproval) {
    const full = (await loadWash(id))!;
    await alertAdmins("alert_above_max", { num: washNumber(service, o.number), total: `${q.total}` }, full, `abovemax:${id}:${version}`);
    return full;
  }
  return sendQuote(id, null);
}

/** Moves measured → quote_sent and sends the quote to the client (system, or admin after approval). */
export async function sendQuote(id: string, adminId: number | null) {
  const ok = await db().$transaction((tx) => transition(tx, id, "measured", "quote_sent", adminId, adminId ? { approvedById: adminId, approvedAt: new Date() } : {}, adminId ? "approved by admin" : undefined));
  if (!ok) throw conflict("bad_status");
  const full = (await loadWash(id))!;
  await sendQuoteToClient(full);
  return full;
}

export async function approveWash(admin: AuthUser, id: string) {
  const o = await db().washOrder.findUnique({ where: { id } });
  if (!o || o.status !== "measured" || !o.needsApproval) throw conflict("bad_status");
  await audit({ actorId: admin.id, action: "wash.approve_above_max", entity: "washOrder", entityId: id, after: { total: o.total } });
  return sendQuote(id, admin.id);
}

/** Admin: reopen a confirmed order for a corrected measurement; the client must confirm again. */
export async function reopenForCorrection(admin: AuthUser, id: string, reason: string) {
  const ok = await db().$transaction((tx) => transition(tx, id, ["client_confirmed", "quote_sent"], "measured", admin.id, {}, `correction: ${reason}`));
  if (!ok) throw conflict("bad_status");
  await audit({ actorId: admin.id, action: "wash.reopen_measurement", entity: "washOrder", entityId: id, reason });
  return (await loadWash(id))!;
}

export async function pickUpWash(user: AuthUser, id: string) {
  const ok = await db().$transaction(async (tx) => {
    const o = await tx.washOrder.findUnique({ where: { id } });
    if (!o || o.courierId !== user.id) return false;
    return transition(tx, id, "client_confirmed", "picked_up", user.id);
  });
  if (!ok) throw conflict("bad_status");
  const full = (await loadWash(id))!;
  await notifyWashPicked(full);
  return full;
}

// ---------------- Admin ----------------

export async function cancelWashByAdmin(admin: AuthUser, id: string, reason: string) {
  const o = await db().washOrder.findUnique({ where: { id } });
  if (!o) throw notFound();
  if (WASH_FINAL.includes(o.status as WashStatus)) throw conflict("bad_status");
  const ok = await db().$transaction(async (tx) => {
    const moved = await transition(tx, id, o.status as WashStatus, "cancelled", admin.id, { cancelledBy: "admin", cancelReason: reason });
    if (moved) await audit({ actorId: admin.id, action: "wash.cancel", entity: "washOrder", entityId: id, before: { status: o.status }, reason }, tx);
    return moved;
  });
  if (!ok) throw conflict("bad_status");
  const full = (await loadWash(id))!;
  await notifyWashCancelled(full, reason, "admin");
  return full;
}

/** Admin: waive the delivery fee on one order (with a reason). Re-prices the current measurement, if any. */
export async function waiveDelivery(admin: AuthUser, id: string, reason: string) {
  const o = await db().washOrder.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
  if (!o) throw notFound();
  if (!["created", "courier_assigned", "measured", "quote_sent"].includes(o.status)) throw conflict("measure_locked");
  await db().washOrder.update({ where: { id }, data: { waiveDelivery: true, waiveReason: reason } });
  await audit({ actorId: admin.id, action: "wash.waive_delivery", entity: "washOrder", entityId: id, reason });
  // If already measured, a new quote (without the fee) goes to the client to confirm again.
  if (o.items.length && (o.status === "measured" || o.status === "quote_sent")) {
    return measureWash({ ...admin, role: "admin" }, id, o.items.map((i) => ({ lengthCm: i.lengthCm, widthCm: i.widthCm })));
  }
  return (await loadWash(id))!;
}

export { actorOf };
