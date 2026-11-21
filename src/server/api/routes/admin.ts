// Admin endpoints. Every route requires admin or owner; owner-only actions are checked in the services.
import { Hono } from "hono";
import { z } from "zod";
import { ROLES } from "../../../domain/types";
import { audienceCount, broadcastSchema, createBroadcast, previewBroadcast } from "../../admin/broadcast";
import { savePrices, updateSettings, upsertEntity, type Entity } from "../../admin/catalog";
import { dashboard } from "../../admin/dashboard";
import { confirmHandover, exportCsv, handoverHistory, listOrders, orderFilterSchema, outstandingCash, reassign, setRefundNote } from "../../admin/orders";
import { createInvite, erasePersonalData, grantSubscription, searchPeople, setBlocked, setRole } from "../../admin/people";
import { tg } from "../../bot/telegram";
import { bt } from "../../bot/texts";
import { loadCatalog } from "../../catalog";
import { db } from "../../db";
import { notFound } from "../../errors";
import { cancelByAdmin, loadOrder } from "../../orders/service";
import { serializeOrder } from "../../orders/serialize";
import { enforce } from "../../ratelimit";
import { getSettings } from "../../settings";
import { body, json, query, requireAction, type Env } from "../context";

export const adminRoutes = new Hono<Env>();
adminRoutes.use("/admin/*", requireAction("admin.access"));

const reason = z.string().trim().min(2).max(500);

// ---- Dashboard ----
adminRoutes.get("/admin/dashboard", async (c) => {
  const q = query(c, z.object({ period: z.enum(["today", "week", "month"]).default("today"), cityId: z.coerce.number().int().optional() }));
  return json(c, await dashboard(q.period, q.cityId));
});

// ---- Orders ----
adminRoutes.get("/admin/orders", async (c) => {
  const user = c.get("user");
  const f = query(c, orderFilterSchema);
  const rows = await listOrders(f);
  const more = rows.length > 30;
  return json(c, { items: rows.slice(0, 30).map((o) => ({ ...serializeOrder(o, user), refundNote: o.refundNote, cashHandoverId: o.cashHandoverId })), next: more ? rows[29].id : null });
});

adminRoutes.get("/admin/orders/:id", async (c) => {
  const o = await loadOrder(c.req.param("id"));
  if (!o) throw notFound();
  const audits = await db().auditLog.findMany({ where: { entity: "order", entityId: o.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return json(c, { ...serializeOrder(o, c.get("user")), refundNote: o.refundNote, cashHandoverId: o.cashHandoverId, audits });
});

adminRoutes.post("/admin/orders/:id/cancel", async (c) => {
  const b = await body(c, z.object({ reason }));
  return json(c, serializeOrder(await cancelByAdmin(c.get("user"), c.req.param("id"), b.reason), c.get("user")));
});

adminRoutes.post("/admin/orders/:id/assign", async (c) => {
  const b = await body(c, z.object({ courierId: z.number().int().nullable(), reason }));
  return json(c, serializeOrder(await reassign(c.get("user"), c.req.param("id"), b.courierId, b.reason), c.get("user")));
});

adminRoutes.post("/admin/orders/:id/refund-note", async (c) => {
  const b = await body(c, z.object({ note: reason }));
  return json(c, serializeOrder(await setRefundNote(c.get("user"), c.req.param("id"), b.note), c.get("user")));
});

adminRoutes.post("/admin/orders/export", async (c) => {
  const user = c.get("user");
  await enforce(`export:${user.id}`, 10, 3600);
  const f = orderFilterSchema.parse(await c.req.json().catch(() => ({})));
  return json(c, await exportCsv(user, f));
});

// ---- People ----
adminRoutes.get("/admin/people", async (c) => {
  const q = query(c, z.object({ q: z.string().trim().max(60).optional(), role: z.enum(ROLES).optional() }));
  const list = await searchPeople(q.q || undefined, q.role);
  return json(
    c,
    list.map((u) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, role: u.role, blocked: u.blocked, cityIds: u.courierCities.map((x) => x.cityId), orders: u._count.orders, deletionRequested: !!u.deletionRequestedAt, createdAt: u.createdAt })),
  );
});

adminRoutes.get("/admin/people/deletion-requests", async (c) => {
  const list = await db().user.findMany({ where: { deletionRequestedAt: { not: null }, deletedAt: null }, orderBy: { deletionRequestedAt: "asc" } });
  return json(c, list.map((u) => ({ id: u.id, name: u.name, phone: u.phone, requestedAt: u.deletionRequestedAt })));
});

adminRoutes.get("/admin/people/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const u = await db().user.findUnique({ where: { id }, include: { courierCities: true } });
  if (!u) throw notFound();
  const [orders, subs, couriered] = await Promise.all([
    db().order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, status: true, priceTotal: true, createdAt: true } }),
    db().subscription.findMany({ where: { userId: id, status: { in: ["active", "pending"] } }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 3 }),
    db().order.count({ where: { courierId: id, status: "completed" } }),
  ]);
  return json(c, {
    id: u.id,
    name: u.name,
    username: u.username,
    phone: u.phone,
    role: u.role,
    language: u.language,
    blocked: u.blocked,
    blockedReason: u.blockedReason,
    botBlocked: u.botBlocked,
    cityIds: u.courierCities.map((x) => x.cityId),
    deletionRequested: !!u.deletionRequestedAt,
    createdAt: u.createdAt,
    orders,
    subscriptions: subs.map((s) => ({ id: s.id, plan: s.plan, status: s.status, left: s.pickupsTotal - s.pickupsUsed, periodEnd: s.periodEnd })),
    completedAsCourier: couriered,
  });
});

