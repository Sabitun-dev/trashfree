// Carpet & curtain washing endpoints (client, courier, admin). Washer endpoints are added with the washer screens.
import { Hono } from "hono";
import { z } from "zod";
import { isAdmin } from "../../../domain/permissions";
import { slotsForDate } from "../../../domain/slots";
import { WASH_ACTIVE, type WashStatus } from "../../../domain/wash";
import { catalog } from "../../catalog";
import { db } from "../../db";
import { forbidden } from "../../errors";
import { getSettings } from "../../settings";
import { serializeWash, washInclude, washViewFor } from "../../wash/serialize";
import {
  approveWash,
  cancelWashByAdmin,
  cancelWashByCustomer,
  createWashOrder,
  createWashSchema,
  getWashFor,
  giveBackWash,
  measureSchema,
  measureWash,
  pickUpWash,
  reopenForCorrection,
  respondToQuote,
  takeWash,
  waiveDelivery,
  handToWasher,
  listWashers,
  markWashed,
  releaseHold,
  washerMeasure,
  washerMeasureSchema,
} from "../../wash/service";
import { currentWashSettings, toPricing } from "../../wash/settings";
import type { Role } from "../../../domain/types";
import type { AuthUser } from "../../users";
import { body, json, query, type Env } from "../context";

export const washRoutes = new Hono<Env>();
const reason = z.string().trim().min(2).max(500);

// ---- Client ----
washRoutes.get("/wash/info", async (c) => {
  const { service } = query(c, z.object({ service: z.enum(["carpet", "curtain"]) }));
  const s = toPricing(await currentWashSettings(service));
  // Only what the client needs to know before measuring.
  return json(c, { pricePerM2: s.pricePerM2, minOrder: s.minOrder, deliveryFee: s.deliveryFee, freeDeliveryFrom: s.freeDeliveryFrom, maxItems: s.maxItems });
});

