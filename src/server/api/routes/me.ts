// The signed-in user: bootstrap data, profile, settings, invites, data deletion.
import { Hono } from "hono";
import { z } from "zod";
import { MUTABLE_CATEGORIES } from "../../../domain/types";
import { audit } from "../../audit";
import { catalog } from "../../catalog";
import { db } from "../../db";
import { bad, conflict } from "../../errors";
import { getSettings } from "../../settings";
import { activeSubscription, serializeSubscription } from "../../subscriptions/service";
import { botUsername } from "../../bot/telegram";
import { env } from "../../env";
import { publicMe } from "../../users";
import { json, body, type Env } from "../context";

export const meRoutes = new Hono<Env>();

meRoutes.get("/bootstrap", async (c) => {
  const user = c.get("user");
  const [cat, settings, sub, unread, username] = await Promise.all([
    catalog(),
    getSettings(),
    activeSubscription(user.id),
    db().notification.count({ where: { userId: user.id, readAt: null } }),
    botUsername().catch(() => null),
  ]);
  return json(c, {
    me: publicMe(user),
    startParam: c.get("startParam") ?? null,
    catalog: cat,
    settings: {
      maxQuantity: settings.maxQuantity,
      maxPhotos: settings.maxPhotos,
      bookingDaysAhead: settings.bookingDaysAhead,
      slotCutoffMinutes: settings.slotCutoffMinutes,
      paymentTimeoutMinutes: settings.paymentTimeoutMinutes,
      methods: settings.methods,
      prioritySlotsForSubscribers: settings.prioritySlotsForSubscribers,
      supportPhone: settings.supportPhone,
    },
    subscription: sub ? serializeSubscription(sub) : null,
    unread,
    bot: { username, app: env.miniAppShortName },
  });
});

meRoutes.get("/me", (c) => json(c, publicMe(c.get("user"))));

meRoutes.post("/me", async (c) => {
  const user = c.get("user");
  const b = await body(
    c,
    z.object({
      language: z.enum(["uz", "ru", "en"]).optional(),
      name: z.string().trim().min(1).max(80).optional(),
      nameConfirmed: z.boolean().optional(),
      introSeen: z.enum(["customer", "courier", "admin"]).optional(),
      mutedCategories: z.array(z.enum(MUTABLE_CATEGORIES)).optional(),
    }),
  );
  const data: Record<string, unknown> = {};
  if (b.language) data.language = b.language;
  if (b.name) data.name = b.name;
  if (b.nameConfirmed !== undefined) data.nameConfirmed = b.nameConfirmed;
  if (b.introSeen && !user.introSeen.includes(b.introSeen)) data.introSeen = [...user.introSeen, b.introSeen];
  if (b.mutedCategories) data.mutedCategories = b.mutedCategories;
  const u = await db().user.update({ where: { id: user.id }, data, include: { courierCities: true } });
  return json(c, publicMe({ ...user, ...u, cityIds: u.courierCities.map((x) => x.cityId) }));
});

meRoutes.post("/me/delete-request", async (c) => {
  const user = c.get("user");
  if (!user.deletionRequestedAt) {
    await db().user.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date() } });
    await audit({ actorId: user.id, action: "privacy.deletion_requested", entity: "user", entityId: user.id });
  }
  return json(c, { ok: true });
});

meRoutes.post("/me/delete-request/cancel", async (c) => {
  await db().user.update({ where: { id: c.get("user").id }, data: { deletionRequestedAt: null } });
  return json(c, { ok: true });
});

/** A courier invite link: t.me/<bot>/<app>?startapp=inv_<token> */
meRoutes.post("/invite/accept", async (c) => {
  const user = c.get("user");
  const { token } = await body(c, z.object({ token: z.string().regex(/^[A-Za-z0-9-]{8,48}$/) }));
  const inv = await db().invite.findUnique({ where: { token } });
  if (!inv || inv.expiresAt < new Date()) throw bad("invite_invalid");
  if (inv.usedById && inv.usedById !== user.id) throw conflict("invite_used");
  await db().$transaction(async (tx) => {
    await tx.invite.update({ where: { id: inv.id }, data: { usedById: user.id, usedAt: new Date() } });
    if (user.role === "customer") await tx.user.update({ where: { id: user.id }, data: { role: "courier" } });
    for (const cityId of inv.cityIds) {
      await tx.courierCity.upsert({ where: { userId_cityId: { userId: user.id, cityId } }, create: { userId: user.id, cityId }, update: {} });
    }
    await audit({ actorId: user.id, action: "courier.invite_accepted", entity: "user", entityId: user.id, after: { cityIds: inv.cityIds } }, tx);
  });
  return json(c, { ok: true, role: user.role === "customer" ? "courier" : user.role });
});
