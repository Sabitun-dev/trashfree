// Broadcasts: preview first, then queue one delivery row per person and send throttled (~25 messages/s)
// from a background function (up to 15 minutes). The scheduler resumes anything left over.
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Screen } from "../../domain/deeplink";
import { audit } from "../audit";
import { sleep } from "../bot/telegram";
import { db } from "../db";
import { env } from "../env";
import { safeLog } from "../errors";
import { notify } from "../notify/send";
import type { AuthUser } from "../users";

export const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(3500),
  button: z.enum(["home", "new_order", "plans", "courier"]).nullable().default(null),
  audience: z.enum(["all", "customers", "couriers", "city"]),
  cityId: z.number().int().nullable().optional(),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export function audienceWhere(b: Pick<BroadcastInput, "audience" | "cityId">): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { deletedAt: null, blocked: false, telegramId: { gt: 0 } };
  switch (b.audience) {
    case "customers":
      return { ...base, role: "customer" };
    case "couriers":
      return { ...base, role: "courier" };
    case "city":
      return { ...base, OR: [{ orders: { some: { cityId: b.cityId ?? -1 } } }, { courierCities: { some: { cityId: b.cityId ?? -1 } } }] };
    default:
      return base;
  }
}

const text = (b: { title: string; text: string }) => `📣 ${b.title}\n\n${b.text}`;
const screenOf = (button: string | null): Screen => ({ name: (button ?? "home") as "home" });

export async function audienceCount(b: BroadcastInput) {
  return db().user.count({ where: audienceWhere(b) });
}

export async function previewBroadcast(admin: AuthUser, b: BroadcastInput) {
  await notify({ userId: admin.id, type: "broadcast", params: { title: b.title }, text: text(b), screen: screenOf(b.button), dedupKey: `bcpreview:${Date.now()}` });
  return { count: await audienceCount(b) };
}

export async function createBroadcast(admin: AuthUser, b: BroadcastInput) {
  const users = await db().user.findMany({ where: audienceWhere(b), select: { id: true } });
  const bc = await db().broadcast.create({
    data: { createdById: admin.id, title: b.title, text: b.text, button: b.button, audience: b.audience, cityId: b.cityId ?? null, status: "sending", total: users.length, startedAt: new Date() },
  });
  for (let i = 0; i < users.length; i += 1000) {
    await db().broadcastDelivery.createMany({ data: users.slice(i, i + 1000).map((u) => ({ broadcastId: bc.id, userId: u.id })), skipDuplicates: true });
  }
  await audit({ actorId: admin.id, action: "broadcast.send", entity: "broadcast", entityId: bc.id, after: { audience: b.audience, cityId: b.cityId, total: users.length, title: b.title } });
  await triggerBackground(bc.id);
  return bc;
}

/** The background function is protected by an HMAC of the broadcast id. */
export const backgroundSig = (id: number) => createHmac("sha256", env.webhookSecret).update(`broadcast:${id}`).digest("hex");

export async function triggerBackground(id: number) {
  try {
    await fetch(`${env.siteUrl}/.netlify/functions/broadcast-background`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": backgroundSig(id) },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    safeLog("broadcast trigger failed (the scheduler will resume it)", e);
  }
}

/** Claim deliveries atomically, so two runners never send the same message twice. */
async function claim(broadcastId: number, n: number) {
  return db().$queryRaw<{ id: number; userId: number }[]>`
    UPDATE "BroadcastDelivery" SET status = 'sending', "sentAt" = now()
    WHERE id IN (SELECT id FROM "BroadcastDelivery" WHERE "broadcastId" = ${broadcastId} AND status = 'queued' ORDER BY id LIMIT ${n} FOR UPDATE SKIP LOCKED)
    RETURNING id, "userId"`;
}

export async function processBroadcast(id: number, budgetMs = 14 * 60_000) {
  const started = Date.now();
  const bc = await db().broadcast.findUnique({ where: { id } });
  if (!bc || bc.status !== "sending") return { done: true };
  while (Date.now() - started < budgetMs) {
    const batch = await claim(id, 25);
    if (!batch.length) break;
    for (const d of batch) {
      const t0 = Date.now();
      const r = await notify({ userId: d.userId, type: "broadcast", params: { title: bc.title, text: bc.text.slice(0, 200) }, text: text(bc), screen: screenOf(bc.button), dedupKey: `bc:${id}` }).catch(() => "failed" as const);
      const status = r === "sent" ? "sent" : r === "blocked" || r === "muted" ? "blocked" : r === "duplicate" ? "sent" : "failed";
      await db().broadcastDelivery.update({ where: { id: d.id }, data: { status, error: r === "muted" ? "muted" : r === "failed" ? "send_failed" : null, sentAt: new Date() } });
      const wait = 40 - (Date.now() - t0); // ~25 messages per second
      if (wait > 0) await sleep(wait);
    }
    await refreshCounts(id);
  }
  return refreshCounts(id);
}

export async function refreshCounts(id: number) {
  const g = await db().broadcastDelivery.groupBy({ by: ["status"], where: { broadcastId: id }, _count: true });
  const c = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
  const left = c("queued") + c("sending");
  await db().broadcast.update({
    where: { id },
    data: { sent: c("sent"), failed: c("failed"), blocked: c("blocked"), ...(left === 0 ? { status: "done", finishedAt: new Date() } : {}) },
  });
  return { done: left === 0, sent: c("sent"), failed: c("failed"), blocked: c("blocked") };
}

/** Scheduler: re-queue stuck deliveries and restart unfinished broadcasts. */
export async function resumeBroadcasts() {
  await db().broadcastDelivery.updateMany({ where: { status: "sending", sentAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "queued" } });
  const open = await db().broadcast.findMany({ where: { status: "sending" }, select: { id: true } });
  for (const b of open) await triggerBackground(b.id);
  return { resumed: open.length };
}
