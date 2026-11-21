// Subscriptions: plans, my subscription, buying (paid manually each month — no auto-renew).
import { Hono } from "hono";
import { z } from "zod";
import { catalog } from "../../catalog";
import { db } from "../../db";
import { bad, notFound } from "../../errors";
import { startSubscriptionPayment } from "../../payments/start";
import { enforce } from "../../ratelimit";
import { getSettings } from "../../settings";
import { activeSubscription, serializeSubscription } from "../../subscriptions/service";
import { body, json, type Env } from "../context";

export const subscriptionRoutes = new Hono<Env>();

subscriptionRoutes.get("/subscriptions", async (c) => {
  const user = c.get("user");
  const now = new Date();
  const [active, upcoming, cat] = await Promise.all([
    activeSubscription(user.id),
    db().subscription.findFirst({ where: { userId: user.id, status: "active", periodStart: { gt: now } }, include: { plan: true }, orderBy: { periodStart: "asc" } }),
    catalog(),
  ]);
  return json(c, {
    active: active ? serializeSubscription(active) : null,
    upcoming: upcoming ? serializeSubscription(upcoming) : null,
    plans: cat.plans,
  });
});

subscriptionRoutes.post("/subscriptions", async (c) => {
  const user = c.get("user");
  const b = await body(c, z.object({ planId: z.number().int(), method: z.enum(["click", "payme", "card"]) }));
  await enforce(`subbuy:${user.id}`, 10, 3600);
  const settings = await getSettings();
  if (!settings.methods[b.method]) throw bad("method_disabled");
  const plan = await db().subscriptionPlan.findFirst({ where: { id: b.planId, active: true } });
  if (!plan) throw notFound();
  const sub = await db().subscription.create({ data: { userId: user.id, planId: plan.id, pickupsTotal: plan.pickups, status: "pending" } });
  try {
    const payment = await startSubscriptionPayment(sub.id, user, b.method);
    return json(c, { subscriptionId: sub.id, payment });
  } catch (e) {
    await db().subscription.delete({ where: { id: sub.id } }).catch(() => {});
    throw e;
  }
});
