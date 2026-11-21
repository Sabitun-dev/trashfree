// Click SHOP API: Prepare (action 0) and Complete (action 1), MD5 sign_string check, idempotent by click_trans_id.
import { createHash, timingSafeEqual } from "node:crypto";

export const ClickError = {
  SUCCESS: 0,
  SIGN_FAILED: -1,
  INVALID_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TX_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  BAD_REQUEST: -8,
  TX_CANCELLED: -9,
} as const;

const NOTES: Record<number, string> = {
  0: "Success",
  [-1]: "SIGN CHECK FAILED!",
  [-2]: "Incorrect parameter amount",
  [-3]: "Action not found",
  [-4]: "Already paid",
  [-5]: "User does not exist",
  [-6]: "Transaction does not exist",
  [-7]: "Failed to update user",
  [-8]: "Error in request from click",
  [-9]: "Transaction cancelled",
};

export interface ClickAccount {
  id: string;
  amount: number; // so'm
  payable: boolean;
  paid: boolean;
}

export interface ClickTx {
  prepareId: number;
  clickTransId: string;
  accountId: string;
  status: "pending" | "paid" | "cancelled";
}

export interface ClickStore {
  findAccount(accountId: string): Promise<ClickAccount | null>;
  findByClickTx(clickTransId: string): Promise<ClickTx | null>;
  findByPrepareId(prepareId: number): Promise<ClickTx | null>;
  prepare(accountId: string, clickTransId: string, amount: number, raw: unknown): Promise<ClickTx>;
  complete(prepareId: number, raw: unknown): Promise<void>;
  cancel(prepareId: number, raw: unknown): Promise<void>;
}

export type ClickParams = Record<string, string | undefined>;

export function clickSign(p: ClickParams, secret: string, action: 0 | 1): string {
  const parts = [p.click_trans_id, p.service_id, secret, p.merchant_trans_id, ...(action === 1 ? [p.merchant_prepare_id] : []), p.amount, p.action, p.sign_time];
  return createHash("md5").update(parts.map((x) => x ?? "").join("")).digest("hex");
}

function signOk(p: ClickParams, secret: string, action: 0 | 1) {
  const a = Buffer.from(clickSign(p, secret, action));
  const b = Buffer.from(String(p.sign_string ?? "").toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleClick(action: 0 | 1, p: ClickParams, cfg: { secret: string; serviceId: string }, store: ClickStore) {
  const base = { click_trans_id: p.click_trans_id ?? "", merchant_trans_id: p.merchant_trans_id ?? "" };
  const reply = (error: number, extra: Record<string, unknown> = {}) => ({ ...base, ...extra, error, error_note: NOTES[error] ?? "Error" });

  const required = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "sign_time", "sign_string", ...(action === 1 ? ["merchant_prepare_id"] : [])];
  if (required.some((k) => p[k] === undefined || p[k] === "")) return reply(ClickError.BAD_REQUEST);
  if (!signOk(p, cfg.secret, action)) return reply(ClickError.SIGN_FAILED);
  if (p.service_id !== cfg.serviceId) return reply(ClickError.BAD_REQUEST);
  if (Number(p.action) !== action) return reply(ClickError.ACTION_NOT_FOUND);

  const account = await store.findAccount(p.merchant_trans_id!);
  if (!account) return reply(ClickError.ORDER_NOT_FOUND);
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || Math.abs(amount - account.amount) > 0.01) return reply(ClickError.INVALID_AMOUNT);

  if (action === 0) {
    const existing = await store.findByClickTx(p.click_trans_id!);
    if (existing) {
      if (existing.status === "cancelled") return reply(ClickError.TX_CANCELLED);
      if (existing.status === "paid") return reply(ClickError.ALREADY_PAID);
      return reply(ClickError.SUCCESS, { merchant_prepare_id: existing.prepareId });
    }
    if (account.paid) return reply(ClickError.ALREADY_PAID);
    if (!account.payable) return reply(ClickError.TX_CANCELLED);
    const tx = await store.prepare(account.id, p.click_trans_id!, amount, p);
    return reply(ClickError.SUCCESS, { merchant_prepare_id: tx.prepareId });
  }

  // Complete
  const prepareId = Number(p.merchant_prepare_id);
  const tx = await store.findByPrepareId(prepareId);
  if (!tx || tx.clickTransId !== p.click_trans_id || tx.accountId !== account.id) return reply(ClickError.TX_NOT_FOUND);
  if (tx.status === "paid") return reply(ClickError.SUCCESS, { merchant_confirm_id: tx.prepareId }); // duplicate callback
  if (tx.status === "cancelled") return reply(ClickError.TX_CANCELLED);
  if (Number(p.error) < 0) {
    // Click reports the payment failed on their side.
    await store.cancel(prepareId, p);
    return reply(ClickError.TX_CANCELLED);
  }
  if (account.paid) return reply(ClickError.ALREADY_PAID);
  await store.complete(prepareId, p);
  return reply(ClickError.SUCCESS, { merchant_confirm_id: tx.prepareId });
}

export function clickCheckoutUrl(opts: { serviceId: string; merchantId: string; merchantUserId?: string; accountId: string; amountSom: number; returnUrl: string }) {
  const q = new URLSearchParams({
    service_id: opts.serviceId,
    merchant_id: opts.merchantId,
    amount: String(opts.amountSom),
    transaction_param: opts.accountId,
    return_url: opts.returnUrl,
    ...(opts.merchantUserId ? { merchant_user_id: opts.merchantUserId } : {}),
  });
  return `https://my.click.uz/services/pay?${q.toString()}`;
}
