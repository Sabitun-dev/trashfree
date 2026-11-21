import { describe, expect, it } from "vitest";
import { handlePayme, PAYME_TIMEOUT_MS, paymeCheckoutUrl, type PaymeStore, type PaymeTx } from "../src/server/payments/payme";
import { clickSign, handleClick, type ClickStore, type ClickTx } from "../src/server/payments/click";
import { ipAllowed } from "../src/server/payments/ip";

// ---------------- Payme ----------------
const KEY = "test-payme-key";
const auth = "Basic " + Buffer.from(`Paycom:${KEY}`).toString("base64");

function paymeMemory(accounts: Record<string, { amount: number; payable: boolean; paid?: boolean; served?: boolean }>) {
  const txs = new Map<string, PaymeTx>();
  const performed: string[] = [];
  const raw: unknown[] = [];
  let seq = 0;
  const store: PaymeStore = {
    async findAccount(id) {
      const a = accounts[id];
      return a ? { id, amount: a.amount, payable: a.payable, paid: !!a.paid } : null;
    },
    async findTx(id) {
      const t = txs.get(id);
      return t ? { ...t } : null;
    },
    async liveTxs(accountId) {
      return [...txs.values()].filter((t) => t.accountId === accountId && (t.state === 1 || t.state === 2));
    },
    async createTx(t) {
      const tx: PaymeTx = { id: t.id, accountId: t.accountId, paymentId: `pay${++seq}`, amount: t.amount, state: 1, createTime: t.createTime, performTime: 0, cancelTime: 0, reason: null };
      txs.set(t.id, tx);
      return { ...tx };
    },
    async performTx(id, time) {
      const t = txs.get(id)!;
      t.state = 2;
      t.performTime = time;
      accounts[t.accountId].paid = true;
      performed.push(id);
    },
    async cancelTx(id, state, reason, time) {
      const t = txs.get(id)!;
      t.state = state;
      t.reason = reason;
      t.cancelTime = time;
      if (state === -2) accounts[t.accountId].paid = false;
    },
    async canCancelPerformed(accountId) {
      return !accounts[accountId].served;
    },
    async statement(from, to) {
      return [...txs.values()].filter((t) => t.createTime >= from && t.createTime <= to);
    },
    async receiptDetail() {
      return { receipt_type: 0, items: [{ title: "Trash pickup", price: 3_500_000, count: 1, code: "10305008002000000", package_code: "1500391", vat_percent: 0 }] };
    },
    async appendRaw(id, r) {
      raw.push([id, r]);
    },
  };
  return { store, txs, performed, raw };
}

