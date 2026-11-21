// Jobs for the scheduler (every 15 minutes). Each job is safe to run twice.
import { db } from "../db";
import { safeLog } from "../errors";
import { notify } from "../notify/send";

/**
 * Online orders not paid within the timeout become `expired`. They never reached couriers.
 * Orders with a Payme transaction still in progress (state 1) are left alone until Payme finishes.
 */
export async function expireAwaitingPayments(now = new Date()) {
  const stale = await db().order.findMany({
    where: { status: "awaiting_payment", expiresAt: { lt: now }, payments: { none: { provider: "payme", state: 1 } } },
    select: { id: true, number: true, customerId: true },
    take: 200,
  });
  let expired = 0;
  for (const o of stale) {
    const n = await db().order.updateMany({ where: { id: o.id, status: "awaiting_payment" }, data: { status: "expired", paymentStatus: "failed", cancelledAt: now } });
    if (n.count !== 1) continue;
    expired++;
    await db().payment.updateMany({ where: { orderId: o.id, status: { in: ["created", "pending"] }, provider: { not: "payme" } }, data: { status: "failed" } });
    await notify({ userId: o.customerId, type: "order_expired", params: { n: o.number }, screen: { name: "order", id: o.id }, dedupKey: `expired:${o.id}` }).catch((e) => safeLog("expire notify", e));
  }
  return { expired };
}

type Job = { name: string; run: (now: Date) => Promise<unknown>; daily?: boolean };

const JOBS: Job[] = [{ name: "expire_payments", run: expireAwaitingPayments }];

export function registerJob(job: Job) {
  JOBS.push(job);
}

/** Runs all jobs; daily jobs only once per Tashkent day (after 03:00). */
export async function runScheduler(now = new Date()) {
  const results: Record<string, unknown> = {};
  for (const job of JOBS) {
    if (job.daily) {
      const tkHour = (now.getUTCHours() + 5) % 24;
      const since = new Date(now.getTime() - 20 * 3600_000);
      const recent = await db().schedulerRun.findFirst({ where: { job: job.name, ok: true, startedAt: { gt: since } } });
      if (recent || tkHour < 3) continue;
    }
    const run = await db().schedulerRun.create({ data: { job: job.name } });
    try {
      const info = await job.run(now);
      results[job.name] = info;
      await db().schedulerRun.update({ where: { id: run.id }, data: { ok: true, finishedAt: new Date(), info: JSON.parse(JSON.stringify(info ?? null)) } });
    } catch (e) {
      safeLog(`job ${job.name} failed`, e);
      results[job.name] = "failed";
      await db().schedulerRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), info: { error: e instanceof Error ? e.message : String(e) } } });
    }
  }
  return results;
}
