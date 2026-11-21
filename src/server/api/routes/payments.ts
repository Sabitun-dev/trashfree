// Payment history and receipts for the signed-in user.
import { Hono } from "hono";
import { z } from "zod";
import { isAdmin } from "../../../domain/permissions";
import { db } from "../../db";
import { notFound } from "../../errors";
import { receiptItems, findAccount } from "../../payments/accounts";
import { json, query, type Env } from "../context";

export const paymentRoutes = new Hono<Env>();

paymentRoutes.get("/payments", async (c) => {
  const user = c.get("user");
  const list = await db().payment.findMany({
    where: { userId: user.id, status: { in: ["paid", "failed", "cancelled", "pending"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { order: { select: { number: true } }, subscription: { include: { plan: true } } },
  });
  return json(
    c,
    list.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      provider: p.provider,
      status: p.status,
      receiptNo: p.receiptNo,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      orderId: p.orderId,
      orderNumber: p.order?.number ?? null,
      subscriptionId: p.subscriptionId,
      planName: p.subscription ? { nameUz: p.subscription.plan.nameUz, nameRu: p.subscription.plan.nameRu, nameEn: p.subscription.plan.nameEn } : null,
    })),
  );
});

/** In-app receipt: number, date, items, method, total. */
paymentRoutes.get("/receipt", async (c) => {
  const user = c.get("user");
  const q = query(c, z.object({ orderId: z.string().max(40).optional(), paymentId: z.string().max(40).optional() }));
  const p = await db().payment.findFirst({
    where: { status: "paid", ...(q.paymentId ? { id: q.paymentId } : { orderId: q.orderId ?? "-" }) },
    orderBy: { paidAt: "desc" },
  });
  if (!p || (p.userId !== user.id && !isAdmin(user.role))) throw notFound();
  const account = await findAccount(p.orderId ?? `s${p.subscriptionId}`);
  const items = account ? await receiptItems(account) : [];
  const order = p.orderId ? await db().order.findUnique({ where: { id: p.orderId }, select: { number: true } }) : null;
  return json(c, {
    receiptNo: p.receiptNo,
    paidAt: p.paidAt,
    method: p.method,
    provider: p.provider,
    total: p.amount,
    orderNumber: order?.number ?? null,
    items: items.map((i) => ({ title: i.title, count: i.count, price: i.price, ikpu: i.code || null })),
  });
});
