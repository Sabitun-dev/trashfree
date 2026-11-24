import { describe, expect, it } from "vitest";
import {
  areaDiffPct,
  areaTenths,
  canWashTransition,
  courierCanMeasure,
  DEFAULT_WASH_PRICING as P,
  isMismatch,
  metresToCm,
  quoteWash,
  WashPriceError,
  washLabel,
  washNumber,
} from "../src/domain/wash";

describe("area (rounded up to 0.1 m²)", () => {
  it("4.0 m × 2.5 m = 10.0 m²", () => expect(areaTenths(400, 250)).toBe(100));
  it("rounds up, never down", () => {
    expect(areaTenths(123, 100)).toBe(13); // 1.23 m² → 1.3
    expect(areaTenths(200, 101)).toBe(21); // 2.02 m² → 2.1
    expect(areaTenths(100, 100)).toBe(10); // exactly 1.0
  });
  it("parses metres typed with comma or dot", () => {
    expect(metresToCm("4")).toBe(400);
    expect(metresToCm("2,5")).toBe(250);
    expect(metresToCm("1.235")).toBe(124);
    expect(metresToCm("abc")).toBeNull();
  });
});

describe("price engine (spec examples)", () => {
  it("4.0 × 2.5 carpet: 10.0 m² → 120 000 + 10 000 delivery = 130 000; washer 80 000", () => {
    const q = quoteWash([{ lengthCm: 400, widthCm: 250 }], P);
    expect(q.areaTenths).toBe(100);
    expect(q.subtotal).toBe(120_000);
    expect(q.minimumApplied).toBe(false);
    expect(q.deliveryFee).toBe(10_000);
    expect(q.total).toBe(130_000);
    expect(q.washerPayout).toBe(80_000);
  });

  it("2 m² curtain: 24 000 subtotal → minimum 60 000 + delivery 10 000 = 70 000", () => {
    const q = quoteWash([{ lengthCm: 200, widthCm: 100 }], P);
    expect(q.subtotal).toBe(24_000);
    expect(q.minimumApplied).toBe(true);
    expect(q.charged).toBe(60_000);
    expect(q.deliveryFee).toBe(10_000);
    expect(q.total).toBe(70_000);
  });

  it("free delivery from 180 000 subtotal", () => {
    const q = quoteWash([{ lengthCm: 500, widthCm: 300 }], P); // 15 m² → 180 000
    expect(q.subtotal).toBe(180_000);
    expect(q.deliveryFee).toBe(0);
    expect(q.total).toBe(180_000);
  });

  it("the admin can waive the delivery fee on one order", () => {
    const q = quoteWash([{ lengthCm: 400, widthCm: 250 }], P, { waiveDelivery: true });
    expect(q.deliveryFee).toBe(0);
    expect(q.deliveryWaived).toBe(true);
    expect(q.total).toBe(120_000);
  });

  it("several items add up line by line", () => {
    const q = quoteWash([{ lengthCm: 300, widthCm: 200 }, { lengthCm: 150, widthCm: 100 }], P); // 6.0 + 1.5 m²
    expect(q.lines.map((l) => l.amount)).toEqual([72_000, 18_000]);
    expect(q.subtotal).toBe(90_000);
    expect(q.washerPayout).toBe(60_000);
  });

  it("above the maximum order needs admin approval", () => {
    const big = Array.from({ length: 10 }, () => ({ lengthCm: 500, widthCm: 300 })); // 10 × 15 m² = 1 800 000
    expect(quoteWash(big, P).needsApproval).toBe(true);
    expect(quoteWash([{ lengthCm: 400, widthCm: 250 }], P).needsApproval).toBe(false);
  });

  it("margin = total − washer payout − courier pay", () => {
    const q = quoteWash([{ lengthCm: 400, widthCm: 250 }], { ...P, courierPay: 15_000 });
    expect(q.margin).toBe(130_000 - 80_000 - 15_000);
  });

  it("rejects no items, too many items and impossible sizes", () => {
    expect(() => quoteWash([], P)).toThrow(WashPriceError);
    expect(() => quoteWash(Array.from({ length: 11 }, () => ({ lengthCm: 100, widthCm: 100 })), P)).toThrow("too_many_items");
    expect(() => quoteWash([{ lengthCm: 5, widthCm: 100 }], P)).toThrow("bad_size");
    expect(() => quoteWash([{ lengthCm: 2_500, widthCm: 100 }], P)).toThrow("bad_size");
    expect(() => quoteWash([{ lengthCm: 100.5, widthCm: 100 }], P)).toThrow("bad_size");
  });

  it("a quote uses the settings it is given — changing settings later can't change it", () => {
    const saved = quoteWash([{ lengthCm: 400, widthCm: 250 }], P);
    const newSettings = { ...P, pricePerM2: 20_000 };
    expect(quoteWash([{ lengthCm: 400, widthCm: 250 }], newSettings).total).toBe(200_000); // 10 m² × 20 000, free delivery
    expect(saved.total).toBe(130_000);
  });
});

describe("measurement control", () => {
  it("difference in percent of the courier's area", () => {
    expect(areaDiffPct(100, 104)).toBeCloseTo(4);
    expect(areaDiffPct(100, 94)).toBeCloseTo(6);
  });
  it("above 5 % is a mismatch", () => {
    expect(isMismatch(100, 105, 5)).toBe(false);
    expect(isMismatch(100, 106, 5)).toBe(true);
    expect(isMismatch(100, 94, 5)).toBe(true);
  });
});

describe("wash status machine", () => {
  it("happy path", () => {
    expect(canWashTransition("created", "courier_assigned", "courier")).toBe(true);
    expect(canWashTransition("courier_assigned", "measured", "courier")).toBe(true);
    expect(canWashTransition("measured", "quote_sent", "system")).toBe(true);
    expect(canWashTransition("quote_sent", "client_confirmed", "customer")).toBe(true);
    expect(canWashTransition("client_confirmed", "picked_up", "courier")).toBe(true);
    expect(canWashTransition("picked_up", "at_washer", "washer")).toBe(true);
    expect(canWashTransition("at_washer", "washed", "washer")).toBe(true);
    expect(canWashTransition("washed", "out_for_delivery", "courier")).toBe(true);
    expect(canWashTransition("out_for_delivery", "delivered_paid", "courier")).toBe(true);
    expect(canWashTransition("delivered_paid", "closed", "system")).toBe(true);
  });
  it("only the client confirms; the client can decline (cancel) a quote", () => {
    expect(canWashTransition("quote_sent", "client_confirmed", "courier")).toBe(false);
    expect(canWashTransition("quote_sent", "cancelled", "customer")).toBe(true);
  });
  it("after confirmation the courier can't re-measure; an admin can reopen for a new quote", () => {
    expect(courierCanMeasure("client_confirmed")).toBe(false);
    expect(courierCanMeasure("quote_sent")).toBe(true);
    expect(canWashTransition("client_confirmed", "measured", "courier")).toBe(false);
    expect(canWashTransition("client_confirmed", "measured", "admin")).toBe(true);
  });
  it("only the washer marks washed; final states are final", () => {
    expect(canWashTransition("at_washer", "washed", "courier")).toBe(false);
    expect(canWashTransition("closed", "cancelled", "admin")).toBe(false);
    expect(canWashTransition("cancelled", "created", "admin")).toBe(false);
  });
  it("numbers and labels", () => {
    expect(washNumber("carpet", 12)).toBe("G-12");
    expect(washLabel("curtain", 7, 2)).toBe("P-7-2");
  });
});
