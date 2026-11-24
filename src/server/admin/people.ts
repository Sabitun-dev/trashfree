// People: roles, courier cities, blocking, invites, manual subscriptions, and privacy erasure.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import type { ServiceCode } from "../../domain/services";
import type { Role } from "../../domain/types";
import { audit } from "../audit";
import { appLink } from "../bot/telegram";
import { db } from "../db";
import { bad, forbidden, notFound } from "../errors";
import { activateSubscription } from "../payments/accounts";
import type { AuthUser } from "../users";

export async function searchPeople(q: string | undefined, role: Role | undefined) {
  const digits = q?.replace(/\D/g, "") ?? "";
  return db().user.findMany({
    where: {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []), { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } }] }
        : {}),
    },
    include: { courierCities: true, _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Owners manage admins; admins manage couriers and customers. Nobody changes an owner here. */
export async function setRole(actor: AuthUser, userId: number, role: Role, cityIds?: number[]) {
  const u = await db().user.findUnique({ where: { id: userId }, include: { courierCities: true } });
  if (!u) throw notFound();
  if (u.role === "owner" || role === "owner") throw forbidden();
  if ((role === "admin" || u.role === "admin") && actor.role !== "owner") throw forbidden();
  if (role === "courier" && !cityIds?.length && !u.courierCities.length) throw bad("invalid");
  await db().$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    if (cityIds) {
      await tx.courierCity.deleteMany({ where: { userId } });
      if (cityIds.length) await tx.courierCity.createMany({ data: cityIds.map((cityId) => ({ userId, cityId })) });
    }
    // A new courier handles trash pickup by default, as couriers always did.
    if (role === "courier" && !(await tx.courierService.count({ where: { userId } }))) await tx.courierService.create({ data: { userId, service: "trash" } });
    await audit({ actorId: actor.id, action: "user.role", entity: "user", entityId: userId, before: { role: u.role, cityIds: u.courierCities.map((c) => c.cityId) }, after: { role, cityIds } }, tx);
  });
}

/** Which services a courier may handle (trash, carpet, curtain). Audit-logged. */
export async function setCourierServices(actor: AuthUser, userId: number, services: ServiceCode[]) {
  const before = await db().courierService.findMany({ where: { userId } });
  await db().$transaction(async (tx) => {
    await tx.courierService.deleteMany({ where: { userId } });
    if (services.length) await tx.courierService.createMany({ data: services.map((service) => ({ userId, service })) });
    await audit({ actorId: actor.id, action: "user.services", entity: "user", entityId: userId, before: before.map((b) => b.service), after: services }, tx);
  });
}

export async function setBlocked(actor: AuthUser, userId: number, blocked: boolean, reason: string | null) {
  const u = await db().user.findUnique({ where: { id: userId } });
  if (!u) throw notFound();
  if (u.role === "owner" || u.id === actor.id) throw forbidden();
  if (u.role === "admin" && actor.role !== "owner") throw forbidden();
  await db().user.update({ where: { id: userId }, data: { blocked, blockedReason: blocked ? reason : null } });
  await audit({ actorId: actor.id, action: blocked ? "user.block" : "user.unblock", entity: "user", entityId: userId, before: { blocked: u.blocked }, after: { blocked }, reason });
}

export async function createInvite(actor: AuthUser, cityIds: number[], services: ServiceCode[] = ["trash"]) {
  if (!cityIds.length || !services.length) throw bad("invalid");
  const token = randomBytes(12).toString("base64url").replace(/_/g, "-");
  await db().invite.create({ data: { token, cityIds, services, createdById: actor.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
  await audit({ actorId: actor.id, action: "courier.invite_created", entity: "invite", entityId: token.slice(0, 6), after: { cityIds, services } });
  return { token, link: await appLink({ name: "invite", token }) };
}

export async function grantSubscription(actor: AuthUser, userId: number, planId: number, note: string) {
  const plan = await db().subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound();
  const sub = await db().$transaction(async (tx) => {
    const s = await tx.subscription.create({ data: { userId, planId, pickupsTotal: plan.pickups, status: "pending" } });
    await tx.payment.create({ data: { userId, subscriptionId: s.id, provider: "manual", method: "cash", amount: plan.price, status: "paid", paidAt: new Date(), receiptNo: `TF-M-${s.id}` } });
    await activateSubscription(tx, s.id, new Date());
    await audit({ actorId: actor.id, action: "subscription.manual", entity: "user", entityId: userId, after: { planId, subscriptionId: s.id }, reason: note }, tx);
    return s;
  });
  return sub;
}

/**
 * "Ma'lumotlarimni o'chirish": after an admin confirms, personal data is removed.
 * Orders stay with their totals but without name, phone, address, notes, location or photos.
 */
export async function erasePersonalData(actor: AuthUser, userId: number) {
  const u = await db().user.findUnique({ where: { id: userId } });
  if (!u) throw notFound();
  if (u.role === "owner") throw forbidden();
  const photos = await db().orderPhoto.findMany({ where: { OR: [{ uploaderId: userId }, { order: { customerId: userId } }] }, select: { id: true, blobKey: true } });
  const store = getStore({ name: "photos", consistency: "strong" });
  for (const p of photos) await store.delete(p.blobKey).catch(() => {});
  await db().$transaction(async (tx) => {
    await tx.orderPhoto.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });
    await tx.order.updateMany({ where: { customerId: userId }, data: { address: "—", notes: null, lat: null, lng: null, ratingComment: null } });
    await tx.address.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.supportThread.deleteMany({ where: { userId } });
    await tx.courierCity.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: { telegramId: BigInt(-userId), name: "—", username: null, phone: null, role: "customer", deletedAt: new Date(), deletionRequestedAt: null, blocked: true, botBlocked: true },
    });
    await audit({ actorId: actor.id, action: "privacy.erased", entity: "user", entityId: userId, reason: "user request" }, tx);
  });
}