washRoutes.get("/wash/slots", async (c) => {
  const { service, date } = query(c, z.object({ service: z.enum(["carpet", "curtain"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  const [cat, settings] = await Promise.all([catalog(), getSettings()]);
  const counts = await db().washOrder.groupBy({ by: ["slotId"], where: { service, pickupDate: date, status: { not: "cancelled" } }, _count: true });
  const booked = Object.fromEntries(counts.map((r) => [r.slotId, r._count]));
  return json(c, { date, slots: slotsForDate(cat.slots, date, new Date(), booked, { cutoffMinutes: settings.slotCutoffMinutes, daysAhead: settings.bookingDaysAhead }) });
});

washRoutes.post("/wash/orders", async (c) => {
  const user = c.get("user");
  const o = await createWashOrder(user, await body(c, createWashSchema));
  return json(c, serializeWash(o, washViewFor(user, o)));
});

washRoutes.get("/wash/orders", async (c) => {
  const user = c.get("user");
  const { filter } = query(c, z.object({ filter: z.enum(["active", "done", "cancelled", "all"]).default("all") }));
  const statuses: Record<string, WashStatus[] | undefined> = { active: WASH_ACTIVE, done: ["delivered_paid", "closed"], cancelled: ["cancelled"], all: undefined };
  const list = await db().washOrder.findMany({
    where: { customerId: user.id, archivedAt: null, ...(statuses[filter] ? { status: { in: statuses[filter] } } : {}) },
    include: washInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return json(c, list.map((o) => serializeWash(o, "owner")));
});

washRoutes.get("/wash/orders/:id", async (c) => json(c, (await getWashFor(c.get("user"), c.req.param("id"))).dto));

washRoutes.post("/wash/orders/:id/cancel", async (c) => {
  const user = c.get("user");
  const o = await cancelWashByCustomer(user, c.req.param("id"));
  return json(c, serializeWash(o, washViewFor(user, o)));
});

washRoutes.post("/wash/orders/:id/quote", async (c) => {
  const user = c.get("user");
  const b = await body(c, z.object({ version: z.number().int().positive(), accept: z.boolean() }));
  const o = await respondToQuote(user, c.req.param("id"), b.version, b.accept);
  return json(c, serializeWash(o, washViewFor(user, o)));
});

// ---- Courier ----
const courierOnly = (role: Role) => {
  if (!(role === "courier" || isAdmin(role))) throw forbidden();
};

washRoutes.get("/wash/courier", async (c) => {
  const user = c.get("user");
  courierOnly(user.role);
  const { tab } = query(c, z.object({ tab: z.enum(["new", "mine", "done"]) }));
  const services = isAdmin(user.role) ? (["carpet", "curtain"] as const) : user.services.filter((s): s is "carpet" | "curtain" => s !== "trash");
  if (!services.length) return json(c, []);
  const cityIds = isAdmin(user.role) && user.cityIds.length === 0 ? undefined : user.cityIds;
  const where =
    tab === "new"
      ? { status: "created" as const, service: { in: [...services] }, ...(cityIds ? { cityId: { in: cityIds } } : {}) }
      : tab === "mine"
        ? { courierId: user.id, status: { in: ["courier_assigned", "measured", "quote_sent", "client_confirmed", "picked_up", "washed", "out_for_delivery"] as WashStatus[] } }
        : { courierId: user.id, status: { in: ["delivered_paid", "closed"] as WashStatus[] } };
  const list = await db().washOrder.findMany({ where, include: washInclude, orderBy: tab === "done" ? { statusAt: "desc" } : { createdAt: "desc" }, take: 100 });
  return json(c, list.map((o) => serializeWash(o, isAdmin(user.role) ? "courier" : washViewFor(user, o))));
});

type Full = Parameters<typeof serializeWash>[0];
const courierAction = (path: string, fn: (u: AuthUser, id: string, b: unknown) => Promise<Full>) =>
  washRoutes.post(`/wash/orders/:id/${path}`, async (c) => {
    const user = c.get("user");
    courierOnly(user.role);
    const o = await fn(user, c.req.param("id"), await c.req.json().catch(() => ({})));
    return json(c, serializeWash(o, isAdmin(user.role) ? "admin" : washViewFor(user, o)));
  });

courierAction("take", (u, id) => takeWash(u, id));
courierAction("give-back", (u, id) => giveBackWash(u, id));
courierAction("measure", (u, id, b) => measureWash(u, id, measureSchema.parse(b).items));
courierAction("pickup", (u, id) => pickUpWash(u, id));

// ---- Admin ----
const adminAction = (path: string, fn: (u: AuthUser, id: string, b: { reason: string }) => Promise<Full>, needsReason = true) =>
  washRoutes.post(`/wash/orders/:id/${path}`, async (c) => {
    const user = c.get("user");
    if (!isAdmin(user.role)) throw forbidden();
    const b = needsReason ? await body(c, z.object({ reason })) : { reason: "" };
    const o = await fn(user, c.req.param("id"), b);
    return json(c, serializeWash(o, "admin"));
  });

adminAction("approve", (u, id) => approveWash(u, id), false);
adminAction("reopen", (u, id, b) => reopenForCorrection(u, id, b.reason));
adminAction("admin-cancel", (u, id, b) => cancelWashByAdmin(u, id, b.reason));
adminAction("waive-delivery", (u, id, b) => waiveDelivery(u, id, b.reason));
adminAction("release-hold", (u, id, b) => releaseHold(u, id, b.reason));

// ---- Washer ----
washRoutes.get("/wash/washers", async (c) => {
  courierOnly(c.get("user").role);
  return json(c, await listWashers());
});

courierAction("handover", (u, id, b) => handToWasher(u, id, z.object({ washerId: z.number().int() }).parse(b).washerId));

const washerOnly = (role: Role) => {
  if (role !== "washer") throw forbidden();
};

washRoutes.get("/wash/washer", async (c) => {
  const user = c.get("user");
  washerOnly(user.role);
  const { tab } = query(c, z.object({ tab: z.enum(["mine", "done"]) }));
  const list = await db().washOrder.findMany({
    where: { washerId: user.id, status: tab === "mine" ? "at_washer" : { in: ["washed", "out_for_delivery", "delivered_paid", "closed"] } },
    include: washInclude,
    orderBy: { statusAt: "desc" },
    take: 100,
  });
  return json(c, list.map((o) => serializeWash(o, "washer")));
});

washRoutes.post("/wash/orders/:id/washer-measure", async (c) => {
  const user = c.get("user");
  washerOnly(user.role);
  const o = await washerMeasure(user, c.req.param("id"), washerMeasureSchema.parse(await c.req.json().catch(() => ({}))).items);
  return json(c, serializeWash(o, "washer"));
});

washRoutes.post("/wash/orders/:id/washed", async (c) => {
  const user = c.get("user");
  washerOnly(user.role);
  return json(c, serializeWash(await markWashed(user, c.req.param("id")), "washer"));
});
