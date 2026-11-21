import { describe, expect, it } from "vitest";
import { acceptOrder, CompleteError, completeOrders, type CompletableOrder, type CourierStore } from "../src/server/courier/core";

/** In-memory store with the same semantics as the conditional UPDATE in Postgres (atomic check-and-set). */
function memoryStore(orders: (CompletableOrder & { cityId: number })[]) {
  const rows = new Map(orders.map((o) => [o.id, { ...o }]));
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
  const store: CourierStore = {
    async tryAccept(id, courierId, cityIds) {
      await tick(); // let parallel calls interleave
      const o = rows.get(id);
      if (!o || o.status !== "open" || o.courierId !== null || (cityIds && !cityIds.includes(o.cityId))) return false;
      o.status = "accepted";
      o.courierId = courierId;
      return true;
    },
    async tryComplete(id, courierId) {
      await tick();
      const o = rows.get(id);
      if (!o || o.courierId !== courierId || (o.status !== "accepted" && o.status !== "on_the_way")) return false;
      o.status = "completed";
      return true;
    },
    async findMine(ids, courierId) {
      return ids.map((id) => rows.get(id)).filter((o): o is NonNullable<typeof o> => !!o && o.courierId === courierId).map((o) => ({ ...o }));
    },
  };
  return { store, rows };
}

describe("double accept", () => {
  it("two parallel accepts → exactly one wins", async () => {
    for (let run = 0; run < 25; run++) {
      const { store, rows } = memoryStore([{ id: "o1", status: "open", paymentMethod: "cash", priceTotal: 35_000, courierId: null, cityId: 1 }]);
      const [a, b] = await Promise.all([acceptOrder(store, "o1", { id: 10, cityIds: [1] }), acceptOrder(store, "o1", { id: 20, cityIds: [1] })]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      const loser = a.ok ? b : a;
      expect(loser).toEqual({ ok: false, code: "taken" });
      expect([10, 20]).toContain(rows.get("o1")!.courierId);
    }
  });

  it("ten couriers at once → still exactly one", async () => {
    const { store } = memoryStore([{ id: "o1", status: "open", paymentMethod: "cash", priceTotal: 1, courierId: null, cityId: 1 }]);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => acceptOrder(store, "o1", { id: i + 1, cityIds: [1] })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("a courier from another city cannot accept", async () => {
    const { store } = memoryStore([{ id: "o1", status: "open", paymentMethod: "cash", priceTotal: 1, courierId: null, cityId: 2 }]);
    expect(await acceptOrder(store, "o1", { id: 10, cityIds: [1] })).toEqual({ ok: false, code: "taken" });
  });

  it("unpaid online orders cannot be accepted", async () => {
    const { store } = memoryStore([{ id: "o1", status: "awaiting_payment", paymentMethod: "payme", priceTotal: 1, courierId: null, cityId: 1 }]);
    expect((await acceptOrder(store, "o1", { id: 10, cityIds: [1] })).ok).toBe(false);
  });
});

describe("batch complete", () => {
  const base = (id: string, method: string, price: number, status = "accepted", courierId: number | null = 7) => ({ id, status, paymentMethod: method, priceTotal: price, courierId, cityId: 1 });

  it("completes 3 orders and totals only the cash ones", async () => {
    const { store, rows } = memoryStore([base("a", "cash", 35_000), base("b", "payme", 65_000, "on_the_way"), base("c", "cash", 15_000)]);
    const res = await completeOrders(store, 7, ["a", "b", "c"], 50_000);
    expect(res.completed.sort()).toEqual(["a", "b", "c"]);
    expect(res.cashTotal).toBe(50_000);
    expect([...rows.values()].every((o) => o.status === "completed")).toBe(true);
  });

  it("requires the cash total to be confirmed", async () => {
    const { store, rows } = memoryStore([base("a", "cash", 35_000), base("c", "cash", 15_000)]);
    await expect(completeOrders(store, 7, ["a", "c"], null)).rejects.toThrow(CompleteError);
    await expect(completeOrders(store, 7, ["a", "c"], 35_000)).rejects.toMatchObject({ code: "cash_not_confirmed", data: { cashTotal: 50_000 } });
    expect(rows.get("a")!.status).toBe("accepted");
  });

  it("no cash confirmation needed for paid orders", async () => {
    const { store } = memoryStore([base("b", "click", 65_000), base("s", "subscription", 0)]);
    expect((await completeOrders(store, 7, ["b", "s"], null)).cashTotal).toBe(0);
  });

  it("skips orders that are not mine or already done", async () => {
    const { store } = memoryStore([base("a", "cash", 35_000), base("x", "cash", 10_000, "accepted", 99), base("d", "cash", 20_000, "completed")]);
    const res = await completeOrders(store, 7, ["a", "x", "d", "a"], 35_000);
    expect(res.completed).toEqual(["a"]);
    expect(res.skipped.sort()).toEqual(["d", "x"]);
  });

  it("nothing to complete → error", async () => {
    const { store } = memoryStore([base("d", "cash", 20_000, "completed")]);
    await expect(completeOrders(store, 7, ["d"], null)).rejects.toMatchObject({ code: "bad_status" });
  });
});
