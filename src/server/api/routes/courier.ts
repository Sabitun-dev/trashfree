// Courier endpoints. Every route requires the courier role (or an admin with cities).
import { Hono } from "hono";
import { z } from "zod";
import { isAdmin } from "../../../domain/permissions";
import { courierHandles } from "../../../domain/services";
import { db } from "../../db";
import { courierAccept, courierComplete, courierGiveBack, courierOnTheWay, courierToday } from "../../courier/service";
import { forbidden, notFound } from "../../errors";
import { orderInclude, serializeOrder } from "../../orders/serialize";
import { tg } from "../../bot/telegram";
import { body, json, query, requireAction, type Env } from "../context";

export const courierRoutes = new Hono<Env>();
courierRoutes.use("/courier/*", requireAction("courier.access"));

courierRoutes.get("/courier/orders", async (c) => {
  const user = c.get("user");
  const { tab } = query(c, z.object({ tab: z.enum(["new", "mine", "done"]) }));
  const cityIds = isAdmin(user.role) && user.cityIds.length === 0 ? undefined : user.cityIds;
  const handlesTrash = courierHandles(user.role, user.services, "trash");
  const where =
    tab === "new"
      ? { status: "open" as const, archivedAt: null, ...(cityIds ? { cityId: { in: cityIds } } : {}), ...(handlesTrash ? {} : { id: "-" }) }
      : tab === "mine"
        ? { courierId: user.id, status: { in: ["accepted" as const, "on_the_way" as const] } }
        : { courierId: user.id, status: "completed" as const };
  const list = await db().order.findMany({
    where,
    include: orderInclude,
    orderBy: tab === "done" ? { completedAt: "desc" } : tab === "new" ? { createdAt: "desc" } : [{ pickupDate: "asc" }, { slotId: "asc" }],
    take: tab === "done" ? 50 : 100,
  });
  return json(c, list.map((o) => serializeOrder(o, user)));
});

courierRoutes.get("/courier/counts", async (c) => {
  const user = c.get("user");
  const cityIds = isAdmin(user.role) && user.cityIds.length === 0 ? undefined : user.cityIds;
  const [fresh, mine] = await Promise.all([
    courierHandles(user.role, user.services, "trash")
      ? db().order.count({ where: { status: "open", archivedAt: null, ...(cityIds ? { cityId: { in: cityIds } } : {}) } })
      : Promise.resolve(0),
    db().order.count({ where: { courierId: user.id, status: { in: ["accepted", "on_the_way"] } } }),
  ]);
  // Carpet & curtain orders count too, for couriers who handle them.
  const washServices = isAdmin(user.role) ? (["carpet", "curtain"] as const) : user.services.filter((s): s is "carpet" | "curtain" => s !== "trash");
  const [wNew, wMine] = washServices.length
    ? await Promise.all([
        db().washOrder.count({ where: { status: "created", service: { in: [...washServices] }, ...(cityIds ? { cityId: { in: cityIds } } : {}) } }),
        db().washOrder.count({ where: { courierId: user.id, status: { in: ["courier_assigned", "measured", "quote_sent", "client_confirmed", "picked_up", "washed", "out_for_delivery"] } } }),
      ])
    : [0, 0];
  return json(c, { new: fresh + wNew, mine: mine + wMine });
});

courierRoutes.get("/courier/today", async (c) => json(c, await courierToday(c.get("user"))));

courierRoutes.post("/courier/orders/:id/accept", async (c) => {
  const user = c.get("user");
  return json(c, serializeOrder(await courierAccept(user, c.req.param("id")), user));
});

courierRoutes.post("/courier/orders/:id/on-the-way", async (c) => {
  const user = c.get("user");
  return json(c, serializeOrder(await courierOnTheWay(user, c.req.param("id")), user));
});

courierRoutes.post("/courier/orders/:id/give-back", async (c) => {
  const user = c.get("user");
  return json(c, serializeOrder(await courierGiveBack(user, c.req.param("id")), user));
});

const completeSchema = z.object({
  orderIds: z.array(z.string().max(40)).min(1).max(50),
  cashConfirmed: z.number().int().nonnegative().nullable().default(null),
  photoId: z.string().max(40).nullable().optional(),
});

courierRoutes.post("/courier/complete", async (c) => {
  const b = await body(c, completeSchema);
  return json(c, await courierComplete(c.get("user"), b.orderIds, b.cashConfirmed, b.photoId));
});

/** "Telegram location" navigation: the bot sends the pickup point as a location message to the courier. */
courierRoutes.post("/courier/orders/:id/send-location", async (c) => {
  const user = c.get("user");
  const o = await db().order.findUnique({ where: { id: c.req.param("id") } });
  if (!o || o.lat == null || o.lng == null) throw notFound();
  if (o.courierId !== user.id && !(o.status === "open" && user.cityIds.includes(o.cityId)) && !isAdmin(user.role)) throw forbidden();
  await tg().sendVenue(Number(user.telegramId), o.lat, o.lng, `#${o.number}`, o.address.slice(0, 200));
  return json(c, { ok: true });
});