let clock = 1_760_000_000_000;
const now = () => clock;
const rpc = (method: string, params: Record<string, unknown>, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const call = (store: PaymeStore, method: string, params: Record<string, unknown>, a: string | null = auth) => handlePayme(rpc(method, params), a, [KEY], store, now);
const code = (r: unknown) => (r as { error?: { code: number } }).error?.code;
const result = (r: unknown) => (r as { result: Record<string, unknown> }).result;

describe("Payme Merchant API", () => {
  it("rejects bad auth with -32504", async () => {
    const { store } = paymeMemory({ o1: { amount: 35_000, payable: true } });
    expect(code(await call(store, "CheckPerformTransaction", { amount: 3_500_000, account: { order_id: "o1" } }, null))).toBe(-32504);
    const wrong = "Basic " + Buffer.from("Paycom:wrong").toString("base64");
    expect(code(await call(store, "CheckPerformTransaction", { amount: 3_500_000, account: { order_id: "o1" } }, wrong))).toBe(-32504);
  });

  it("parse error, invalid request and unknown method", async () => {
    const { store } = paymeMemory({});
    expect(code(await handlePayme("{not json", auth, [KEY], store))).toBe(-32700);
    expect(code(await handlePayme(JSON.stringify({ id: 1 }), auth, [KEY], store))).toBe(-32600);
    expect(code(await call(store, "ChangePassword", {}))).toBe(-32601);
  });

  it("CheckPerformTransaction: wrong amount, unknown order, not payable, ok with fiscal detail", async () => {
    const { store } = paymeMemory({ o1: { amount: 35_000, payable: true }, old: { amount: 10_000, payable: false } });
    expect(code(await call(store, "CheckPerformTransaction", { amount: 3_500_001, account: { order_id: "o1" } }))).toBe(-31001);
    expect(code(await call(store, "CheckPerformTransaction", { amount: 3_500_000, account: { order_id: "nope" } }))).toBe(-31050);
    expect(code(await call(store, "CheckPerformTransaction", { amount: 1_000_000, account: { order_id: "old" } }))).toBe(-31051);
    const ok = result(await call(store, "CheckPerformTransaction", { amount: 3_500_000, account: { order_id: "o1" } }));
    expect(ok.allow).toBe(true);
    expect(ok.detail).toMatchObject({ receipt_type: 0, items: [{ code: "10305008002000000", package_code: "1500391" }] });
  });

  it("full sandbox scenario: create → repeat create → other tx busy → perform → repeat perform → check → cancel refused", async () => {
    const { store, performed } = paymeMemory({ o1: { amount: 35_000, payable: true, served: false } });
    const created = result(await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } }));
    expect(created).toMatchObject({ state: 1, create_time: clock });
    const again = result(await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } }));
    expect(again).toEqual(created);
    expect(code(await call(store, "CreateTransaction", { id: "tx2", time: clock, amount: 3_500_000, account: { order_id: "o1" } }))).toBe(-31052);
    expect(code(await call(store, "CheckPerformTransaction", { amount: 3_500_000, account: { order_id: "o1" } }))).toBe(-31052);

    clock += 60_000;
    const perf = result(await call(store, "PerformTransaction", { id: "tx1" }));
    expect(perf).toMatchObject({ state: 2, perform_time: clock, transaction: created.transaction });
    clock += 1000;
    const perf2 = result(await call(store, "PerformTransaction", { id: "tx1" }));
    expect(perf2).toEqual(perf); // duplicate changes nothing
    expect(performed).toEqual(["tx1"]);

    const check = result(await call(store, "CheckTransaction", { id: "tx1" }));
    expect(check).toMatchObject({ state: 2, perform_time: perf.perform_time, cancel_time: 0, reason: null });

    // A paid order can't take a new transaction.
    expect(code(await call(store, "CreateTransaction", { id: "tx3", time: clock, amount: 3_500_000, account: { order_id: "o1" } }))).toBe(-31051);
  });

  it("cancel a performed transaction: allowed before service (-2), refused after (-31007)", async () => {
    const accounts = { a: { amount: 10_000, payable: true, served: false }, b: { amount: 10_000, payable: true, served: true } };
    const { store } = paymeMemory(accounts);
    for (const [tx, acc] of [["ta", "a"], ["tb", "b"]]) {
      await call(store, "CreateTransaction", { id: tx, time: clock, amount: 1_000_000, account: { order_id: acc } });
      await call(store, "PerformTransaction", { id: tx });
    }
    expect(result(await call(store, "CancelTransaction", { id: "ta", reason: 5 }))).toMatchObject({ state: -2 });
    expect(result(await call(store, "CheckTransaction", { id: "ta" }))).toMatchObject({ state: -2, reason: 5 });
    expect(code(await call(store, "CancelTransaction", { id: "tb", reason: 5 }))).toBe(-31007);
  });

  it("cancel a pending transaction (-1); performing it afterwards fails with -31008; repeat cancel is stable", async () => {
    const { store } = paymeMemory({ o1: { amount: 35_000, payable: true } });
    await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } });
    const c1 = result(await call(store, "CancelTransaction", { id: "tx1", reason: 3 }));
    expect(c1).toMatchObject({ state: -1 });
    expect(result(await call(store, "CancelTransaction", { id: "tx1", reason: 3 }))).toEqual(c1);
    expect(code(await call(store, "PerformTransaction", { id: "tx1" }))).toBe(-31008);
    expect(code(await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } }))).toBe(-31008);
  });

  it("12 h timeout: perform after timeout cancels with reason 4", async () => {
    const { store } = paymeMemory({ o1: { amount: 35_000, payable: true } });
    await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } });
    clock += PAYME_TIMEOUT_MS + 1;
    expect(code(await call(store, "PerformTransaction", { id: "tx1" }))).toBe(-31008);
    expect(result(await call(store, "CheckTransaction", { id: "tx1" }))).toMatchObject({ state: -1, reason: 4 });
  });

  it("unknown transaction → -31003", async () => {
    const { store } = paymeMemory({});
    for (const m of ["PerformTransaction", "CancelTransaction", "CheckTransaction"]) expect(code(await call(store, m, { id: "ghost", reason: 1 }))).toBe(-31003);
  });

  it("GetStatement lists transactions in the period", async () => {
    const { store } = paymeMemory({ o1: { amount: 35_000, payable: true } });
    const t0 = clock;
    await call(store, "CreateTransaction", { id: "tx1", time: clock, amount: 3_500_000, account: { order_id: "o1" } });
    const st = result(await call(store, "GetStatement", { from: t0 - 1, to: t0 + 1 })) as { transactions: { id: string; amount: number; account: { order_id: string } }[] };
    expect(st.transactions).toHaveLength(1);
    expect(st.transactions[0]).toMatchObject({ id: "tx1", amount: 3_500_000, account: { order_id: "o1" } });
  });

  it("checkout URL encodes merchant, account and tiyin", () => {
    const url = paymeCheckoutUrl({ merchantId: "m1", accountId: "o1", amountSom: 35_000, lang: "uz", returnUrl: "https://t.me/x", test: true });
    expect(url.startsWith("https://checkout.test.paycom.uz/")).toBe(true);
    expect(Buffer.from(url.split("/").pop()!, "base64").toString()).toContain("m=m1;ac.order_id=o1;a=3500000;l=uz");
  });
});

