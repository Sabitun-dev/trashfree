// Payme Merchant API (JSON-RPC, Basic auth "Paycom:<KEY>"). Amounts are in tiyin.
// Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction,
// CheckTransaction, GetStatement. Transaction timeout: 12 hours.
import { timingSafeEqual } from "node:crypto";
import { somToTiyin } from "../../domain/money";

export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export const PaymeError = {
  INVALID_AMOUNT: -31001,
  TX_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  ACCOUNT_NOT_FOUND: -31050,
  ACCOUNT_NOT_PAYABLE: -31051,
  ACCOUNT_BUSY: -31052,
  INSUFFICIENT_PRIVILEGE: -32504,
  METHOD_NOT_FOUND: -32601,
  INVALID_REQUEST: -32600,
  PARSE_ERROR: -32700,
  INTERNAL: -32400,
} as const;

const MESSAGES: Record<number, { ru: string; uz: string; en: string }> = {
  [-31001]: { ru: "Неверная сумма", uz: "Noto'g'ri summa", en: "Invalid amount" },
  [-31003]: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
  [-31007]: { ru: "Невозможно отменить транзакцию: услуга оказана", uz: "Bekor qilib bo'lmaydi: xizmat ko'rsatilgan", en: "Cannot cancel: service already provided" },
  [-31008]: { ru: "Невозможно выполнить операцию", uz: "Amalni bajarib bo'lmaydi", en: "Unable to perform the operation" },
  [-31050]: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
  [-31051]: { ru: "Заказ нельзя оплатить", uz: "Buyurtmani to'lab bo'lmaydi", en: "Order cannot be paid" },
  [-31052]: { ru: "Заказ уже ожидает оплаты другой транзакцией", uz: "Buyurtma boshqa tranzaksiya bilan to'lanmoqda", en: "Order is being paid by another transaction" },
  [-32504]: { ru: "Недостаточно привилегий", uz: "Ruxsat yo'q", en: "Insufficient privilege" },
  [-32601]: { ru: "Метод не найден", uz: "Metod topilmadi", en: "Method not found" },
  [-32600]: { ru: "Неверный запрос", uz: "Noto'g'ri so'rov", en: "Invalid request" },
  [-32700]: { ru: "Ошибка разбора JSON", uz: "JSON xato", en: "Parse error" },
  [-32400]: { ru: "Внутренняя ошибка", uz: "Ichki xato", en: "Internal error" },
};

export interface PaymeAccount {
  id: string;
  amount: number; // so'm
  payable: boolean;
  paid: boolean;
}

export interface PaymeTx {
  id: string; // Payme's transaction id
  accountId: string;
  paymentId: string; // our Payment row id ("transaction" in responses)
  amount: number; // tiyin
  state: 1 | 2 | -1 | -2;
  createTime: number;
  performTime: number;
  cancelTime: number;
  reason: number | null;
}

export interface PaymeStore {
  findAccount(accountId: string): Promise<PaymeAccount | null>;
  findTx(txId: string): Promise<PaymeTx | null>;
  /** Transactions of an account that are pending (state 1) or performed (state 2). */
  liveTxs(accountId: string): Promise<PaymeTx[]>;
  createTx(tx: { id: string; accountId: string; amount: number; createTime: number; time: number }): Promise<PaymeTx>;
  performTx(txId: string, performTime: number): Promise<void>;
  cancelTx(txId: string, state: -1 | -2, reason: number, cancelTime: number): Promise<void>;
  /** May a performed transaction be cancelled (refunded)? No once the courier has taken the order. */
  canCancelPerformed(accountId: string): Promise<boolean>;
  statement(from: number, to: number): Promise<PaymeTx[]>;
  receiptDetail(accountId: string): Promise<unknown>;
  appendRaw(txId: string, raw: unknown): Promise<void>;
}

type RpcId = string | number | null;
export type RpcResponse = { jsonrpc: "2.0"; id: RpcId; result: unknown } | { jsonrpc: "2.0"; id: RpcId; error: { code: number; message: { ru: string; uz: string; en: string }; data?: string } };

const err = (id: RpcId, code: number, data?: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message: MESSAGES[code] ?? MESSAGES[-32400], ...(data ? { data } : {}) } });
const ok = (id: RpcId, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });

