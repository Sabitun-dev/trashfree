// Creating, cancelling and rating orders. The server always recalculates the price and re-checks everything.
import { z } from "zod";
import { findServiceCity } from "../../domain/geo";
import { orderView } from "../../domain/permissions";
import { calcPrice, PriceError } from "../../domain/price";
import { dateInWindow, slotAvailability } from "../../domain/slots";
import { canTransition, SLOT_HOLDING_STATUSES } from "../../domain/status";
import { ONLINE_METHODS, PAYMENT_METHODS, type PaymentMethod } from "../../domain/types";
import { audit } from "../audit";
import { catalog } from "../catalog";
import { db, type Tx } from "../db";
import { bad, conflict, notFound, tooMany } from "../errors";
import { onOrderCancelled, onOrderOpened } from "../notify/events";
import { paymentAvailable } from "../payments/availability";
import { getSettings } from "../settings";
import { activeSubscription, consumePickupTx, returnPickupTx } from "../subscriptions/service";
import type { AuthUser } from "../users";
import { orderInclude, serializeOrder, type OrderFull } from "./serialize";

export const createOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  lat: z.number().finite(),
  lng: z.number().finite(),
  address: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(300).optional().nullable(),
  saveAddressLabel: z.string().trim().min(1).max(30).optional().nullable(),
  trashType: z.string().regex(/^[a-z0-9_]{2,40}$/), // English code only
  packageSize: z.string().regex(/^[a-z0-9_]{2,40}$/),
  quantity: z.number().int(),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.number().int().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  photoIds: z.array(z.string().max(40)).max(10).default([]),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export async function loadOrder(id: string, tx?: Tx): Promise<OrderFull | null> {
  return (tx ?? db()).order.findUnique({ where: { id }, include: orderInclude });
}

/** Count of orders holding a place in a slot (for capacity). */
export async function bookedCount(date: string, slotId: number, tx?: Tx) {
  return (tx ?? db()).order.count({ where: { pickupDate: date, slotId, status: { in: SLOT_HOLDING_STATUSES } } });
}

export async function createOrder(user: AuthUser, input: CreateOrderInput, now = new Date()) {
  if (!user.phone) throw bad("phone_required");
  const key = `${user.id}:${input.idempotencyKey}`;

  // Idempotency: a retry with the same key returns the same order, never a second one.
  const existing = await db().order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
  if (existing) return { order: existing, created: false };

  const settings = await getSettings();
  const since = new Date(now.getTime() - 3600_000);
  const recent = await db().order.count({ where: { customerId: user.id, createdAt: { gte: since } } });
  if (recent >= settings.orderLimitPerHour) throw tooMany("order_limit");

  const cat = await catalog();
  const area = findServiceCity(cat.cities, input.lat, input.lng);
  if (!area.ok) throw bad(area.reason === "invalid" ? "invalid" : area.reason);

  const type = cat.trashTypes.find((t) => t.code === input.trashType);
  const size = cat.packageSizes.find((s) => s.code === input.packageSize);
  if (!type || !size) throw bad("invalid");
  const rule = cat.prices.find((p) => p.trashTypeId === type.id && p.packageSizeId === size.id);
  let price;
  try {
    price = calcPrice(rule, input.quantity, settings.maxQuantity);
  } catch (e) {
    if (e instanceof PriceError) throw bad(e.code, { max: settings.maxQuantity });
    throw e;
  }

  if (!dateInWindow(input.pickupDate, now, settings.bookingDaysAhead)) throw bad("date_invalid");
  const slot = cat.slots.find((s) => s.id === input.slotId);
  if (!slot) throw bad("slot_unavailable");

  const method = input.paymentMethod as PaymentMethod;
  if (!settings.methods[method]) throw bad("method_disabled");
  const online = ONLINE_METHODS.includes(method);
  if (online && !paymentAvailable(method, settings)) throw bad("payment_unavailable");

  const sub = await activeSubscription(user.id);
  if (method === "subscription" && !sub) throw bad("subscription_unusable");

  const photos = input.photoIds.length
    ? await db().orderPhoto.findMany({ where: { id: { in: input.photoIds }, uploaderId: user.id, orderId: null, kind: "customer" } })
    : [];
  if (input.photoIds.length > settings.maxPhotos) throw bad("too_many_photos", { max: settings.maxPhotos });

  const order = await db().$transaction(async (tx) => {
    // Serialise bookings per slot so capacity can never be exceeded by parallel orders.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`slot:${input.pickupDate}:${slot.id}`}))`;
    const booked = await bookedCount(input.pickupDate, slot.id, tx);
    const avail = slotAvailability(slot, input.pickupDate, now, booked, {
      cutoffMinutes: settings.slotCutoffMinutes,
      daysAhead: settings.bookingDaysAhead,
      prioritySlotsEnabled: settings.prioritySlotsForSubscribers,
      hasActiveSubscription: !!sub,
    });
    if (!avail.available) throw conflict("slot_unavailable", { reason: avail.reason });

    if (method === "subscription" && !(await consumePickupTx(tx, sub!.id))) throw bad("subscription_unusable");

    const created = await tx.order.create({
      data: {
        customerId: user.id,
        cityId: area.cityId,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        notes: input.notes || null,
        trashTypeId: type.id,
        packageSizeId: size.id,
        quantity: input.quantity,
        pickupDate: input.pickupDate,
        slotId: slot.id,
        priceTotal: method === "subscription" ? 0 : price.total,
        priceBreakdown: price as object,
        status: online ? "awaiting_payment" : "open",
        paymentStatus: method === "subscription" ? "subscription" : online ? "pending" : "cod_pending",
        paymentMethod: method,
        idempotencyKey: key,
        subscriptionId: method === "subscription" ? sub!.id : null,
        expiresAt: online ? new Date(now.getTime() + settings.paymentTimeoutMinutes * 60_000) : null,
      },
      include: orderInclude,
    });
    if (photos.length) await tx.orderPhoto.updateMany({ where: { id: { in: photos.map((p) => p.id) } }, data: { orderId: created.id } });
    if (input.saveAddressLabel) {
      await tx.address.create({ data: { userId: user.id, label: input.saveAddressLabel, address: input.address, lat: input.lat, lng: input.lng, notes: input.notes || null } });
    }
    return created;
  });

  const full = (await loadOrder(order.id))!;
  if (full.status === "open") await onOrderOpened(full);
  return { order: full, created: true };
}

