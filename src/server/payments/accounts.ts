// A payment "account" is what is being paid for: an order (its id) or a subscription ("s<id>").
// Settlement is idempotent: a payment that is already paid changes nothing.
import { formatSom } from "../../domain/money";
import { localName } from "../../domain/types";
import { asLang, bt } from "../bot/texts";
import { db, type Tx } from "../db";
import { safeLog } from "../errors";
import { notifyCouriersNewOrder } from "../notify/events";
import { notify } from "../notify/send";
import { loadOrder } from "../orders/service";
import { catalog } from "../catalog";

export interface Account {
  id: string;
  kind: "order" | "subscription";
  refId: string | number;
  userId: number;
  amount: number; // so'm
  /** Can a new payment start now? */
  payable: boolean;
  paid: boolean;
  title: string;
}

export const subAccountId = (subId: number) => `s${subId}`;

export async function findAccount(accountId: string, now = new Date()): Promise<Account | null> {
  if (/^s\d+$/.test(accountId)) {
    const sub = await db().subscription.findUnique({ where: { id: Number(accountId.slice(1)) }, include: { plan: true } });
    if (!sub) return null;
    return {
      id: accountId,
      kind: "subscription",
      refId: sub.id,
      userId: sub.userId,
      amount: sub.plan.price,
      payable: sub.status === "pending",
      paid: sub.status === "active" || sub.status === "expired",
      title: `Trashfree: ${sub.plan.nameUz}`,
    };
  }
  if (!/^[a-z0-9]{10,40}$/i.test(accountId)) return null;
  const o = await db().order.findUnique({ where: { id: accountId } });
  if (!o || o.paymentMethod === "cash" || o.paymentMethod === "subscription") return null;
  return {
    id: o.id,
    kind: "order",
    refId: o.id,
    userId: o.customerId,
    amount: o.priceTotal,
    payable: o.status === "awaiting_payment" && (!o.expiresAt || o.expiresAt > now),
    paid: o.paymentStatus === "paid",
    title: `Trashfree #${o.number}`,
  };
}

/** Fiscal receipt items (IKPU / package code per trash type). */
export async function receiptItems(account: Account) {
  if (account.kind === "subscription") {
    const sub = await db().subscription.findUnique({ where: { id: Number(account.refId) }, include: { plan: true } });
    return [{ title: `Obuna: ${sub?.plan.nameUz ?? ""}`, price: account.amount, count: 1, code: "", package_code: "", vat_percent: 0 }];
  }
  const o = await db().order.findUnique({ where: { id: String(account.refId) }, include: { trashType: true, packageSize: true } });
  if (!o) return [];
  return [
    {
      title: `${o.trashType.nameUz} chiqindini olib ketish (${o.packageSize.nameUz} × ${o.quantity})`.slice(0, 128),
      price: o.priceTotal,
      count: 1,
      code: o.trashType.ikpu ?? "",
      package_code: o.trashType.packageCode ?? "",
      vat_percent: o.trashType.vatPercent,
    },
  ];
}

function receiptNo(seq: number, at: Date) {
  const d = at.toISOString().slice(2, 10).replace(/-/g, "");
  return `TF-${d}-${String(seq).padStart(5, "0")}`;
}

/**
 * Marks a payment row as paid and applies it to the order / subscription. Idempotent.
 * Returns true only the first time.
 */
export async function settlePayment(paymentId: string, raw?: unknown): Promise<boolean> {
  const now = new Date();
  const res = await db().$transaction(async (tx) => {
    const n = await tx.payment.updateMany({ where: { id: paymentId, status: { not: "paid" } }, data: { status: "paid", paidAt: now } });
    if (n.count !== 1) return null;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await tx.payment.update({
      where: { id: p.id },
      data: { receiptNo: receiptNo(p.clickPrepareId ?? 0, now), ...(raw ? { rawCallback: { push: JSON.parse(JSON.stringify(raw)) } } : {}) },
    });
    let opened = false;
    if (p.orderId) opened = await applyToOrder(tx, p.orderId);
    if (p.subscriptionId) await activateSubscription(tx, p.subscriptionId, now);
    return { p, opened };
  });
  if (!res) return false;
  await afterSettle(res.p.id, res.opened).catch((e) => safeLog("afterSettle failed", e));
  return true;
}

async function applyToOrder(tx: Tx, orderId: string): Promise<boolean> {
  // awaiting_payment (or expired — a late but verified payment still counts) → open
  const n = await tx.order.updateMany({
    where: { id: orderId, status: { in: ["awaiting_payment", "expired"] } },
    data: { status: "open", paymentStatus: "paid", expiresAt: null },
  });
  if (n.count === 1) return true;
  // Cancelled meanwhile: keep it cancelled, but record the money (admin handles the refund manually).
  await tx.order.updateMany({ where: { id: orderId }, data: { paymentStatus: "paid" } });
  return false;
}

/** A renewal paid early starts when the current period ends. */
export async function activateSubscription(tx: Tx, subId: number, now: Date) {
  const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subId }, include: { plan: true } });
  if (sub.status === "active") return;
  const current = await tx.subscription.findFirst({ where: { userId: sub.userId, status: "active", periodEnd: { gt: now }, id: { not: sub.id } }, orderBy: { periodEnd: "desc" } });
  const start = current?.periodEnd && current.periodEnd > now ? current.periodEnd : now;
  const end = new Date(start.getTime() + sub.plan.durationDays * 86_400_000);
  await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", periodStart: start, periodEnd: end, pickupsTotal: sub.plan.pickups } });
}

async function afterSettle(paymentId: string, opened: boolean) {
  const p = await db().payment.findUniqueOrThrow({ where: { id: paymentId }, include: { user: true, subscription: { include: { plan: true } } } });
  const lang = asLang(p.user.language);
  const som = (n: number) => formatSom(n, lang === "ru" ? "сум" : "so'm");
  let item = "";
  if (p.orderId) {
    const o = await loadOrder(p.orderId);
    const cat = await catalog();
    const type = o && cat.trashTypes.find((t) => t.id === o.trashTypeId);
    if (o) item = `#${o.number} · ${type ? localName(type, lang) : ""} × ${o.quantity}`;
    if (o && opened) await notifyCouriersNewOrder(o);
  }
  if (p.subscription) {
    item = localName(p.subscription.plan, lang);
    const until = p.subscription.periodEnd?.toISOString().slice(0, 10).split("-").reverse().join(".") ?? "";
    await notify({ userId: p.userId, type: "sub_activated", params: { plan: item, pickups: p.subscription.pickupsTotal, until }, screen: { name: "plans" }, dedupKey: `subact:${p.subscriptionId}` });
  }
  await notify({
    userId: p.userId,
    type: "payment_paid",
    params: { receipt: p.receiptNo ?? "", item, total: som(p.amount), method: bt(lang, `method_${p.method}`) },
    screen: p.orderId ? { name: "order", id: p.orderId } : { name: "plans" },
    dedupKey: `paid:${p.id}`,
  });
}

/** Money for an order arrived but it can't be applied (e.g. cancelled): only visible to admins as "refund needed". */
export async function markPaymentFailed(paymentId: string, raw?: unknown) {
  await db().payment.updateMany({
    where: { id: paymentId, status: { in: ["created", "pending"] } },
    data: { status: "failed", ...(raw ? { rawCallback: { push: JSON.parse(JSON.stringify(raw)) } } : {}) },
  });
}
