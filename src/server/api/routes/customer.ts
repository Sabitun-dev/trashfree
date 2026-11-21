// Customer endpoints: geocoding, slots, photos, addresses, orders.
import { Hono } from "hono";
import { z } from "zod";
import { slotsForDate } from "../../../domain/slots";
import { SLOT_HOLDING_STATUSES } from "../../../domain/status";
import { catalog } from "../../catalog";
import { db } from "../../db";
import { bad, notFound } from "../../errors";
import { reverseGeocode, searchAddress } from "../../geocode";
import { createOrder, createOrderSchema, cancelByCustomer, getOrderFor, rateOrder } from "../../orders/service";
import { orderInclude, serializeOrder } from "../../orders/serialize";
import { readPhoto, savePhoto } from "../../photos";
import { enforce } from "../../ratelimit";
import { getSettings } from "../../settings";
import { activeSubscription } from "../../subscriptions/service";
import { startOrderPayment } from "../../payments/start";
import { body, json, query, type Env } from "../context";

export const customerRoutes = new Hono<Env>();

customerRoutes.post("/geocode/reverse", async (c) => {
  const user = c.get("user");
  const { lat, lng } = await body(c, z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }));
  await enforce(`geo:${user.id}`, 40, 60);
  return json(c, { address: await reverseGeocode(lat, lng, user.language) });
});

customerRoutes.get("/geocode/search", async (c) => {
  const user = c.get("user");
  const { q } = query(c, z.object({ q: z.string().trim().min(3).max(120) }));
  await enforce(`geo:${user.id}`, 40, 60);
  return json(c, { results: await searchAddress(q, user.language) });
});

customerRoutes.get("/slots", async (c) => {
  const user = c.get("user");
  const { date } = query(c, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  const [cat, settings, sub] = await Promise.all([catalog(), getSettings(), activeSubscription(user.id)]);
  const counts = await db().order.groupBy({ by: ["slotId"], where: { pickupDate: date, status: { in: SLOT_HOLDING_STATUSES } }, _count: true });
  const booked = Object.fromEntries(counts.map((r) => [r.slotId, r._count]));
  const list = slotsForDate(cat.slots, date, new Date(), booked, {
    cutoffMinutes: settings.slotCutoffMinutes,
    daysAhead: settings.bookingDaysAhead,
    prioritySlotsEnabled: settings.prioritySlotsForSubscribers,
    hasActiveSubscription: !!sub,
  });
  return json(c, { date, slots: list });
});

customerRoutes.post("/uploads", async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const file = form.file;
  const kind = form.kind === "completion" ? "completion" : "customer";
  if (!(file instanceof File)) throw bad("photo_type");
  if (kind === "completion" && user.role === "customer") throw bad("invalid");
  const photo = await savePhoto(user, file, kind);
  return json(c, { id: photo.id });
});

customerRoutes.get("/photos/:id", async (c) => {
  const { data, mime } = await readPhoto(c.get("user"), c.req.param("id"));
  return c.body(data, 200, { "content-type": mime, "cache-control": "private, max-age=86400" });
});

// ---- Saved addresses ----
customerRoutes.get("/addresses", async (c) => {
  const list = await db().address.findMany({ where: { userId: c.get("user").id }, orderBy: { createdAt: "desc" }, take: 20 });
  return json(c, list);
});

customerRoutes.post("/addresses", async (c) => {
  const b = await body(
    c,
    z.object({ label: z.string().trim().min(1).max(30), address: z.string().trim().min(1).max(300), lat: z.number(), lng: z.number(), notes: z.string().trim().max(300).nullable().optional() }),
  );
  const count = await db().address.count({ where: { userId: c.get("user").id } });
  if (count >= 20) throw bad("too_many");
  return json(c, await db().address.create({ data: { ...b, notes: b.notes ?? null, userId: c.get("user").id } }));
});

customerRoutes.delete("/addresses/:id", async (c) => {
  const n = await db().address.deleteMany({ where: { id: Number(c.req.param("id")), userId: c.get("user").id } });
  if (!n.count) throw notFound();
  return json(c, { ok: true });
});

// ---- Orders ----
customerRoutes.post("/orders", async (c) => {
  const user = c.get("user");
  const input = await body(c, createOrderSchema);
  const { order } = await createOrder(user, input);
  const payment = order.status === "awaiting_payment" ? await startOrderPayment(order, user) : null;
  return json(c, { order: serializeOrder(order, user), payment });
});

customerRoutes.get("/orders", async (c) => {
  const user = c.get("user");
  const { filter } = query(c, z.object({ filter: z.enum(["active", "done", "cancelled", "all"]).default("all") }));
  const statuses = {
    active: ["awaiting_payment", "open", "accepted", "on_the_way"],
    done: ["completed"],
    cancelled: ["cancelled", "expired"],
    all: undefined,
  }[filter] as ("awaiting_payment" | "open")[] | undefined;
  const list = await db().order.findMany({
    where: { customerId: user.id, archivedAt: null, ...(statuses ? { status: { in: statuses } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: orderInclude,
  });
  return json(c, list.map((o) => serializeOrder(o, user)));
});

customerRoutes.get("/orders/last", async (c) => {
  const user = c.get("user");
  const o = await db().order.findFirst({
    where: { customerId: user.id, status: { in: ["open", "accepted", "on_the_way", "completed"] } },
    orderBy: { createdAt: "desc" },
    include: { ...orderInclude, trashType: true, packageSize: true },
  });
  if (!o) return json(c, null);
  return json(c, { ...serializeOrder(o, user), trashTypeCode: o.trashType.code, packageSizeCode: o.packageSize.code });
});

customerRoutes.get("/orders/:id", async (c) => {
  const { dto } = await getOrderFor(c.get("user"), c.req.param("id"));
  return json(c, dto);
});

customerRoutes.post("/orders/:id/cancel", async (c) => {
  const user = c.get("user");
  const o = await cancelByCustomer(user, c.req.param("id"));
  return json(c, serializeOrder(o, user));
});

customerRoutes.post("/orders/:id/rate", async (c) => {
  const user = c.get("user");
  const b = await body(c, z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).nullable().optional() }));
  const o = await rateOrder(user, c.req.param("id"), b.rating, b.comment);
  return json(c, serializeOrder(o, user));
});

/** Retry payment for an unpaid order (same order, new invoice). */
customerRoutes.post("/orders/:id/pay", async (c) => {
  const user = c.get("user");
  const { order } = await getOrderFor(user, c.req.param("id"));
  if (order.customerId !== user.id || order.status !== "awaiting_payment") throw bad("bad_status");
  return json(c, { payment: await startOrderPayment(order, user) });
});