/** Customer cancel: only while `open` (or still unpaid). A subscription pickup is returned. */
export async function cancelByCustomer(user: AuthUser, orderId: string) {
  const order = await db().order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== user.id) throw notFound();
  if (!canTransition(order.status, "cancelled", "customer")) throw conflict("cannot_cancel");
  const done = await db().$transaction(async (tx) => {
    const n = await tx.order.updateMany({
      where: { id: orderId, customerId: user.id, status: { in: ["open", "awaiting_payment"] } },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "customer",
        paymentStatus: order.paymentStatus === "pending" || order.paymentStatus === "cod_pending" ? "cancelled" : order.paymentStatus,
      },
    });
    if (n.count !== 1) return false;
    if (order.subscriptionId) await returnPickupTx(tx, order.subscriptionId);
    return true;
  });
  if (!done) throw conflict("cannot_cancel");
  const full = (await loadOrder(orderId))!;
  await onOrderCancelled(full, { by: "customer" });
  return full;
}

/** Admin cancel with a required reason (audit-logged). */
export async function cancelByAdmin(admin: AuthUser, orderId: string, reason: string) {
  const order = await db().order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  if (!canTransition(order.status, "cancelled", "admin")) throw conflict("bad_status");
  await db().$transaction(async (tx) => {
    const n = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "admin",
        cancelReason: reason,
        paymentStatus: order.paymentStatus === "pending" || order.paymentStatus === "cod_pending" ? "cancelled" : order.paymentStatus,
      },
    });
    if (n.count !== 1) throw conflict("bad_status");
    if (order.subscriptionId) await returnPickupTx(tx, order.subscriptionId);
    await audit({ actorId: admin.id, action: "order.cancel", entity: "order", entityId: orderId, before: { status: order.status }, after: { status: "cancelled" }, reason }, tx);
  });
  const full = (await loadOrder(orderId))!;
  await onOrderCancelled(full, { by: "admin", reason });
  return full;
}

export async function rateOrder(user: AuthUser, orderId: string, rating: number, comment?: string | null) {
  const n = await db().order.updateMany({
    where: { id: orderId, customerId: user.id, status: "completed", rating: null },
    data: { rating, ratingComment: comment?.trim() || null },
  });
  if (n.count !== 1) {
    const o = await db().order.findUnique({ where: { id: orderId } });
    if (!o || o.customerId !== user.id) throw notFound();
    throw conflict("bad_status");
  }
  return (await loadOrder(orderId))!;
}

export async function getOrderFor(user: AuthUser, orderId: string) {
  const o = await loadOrder(orderId);
  if (!o || orderView(user, o) === "none") throw notFound();
  return { order: o, dto: serializeOrder(o, user) };
}