// ---------------- Click ----------------
const SECRET = "click-secret";
const SERVICE = "12345";

function clickMemory(accounts: Record<string, { amount: number; payable: boolean; paid?: boolean }>) {
  const rows: ClickTx[] = [];
  let seq = 100;
  const store: ClickStore = {
    async findAccount(id) {
      const a = accounts[id];
      return a ? { id, amount: a.amount, payable: a.payable, paid: !!a.paid } : null;
    },
    async findByClickTx(id) {
      return rows.find((r) => r.clickTransId === id) ?? null;
    },
    async findByPrepareId(id) {
      return rows.find((r) => r.prepareId === id) ?? null;
    },
    async prepare(accountId, clickTransId) {
      const r: ClickTx = { prepareId: ++seq, clickTransId, accountId, status: "pending" };
      rows.push(r);
      return r;
    },
    async complete(prepareId) {
      const r = rows.find((x) => x.prepareId === prepareId)!;
      r.status = "paid";
      accounts[r.accountId].paid = true;
    },
    async cancel(prepareId) {
      rows.find((x) => x.prepareId === prepareId)!.status = "cancelled";
    },
  };
  return { store, rows };
}

function clickParams(action: 0 | 1, over: Record<string, string> = {}) {
  const p: Record<string, string> = {
    click_trans_id: "777",
    service_id: SERVICE,
    click_paydoc_id: "555",
    merchant_trans_id: "o1",
    amount: "35000.00",
    action: String(action),
    error: "0",
    error_note: "Success",
    sign_time: "2026-11-21 12:00:00",
    ...over,
  };
  p.sign_string = over.sign_string ?? clickSign(p, SECRET, action);
  return p;
}

const cfg = { secret: SECRET, serviceId: SERVICE };