adminRoutes.post("/admin/people/:id/role", async (c) => {
  const b = await body(c, z.object({ role: z.enum(["customer", "courier", "admin"]), cityIds: z.array(z.number().int()).max(50).optional() }));
  await setRole(c.get("user"), Number(c.req.param("id")), b.role, b.cityIds);
  return json(c, { ok: true });
});

adminRoutes.post("/admin/people/:id/block", async (c) => {
  const b = await body(c, z.object({ blocked: z.boolean(), reason: z.string().trim().max(300).nullable().optional() }));
  await setBlocked(c.get("user"), Number(c.req.param("id")), b.blocked, b.reason ?? null);
  return json(c, { ok: true });
});

adminRoutes.post("/admin/people/:id/subscription", async (c) => {
  const b = await body(c, z.object({ planId: z.number().int(), note: reason }));
  return json(c, await grantSubscription(c.get("user"), Number(c.req.param("id")), b.planId, b.note));
});

adminRoutes.post("/admin/people/:id/erase", async (c) => {
  const id = Number(c.req.param("id"));
  const u = await db().user.findUnique({ where: { id } });
  if (!u) throw notFound();
  await tg()
    .sendMessage(Number(u.telegramId), bt(u.language, "deletion_done"))
    .catch(() => {});
  await erasePersonalData(c.get("user"), id);
  return json(c, { ok: true });
});

adminRoutes.post("/admin/invites", async (c) => {
  const b = await body(c, z.object({ cityIds: z.array(z.number().int()).min(1).max(50) }));
  return json(c, await createInvite(c.get("user"), b.cityIds));
});

adminRoutes.get("/admin/couriers", async (c) => {
  const q = query(c, z.object({ cityId: z.coerce.number().int().optional() }));
  const list = await db().user.findMany({
    where: { blocked: false, deletedAt: null, OR: [{ role: "courier" }, { role: { in: ["admin", "owner"] }, courierCities: { some: {} } }], ...(q.cityId ? { courierCities: { some: { cityId: q.cityId } } } : {}) },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });
  return json(c, list);
});

// ---- Catalog ----
adminRoutes.get("/admin/catalog", async (c) => json(c, await loadCatalog(true)));

const ENTITIES: Record<string, Entity> = { "trash-types": "trashType", "package-sizes": "packageSize", slots: "slot", cities: "city", plans: "plan" };
adminRoutes.post("/admin/catalog/:entity/:id?", async (c) => {
  const entity = ENTITIES[c.req.param("entity")];
  if (!entity) throw notFound();
  const id = c.req.param("id") ? Number(c.req.param("id")) : null;
  return json(c, await upsertEntity(c.get("user"), entity, id, await c.req.json()));
});

adminRoutes.put("/admin/prices", async (c) => json(c, await savePrices(c.get("user"), await c.req.json())));

adminRoutes.get("/admin/settings", async (c) => json(c, await getSettings()));
adminRoutes.put("/admin/settings", async (c) => json(c, await updateSettings(c.get("user"), await c.req.json())));

// ---- Broadcasts ----
adminRoutes.post("/admin/broadcasts/preview", async (c) => {
  const b = await body(c, broadcastSchema);
  return json(c, await previewBroadcast(c.get("user"), b));
});
adminRoutes.post("/admin/broadcasts/count", async (c) => json(c, { count: await audienceCount(await body(c, broadcastSchema)) }));
adminRoutes.post("/admin/broadcasts", async (c) => {
  const user = c.get("user");
  await enforce(`bc:${user.id}`, 10, 3600);
  return json(c, await createBroadcast(user, await body(c, broadcastSchema)));
});
adminRoutes.get("/admin/broadcasts", async (c) => json(c, await db().broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 })));

// ---- Cash ----
adminRoutes.get("/admin/cash", async (c) => json(c, { outstanding: await outstandingCash(), history: await handoverHistory() }));
adminRoutes.post("/admin/cash/:courierId/confirm", async (c) => {
  const b = await body(c, z.object({ amount: z.number().int().positive() }));
  return json(c, await confirmHandover(c.get("user"), Number(c.req.param("courierId")), b.amount));
});

// ---- Audit ----
adminRoutes.get("/admin/audit", async (c) => {
  const q = query(c, z.object({ cursor: z.coerce.number().int().optional(), entity: z.string().max(40).optional() }));
  const rows = await db().auditLog.findMany({
    where: { ...(q.entity ? { entity: q.entity } : {}), ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
    orderBy: { id: "desc" },
    take: 40,
  });
  const actors = await db().user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is number => !!x) } }, select: { id: true, name: true } });
  return json(c, { items: rows.map((r) => ({ ...r, actorName: actors.find((a) => a.id === r.actorId)?.name ?? "system" })), next: rows.length === 40 ? rows[39].id : null });
});

