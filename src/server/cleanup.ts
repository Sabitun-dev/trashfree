// Daily cleanup: archive old orders, delete old photos and support message copies, tidy technical tables.
// All retention periods are settings.
import { getStore } from "@netlify/blobs";
import { db } from "./db";
import { getSettings } from "./settings";

const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * 86_400_000);

export async function dailyCleanup(now = new Date()) {
  const s = await getSettings();
  const store = getStore({ name: "photos", consistency: "strong" });

  const archived = await db().order.updateMany({
    where: { status: { in: ["completed", "cancelled", "expired"] }, archivedAt: null, createdAt: { lt: daysAgo(s.retention.archiveMonths * 30, now) } },
    data: { archivedAt: now },
  });

  // Photos past retention, plus uploads never attached to an order (older than a day).
  let photos = 0;
  for (;;) {
    const batch = await db().orderPhoto.findMany({
      where: { OR: [{ createdAt: { lt: daysAgo(s.retention.photosDays, now) } }, { orderId: null, createdAt: { lt: daysAgo(1, now) } }] },
      select: { id: true, blobKey: true },
      take: 200,
    });
    if (!batch.length) break;
    for (const p of batch) await store.delete(p.blobKey).catch(() => {});
    await db().orderPhoto.deleteMany({ where: { id: { in: batch.map((p) => p.id) } } });
    photos += batch.length;
    if (batch.length < 200) break;
  }

  const support = await db().supportMessage.deleteMany({ where: { createdAt: { lt: daysAgo(s.retention.supportDays, now) } } });
  const [updates, counters, geocode, runs, pendingSubs, notifications] = await Promise.all([
    db().processedUpdate.deleteMany({ where: { createdAt: { lt: daysAgo(7, now) } } }),
    db().rateCounter.deleteMany({ where: { resetAt: { lt: daysAgo(1, now) } } }),
    db().geocodeCache.deleteMany({ where: { createdAt: { lt: daysAgo(90, now) } } }),
    db().schedulerRun.deleteMany({ where: { startedAt: { lt: daysAgo(30, now) } } }),
    db().subscription.deleteMany({ where: { status: "pending", createdAt: { lt: daysAgo(2, now) }, payments: { none: { status: "paid" } } } }),
    db().notification.deleteMany({ where: { createdAt: { lt: daysAgo(180, now) } } }),
  ]);
  return {
    archived: archived.count,
    photos,
    supportMessages: support.count,
    processedUpdates: updates.count,
    rateCounters: counters.count,
    geocode: geocode.count,
    schedulerRuns: runs.count,
    pendingSubscriptions: pendingSubs.count,
    notifications: notifications.count,
  };
}