export function checkPaymeAuth(header: string | null | undefined, keys: string[]): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const [login, ...rest] = decoded.split(":");
  const pass = rest.join(":");
  if (login !== "Paycom") return false;
  return keys.filter(Boolean).some((k) => {
    const a = Buffer.from(pass);
    const b = Buffer.from(k);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

const txView = (t: PaymeTx) => ({ create_time: t.createTime, perform_time: t.performTime, cancel_time: t.cancelTime, transaction: t.paymentId, state: t.state, reason: t.reason });

export async function handlePayme(rawBody: string, authHeader: string | null, keys: string[], store: PaymeStore, now: () => number = Date.now): Promise<RpcResponse> {
  let req: { id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    req = JSON.parse(rawBody);
  } catch {
    return err(null, PaymeError.PARSE_ERROR);
  }
  const id = req?.id ?? null;
  if (!checkPaymeAuth(authHeader, keys)) return err(id, PaymeError.INSUFFICIENT_PRIVILEGE);
  if (!req || typeof req.method !== "string" || typeof req.params !== "object" || req.params === null) return err(id, PaymeError.INVALID_REQUEST);
  const p = req.params;

  // Validate an account + amount for Check/Create.
  const validate = async (): Promise<{ account: PaymeAccount; amount: number } | RpcResponse> => {
    const accountId = String((p.account as Record<string, unknown> | undefined)?.order_id ?? "");
    const amount = Number(p.amount);
    if (!accountId) return err(id, PaymeError.ACCOUNT_NOT_FOUND, "order_id");
    const account = await store.findAccount(accountId);
    if (!account) return err(id, PaymeError.ACCOUNT_NOT_FOUND, "order_id");
    if (!Number.isFinite(amount) || amount !== somToTiyin(account.amount)) return err(id, PaymeError.INVALID_AMOUNT);
    if (account.paid || !account.payable) return err(id, PaymeError.ACCOUNT_NOT_PAYABLE, "order_id");
    return { account, amount };
  };

  switch (req.method) {
    case "CheckPerformTransaction": {
      const v = await validate();
      if ("jsonrpc" in v) return v;
      const live = await store.liveTxs(v.account.id);
      if (live.some((t) => t.state === 1)) return err(id, PaymeError.ACCOUNT_BUSY, "order_id");
      return ok(id, { allow: true, detail: await store.receiptDetail(v.account.id) });
    }

    case "CreateTransaction": {
      const txId = String(p.id ?? "");
      if (!txId) return err(id, PaymeError.INVALID_REQUEST);
      const existing = await store.findTx(txId);
      if (existing) {
        await store.appendRaw(txId, { method: req.method, params: p });
        if (existing.state !== 1) return err(id, PaymeError.CANNOT_PERFORM);
        if (now() - existing.createTime > PAYME_TIMEOUT_MS) {
          await store.cancelTx(txId, -1, 4, now());
          return err(id, PaymeError.CANNOT_PERFORM);
        }
        return ok(id, { create_time: existing.createTime, transaction: existing.paymentId, state: existing.state });
      }
      const v = await validate();
      if ("jsonrpc" in v) return v;
      const live = await store.liveTxs(v.account.id);
      if (live.some((t) => t.state === 1 && t.id !== txId)) return err(id, PaymeError.ACCOUNT_BUSY, "order_id");
      const tx = await store.createTx({ id: txId, accountId: v.account.id, amount: v.amount, createTime: now(), time: Number(p.time) || now() });
      await store.appendRaw(txId, { method: req.method, params: p });
      return ok(id, { create_time: tx.createTime, transaction: tx.paymentId, state: 1 });
    }

    case "PerformTransaction": {
      const txId = String(p.id ?? "");
      const tx = await store.findTx(txId);
      if (!tx) return err(id, PaymeError.TX_NOT_FOUND);
      await store.appendRaw(txId, { method: req.method, params: p });
      if (tx.state === 2) return ok(id, { transaction: tx.paymentId, perform_time: tx.performTime, state: 2 });
      if (tx.state !== 1) return err(id, PaymeError.CANNOT_PERFORM);
      if (now() - tx.createTime > PAYME_TIMEOUT_MS) {
        await store.cancelTx(txId, -1, 4, now());
        return err(id, PaymeError.CANNOT_PERFORM);
      }
      const t = now();
      await store.performTx(txId, t);
      return ok(id, { transaction: tx.paymentId, perform_time: t, state: 2 });
    }

    case "CancelTransaction": {
      const txId = String(p.id ?? "");
      const reason = Number(p.reason ?? 0);
      const tx = await store.findTx(txId);
      if (!tx) return err(id, PaymeError.TX_NOT_FOUND);
      await store.appendRaw(txId, { method: req.method, params: p });
      if (tx.state === 1) {
        const t = now();
        await store.cancelTx(txId, -1, reason, t);
        return ok(id, { transaction: tx.paymentId, cancel_time: t, state: -1 });
      }
      if (tx.state === 2) {
        if (!(await store.canCancelPerformed(tx.accountId))) return err(id, PaymeError.CANNOT_CANCEL);
        const t = now();
        await store.cancelTx(txId, -2, reason, t);
        return ok(id, { transaction: tx.paymentId, cancel_time: t, state: -2 });
      }
      return ok(id, { transaction: tx.paymentId, cancel_time: tx.cancelTime, state: tx.state });
    }

    case "CheckTransaction": {
      const tx = await store.findTx(String(p.id ?? ""));
      if (!tx) return err(id, PaymeError.TX_NOT_FOUND);
      return ok(id, txView(tx));
    }

    case "GetStatement": {
      const from = Number(p.from);
      const to = Number(p.to);
      const list = await store.statement(from, to);
      return ok(id, {
        transactions: list.map((t) => ({ id: t.id, time: t.createTime, amount: t.amount, account: { order_id: t.accountId }, ...txView(t) })),
      });
    }

    default:
      return err(id, PaymeError.METHOD_NOT_FOUND, req.method);
  }
}

/** Checkout link for the direct Payme API: https://checkout.paycom.uz/<base64 params> */
export function paymeCheckoutUrl(opts: { merchantId: string; accountId: string; amountSom: number; lang: string; returnUrl: string; test: boolean }) {
  const params = `m=${opts.merchantId};ac.order_id=${opts.accountId};a=${somToTiyin(opts.amountSom)};l=${opts.lang === "ru" ? "ru" : opts.lang === "en" ? "en" : "uz"};c=${opts.returnUrl};ct=15000`;
  const host = opts.test ? "https://checkout.test.paycom.uz" : "https://checkout.paycom.uz";
  return `${host}/${Buffer.from(params).toString("base64")}`;
}
