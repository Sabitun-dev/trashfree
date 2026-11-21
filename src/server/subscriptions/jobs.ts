// Subscription reminders (3 days before and on the day) and expiry.
import { reminderDue, daysLeft, pickupsLeft } from "../../domain/subscription";
import { db } from "../db";
import { notify } from "../notify/send";
import { getSettings } from "../settings";

export async function subscriptionReminders(now = new Date()) {
  const settings = await getSettings();
  const horizon = new Date(now.getTime() + (settings.subscriptionReminderDays + 1) * 86_400_000);
  const subs = await db().subscription.findMany({ where: { status: "active", periodEnd: { lt: horizon } }, take: 500 });
  const stats = { expiring: 0, today: 0, expired: 0 };
  for (const s of subs) {
    const renewed = !!(await db().subscription.findFirst({ where: { userId: s.userId, status: "active", id: { not: s.id }, periodEnd: { gt: s.periodEnd! } }, select: { id: true } }));
    const kind = reminderDue({ periodEnd: s.periodEnd!, reminded3d: s.reminded3d, remindedDay: s.remindedDay, status: s.status }, now, settings.subscriptionReminderDays, renewed);
    if (!kind) continue;
    const until = new Date(s.periodEnd!.getTime() + 5 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join(".");
    const renew = [{ key: "renew" as const, screen: { name: "plans" as const } }];
    if (kind === "expired") {
      await db().subscription.update({ where: { id: s.id }, data: { status: "expired" } });
      if (!renewed) await notify({ userId: s.userId, type: "sub_expired", screen: { name: "plans" }, dedupKey: `subexp:${s.id}`, extraButtons: renew });
    } else if (kind === "today") {
      await db().subscription.update({ where: { id: s.id }, data: { remindedDay: true, reminded3d: true } });
      await notify({ userId: s.userId, type: "sub_expires_today", params: { until }, screen: { name: "plans" }, dedupKey: `subday:${s.id}`, extraButtons: renew });
    } else {
      await db().subscription.update({ where: { id: s.id }, data: { reminded3d: true } });
      await notify({ userId: s.userId, type: "sub_expiring", params: { days: daysLeft(s.periodEnd!, now), until, left: pickupsLeft(s) }, screen: { name: "plans" }, dedupKey: `sub3d:${s.id}`, extraButtons: renew });
    }
    stats[kind]++;
  }
  return stats;
}
