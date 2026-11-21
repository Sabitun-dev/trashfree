// The in-app bell: the same notifications the bot sends, with read state.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { body, json, type Env } from "../context";

export const notificationRoutes = new Hono<Env>();

notificationRoutes.get("/notifications", async (c) => {
  const user = c.get("user");
  const list = await db().notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 });
  return json(c, list.map((n) => ({ id: n.id, type: n.type, payload: n.payload, readAt: n.readAt, createdAt: n.createdAt })));
});

notificationRoutes.post("/notifications/read", async (c) => {
  const user = c.get("user");
  const b = await body(c, z.object({ ids: z.array(z.number().int()).max(100).optional() }));
  await db().notification.updateMany({ where: { userId: user.id, readAt: null, ...(b.ids ? { id: { in: b.ids } } : {}) }, data: { readAt: new Date() } });
  const unread = await db().notification.count({ where: { userId: user.id, readAt: null } });
  return json(c, { unread });
});