describe("Click SHOP API", () => {
  it("sign_string is md5 of the documented fields", () => {
    // md5("777" + "12345" + "click-secret" + "o1" + "35000.00" + "0" + "2026-11-21 12:00:00")
    expect(clickSign(clickParams(0), SECRET, 0)).toMatch(/^[0-9a-f]{32}$/);
    expect(clickSign(clickParams(0), SECRET, 0)).not.toBe(clickSign(clickParams(0), "other", 0));
  });

  it("prepare → complete happy path, then duplicate callbacks change nothing", async () => {
    const accounts = { o1: { amount: 35_000, payable: true } as { amount: number; payable: boolean; paid?: boolean } };
    const { store, rows } = clickMemory(accounts);
    const prep = await handleClick(0, clickParams(0), cfg, store);
    expect(prep).toMatchObject({ error: 0, merchant_prepare_id: 101 });
    expect(await handleClick(0, clickParams(0), cfg, store)).toMatchObject({ error: 0, merchant_prepare_id: 101 });
    expect(rows).toHaveLength(1);

    const done = await handleClick(1, clickParams(1, { merchant_prepare_id: "101" }), cfg, store);
    expect(done).toMatchObject({ error: 0, merchant_confirm_id: 101 });
    expect(accounts.o1.paid).toBe(true);
    expect(await handleClick(1, clickParams(1, { merchant_prepare_id: "101" }), cfg, store)).toMatchObject({ error: 0, merchant_confirm_id: 101 });
    expect(await handleClick(0, clickParams(0, { click_trans_id: "888" }), cfg, store)).toMatchObject({ error: -4 });
  });

  it("bad signature → -1", async () => {
    const { store } = clickMemory({ o1: { amount: 35_000, payable: true } });
    expect(await handleClick(0, clickParams(0, { sign_string: "0".repeat(32) }), cfg, store)).toMatchObject({ error: -1 });
  });

  it("wrong amount → -2, unknown order → -5, wrong action → -3, missing fields → -8", async () => {
    const { store } = clickMemory({ o1: { amount: 35_000, payable: true } });
    expect(await handleClick(0, clickParams(0, { amount: "30000" }), cfg, store)).toMatchObject({ error: -2 });
    expect(await handleClick(0, clickParams(0, { merchant_trans_id: "zzz" }), cfg, store)).toMatchObject({ error: -5 });
    expect(await handleClick(1, clickParams(0, { merchant_prepare_id: "1" }), cfg, store)).toMatchObject({ error: -1 });
    const wrongAction = clickParams(1, { merchant_prepare_id: "1" });
    expect(await handleClick(0, { ...wrongAction, sign_string: clickSign(wrongAction, SECRET, 0) }, cfg, store)).toMatchObject({ error: -3 });
    expect(await handleClick(0, { click_trans_id: "1" }, cfg, store)).toMatchObject({ error: -8 });
  });

  it("complete with unknown prepare id → -6", async () => {
    const { store } = clickMemory({ o1: { amount: 35_000, payable: true } });
    expect(await handleClick(1, clickParams(1, { merchant_prepare_id: "999" }), cfg, store)).toMatchObject({ error: -6 });
  });

  it("Click reports failure (error < 0) → our tx is cancelled, -9; order never paid", async () => {
    const accounts = { o1: { amount: 35_000, payable: true } as { amount: number; payable: boolean; paid?: boolean } };
    const { store } = clickMemory(accounts);
    await handleClick(0, clickParams(0), cfg, store);
    expect(await handleClick(1, clickParams(1, { merchant_prepare_id: "101", error: "-5017" }), cfg, store)).toMatchObject({ error: -9 });
    expect(accounts.o1.paid).toBeUndefined();
    expect(await handleClick(1, clickParams(1, { merchant_prepare_id: "101" }), cfg, store)).toMatchObject({ error: -9 });
  });

  it("expired order can't be prepared (-9)", async () => {
    const { store } = clickMemory({ o1: { amount: 35_000, payable: false } });
    expect(await handleClick(0, clickParams(0), cfg, store)).toMatchObject({ error: -9 });
  });
});

describe("IP allow-list", () => {
  it("matches exact IPs and CIDR ranges", () => {
    expect(ipAllowed("185.234.113.7", ["185.234.113.0/24"])).toBe(true);
    expect(ipAllowed("185.234.114.7", ["185.234.113.0/24"])).toBe(false);
    expect(ipAllowed("10.0.0.1", ["10.0.0.1"])).toBe(true);
    expect(ipAllowed("::ffff:10.0.0.1", ["10.0.0.1"])).toBe(true);
    expect(ipAllowed(undefined, ["10.0.0.1"])).toBe(false);
    expect(ipAllowed("10.0.0.1", [])).toBe(false);
  });
});
