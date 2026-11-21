// Postgres implementations of the Payme and Click stores. Every callback is stored raw on its payment row.
import { somToTiyin } from "../../domain/money";
import { audit } from "../audit";
import { db } from "../db";
import { findAccount, receiptItems, settlePayment } from "./accounts";
import type { ClickStore, ClickTx } from "./click";
import type { PaymeStore, PaymeTx } from "./payme";

type PaymentRow = Awaited<ReturnType<ReturnType<typeof db>["payment"]["findFirst"]>> & {};

const accountOf = (p: { orderId: string | null; subscriptionId: number | null }) => p.orderId ?? `s${p.subscriptionId}`;
const accountWhere = (accountId: string) => (/^s\d+$/.test(accountId) ? { subscriptionId: Number(accountId.slice(1)) } : { orderId: accountId });
const raw = (x: unknown) => JSON.parse(JSON.stringify(x ?? null));

function toPaymeTx(p: NonNullable<PaymentRow>): PaymeTx {
  return {
    id: p.providerTxId!.replace(/^payme:/, ""),
    accountId: accountOf(p),
    paymentId: p.id,
    amount: somToTiyin(p.amount),
    state: (p.state ?? 1) as PaymeTx["state"],
    createTime: Number(p.createTime ?? 0),
    performTime: Number(p.performTime ?? 0),
    cancelTime: Number(p.cancelTime ?? 0),
    reason: p.reason,
  };
}

export const prismaPaymeStore: PaymeStore = {
  async findAccount(accountId) {
    const a = await findAccount(accountId);
    return a && { id: a.id, amount: a.amount, payable: a.payable, paid: a.paid };
  },
  async findTx(txId) {
    const p = await db().payment.findUnique({ where: { providerTxId: `payme:${txId}` } });
    return p ? toPaymeTx(p) : null;
  },
  async liveTxs(accountId) {
    const rows = await db().payment.findMany({ where: { provider: "payme", state: { in: [1, 2] }, ...accountWhere(accountId) } });
    return rows.map(toPaymeTx);
  },
  async createTx(t) {
    const a = await findAccount(t.accountId);
    const order = a?.kind === "order" ? await db().order.findUnique({ where: { id: t.accountId }, select: { paymentMethod: true } }) : null;
    const p = await db().payment.create({
      data: {
        userId: a!.userId,
        ...accountWhere(t.accountId),
        provider: "payme",
        method: order?.paymentMethod === "card" ? "card" : "payme",
        providerTxId: `payme:${t.id}`,
        amount: a!.amount,
        status: "pending",
        state: 1,
        createTime: BigInt(t.createTime),
      },
    });
    return toPaymeTx(p);
  },
  async performTx(txId, performTime) {
    const p = await db().payment.update({ where: { providerTxId: `payme:${txId}` }, data: { state: 2, performTime: BigInt(performTime) } });
    await settlePayment(p.id);
  },
  async cancelTx(txId, state, reason, cancelTime) {
    const p = await db().payment.update({ where: { providerTxId: `payme:${txId}` }, data: { state, reason, cancelTime: BigInt(cancelTime), status: "cancelled" } });
    if (state === -2) {
      // Refund by Payme after payment: the order/subscription is cancelled too.
      if (p.orderId) {
        await db().order.updateMany({ where: { id: p.orderId, status: "open" }, data: { status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date(), cancelledBy: "system", cancelReason: "Payme refund" } });
      }
      if (p.subscriptionId) await db().subscription.updateMany({ where: { id: p.subscriptionId }, data: { status: "cancelled" } });
      await audit({ actorId: null, action: "payment.refunded_by_provider", entity: "payment", entityId: p.id, reason: `payme reason ${reason}` });
    }
  },
  async canCancelPerformed(accountId) {
    if (/^s\d+$/.test(accountId)) {
      const s = await db().subscription.findUnique({ where: { id: Number(accountId.slice(1)) } });
      return !!s && s.pickupsUsed === 0;
    }
    const o = await db().order.findUnique({ where: { id: accountId } });
    return !!o && (o.status === "open" || o.status === "cancelled");
  },
  async statement(from, to) {
    const rows = await db().payment.findMany({ where: { provider: "payme", createTime: { gte: BigInt(from), lte: BigInt(to) } }, orderBy: { createTime: "asc" } });
    return rows.map(toPaymeTx);
  },
  async receiptDetail(accountId) {
    const a = await findAccount(accountId);
    if (!a) return undefined;
    const items = await receiptItems(a);
    return { receipt_type: 0, items: items.map((i) => ({ ...i, price: somToTiyin(i.price) })) };
  },
  async appendRaw(txId, r) {
    await db().payment.updateMany({ where: { providerTxId: `payme:${txId}` }, data: { rawCallback: { push: raw(r) } } });
  },
};

function toClickTx(p: NonNullable<PaymentRow>): ClickTx {
  return {
    prepareId: p.clickPrepareId!,
    clickTransId: p.providerTxId!.replace(/^click:/, ""),
    accountId: accountOf(p),
    status: p.status === "paid" ? "paid" : p.status === "cancelled" || p.status === "failed" ? "cancelled" : "pending",
  };
}

export const prismaClickStore: ClickStore = {
  async findAccount(accountId) {
    const a = await findAccount(accountId);
    return a && { id: a.id, amount: a.amount, payable: a.payable, paid: a.paid };
  },
  async findByClickTx(clickTransId) {
    const p = await db().payment.findUnique({ where: { providerTxId: `click:${clickTransId}` } });
    return p ? toClickTx(p) : null;
  },
  async findByPrepareId(prepareId) {
    if (!Number.isInteger(prepareId)) return null;
    const p = await db().payment.findUnique({ where: { clickPrepareId: prepareId } });
    return p && p.provider === "click" ? toClickTx(p) : null;
  },
  async prepare(accountId, clickTransId, _amount, r) {
    const a = (await findAccount(accountId))!;
    const order = a.kind === "order" ? await db().order.findUnique({ where: { id: accountId }, select: { paymentMethod: true } }) : null;
    try {
      const p = await db().payment.create({
        data: {
          userId: a.userId,
          ...accountWhere(accountId),
          provider: "click",
          method: order?.paymentMethod === "card" ? "card" : "click",
          providerTxId: `click:${clickTransId}`,
          amount: a.amount,
          status: "pending",
          rawCallback: [raw(r)],
        },
      });
      return toClickTx(p);
    } catch {
      // Same click_trans_id arrived twice at once: return the first one.
      const p = await db().payment.findUniqueOrThrow({ where: { providerTxId: `click:${clickTransId}` } });
      return toClickTx(p);
    }
  },
  async complete(prepareId, r) {
    const p = await db().payment.findUniqueOrThrow({ where: { clickPrepareId: prepareId } });
    await settlePayment(p.id, r);
  },
  async cancel(prepareId, r) {
    await db().payment.updateMany({ where: { clickPrepareId: prepareId, status: { not: "paid" } }, data: { status: "cancelled", rawCallback: { push: raw(r) } } });
  },
};
