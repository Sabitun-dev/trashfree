import { describe, expect, it } from "vitest";
import { calcPrice, PriceError } from "../src/domain/price";
import { slotAvailability, slotsForDate, type SlotInput } from "../src/domain/slots";
import { findServiceCity, inUzbekistan, nearestNeighbourRoute } from "../src/domain/geo";
import { canTransition, trackerIndex } from "../src/domain/status";
import { can, orderView, showsPrivateDetails } from "../src/domain/permissions";
import { consumePickup, isUsable, pickupsLeft, pricePerPickup, returnPickup } from "../src/domain/subscription";
import { decodeStartParam, encodeStartParam } from "../src/domain/deeplink";
import { formatSom, somToTiyin } from "../src/domain/money";
import { tashkentInstant } from "../src/domain/time";

const HOUSEHOLD = { firstPrice: 15_000, extraPrice: 10_000 };
const NON_RES = { firstPrice: 25_000, extraPrice: 20_000 };

describe("price engine", () => {
  it("household, 1 pack = 15 000", () => expect(calcPrice(HOUSEHOLD, 1).total).toBe(15_000));
  it("household, 3 packs = 15 000 + 2 × 10 000 = 35 000", () => {
    const p = calcPrice(HOUSEHOLD, 3);
    expect(p).toMatchObject({ firstPrice: 15_000, extraCount: 2, extraPrice: 10_000, extraTotal: 20_000, total: 35_000 });
  });
  it("non-residential, 3 packs = 65 000", () => expect(calcPrice(NON_RES, 3).total).toBe(65_000));
  it("20 packs is the maximum", () => expect(calcPrice(HOUSEHOLD, 20).total).toBe(15_000 + 19 * 10_000));
  it.each([0, 21, -1, 1.5, Number.NaN])("rejects quantity %s", (q) => {
    expect(() => calcPrice(HOUSEHOLD, q)).toThrow(PriceError);
  });
  it("rejects a missing price rule", () => expect(() => calcPrice(null, 1)).toThrow("rule_missing"));
  it("formats money with spaces", () => {
    expect(formatSom(35_000)).toBe("35 000 so'm");
    expect(formatSom(1_250_000)).toBe("1 250 000 so'm");
    expect(somToTiyin(35_000)).toBe(3_500_000);
  });
});

describe("slot availability", () => {
  const slot = (id: number, startH: number, capacity: number | null = null): SlotInput => ({ id, startMinute: startH * 60, endMinute: (startH + 2) * 60, capacity, active: true });
  // 2026-11-21 10:30 in Tashkent
  const now = tashkentInstant("2026-11-21", 10 * 60 + 30);

  it("past slot today is unavailable", () => {
    expect(slotAvailability(slot(1, 9), "2026-11-21", now, 0).reason).toBe("past");
  });
  it("slot starting within 60 minutes is closed (cutoff)", () => {
    expect(slotAvailability(slot(2, 11), "2026-11-21", now, 0).reason).toBe("cutoff");
  });
  it("slot exactly 60 minutes ahead is still open", () => {
    const at = tashkentInstant("2026-11-21", 12 * 60);
    expect(slotAvailability(slot(3, 13), "2026-11-21", at, 0).available).toBe(true);
  });
  it("later slot today is available", () => {
    expect(slotAvailability(slot(3, 13), "2026-11-21", now, 0).available).toBe(true);
  });
  it("full slot is unavailable, with 0 left", () => {
    expect(slotAvailability(slot(4, 15, 3), "2026-11-22", now, 3)).toMatchObject({ available: false, reason: "full", left: 0 });
    expect(slotAvailability(slot(4, 15, 3), "2026-11-22", now, 2)).toMatchObject({ available: true, left: 1 });
  });
  it("booking window is 7 days", () => {
    expect(slotAvailability(slot(1, 9), "2026-11-28", now, 0).available).toBe(true);
    expect(slotAvailability(slot(1, 9), "2026-11-29", now, 0).reason).toBe("too_far");
    expect(slotAvailability(slot(1, 9), "2026-11-20", now, 0).reason).toBe("past");
  });
  it("invalid date is rejected", () => {
    expect(slotAvailability(slot(1, 9), "2026-02-30", now, 0).available).toBe(false);
  });
  it("priority slots need a subscription when enabled", () => {
    const s = { ...slot(5, 17), priority: true };
    expect(slotAvailability(s, "2026-11-22", now, 0, { cutoffMinutes: 60, daysAhead: 7, prioritySlotsEnabled: true }).reason).toBe("subscribers_only");
    expect(slotAvailability(s, "2026-11-22", now, 0, { cutoffMinutes: 60, daysAhead: 7, prioritySlotsEnabled: true, hasActiveSubscription: true }).available).toBe(true);
  });
  it("lists slots sorted and skips inactive ones", () => {
    const res = slotsForDate([slot(2, 13), slot(1, 9), { ...slot(3, 15), active: false }], "2026-11-22", now, {});
    expect(res.map((r) => r.slotId)).toEqual([1, 2]);
  });
});

describe("service area", () => {
  const tashkent = { id: 1, centerLat: 41.3111, centerLng: 69.2797, radiusKm: 25, active: true };
  const samarkand = { id: 2, centerLat: 39.6542, centerLng: 66.9597, radiusKm: 15, active: true };
  const bukhara = { id: 3, centerLat: 39.7747, centerLng: 64.4286, radiusKm: 15, active: false };

  it("point in Tashkent belongs to Tashkent", () => expect(findServiceCity([tashkent, samarkand], 41.33, 69.25)).toEqual({ ok: true, cityId: 1 }));
  it("point in Uzbekistan but outside all cities → no service", () => expect(findServiceCity([tashkent, samarkand], 40.5, 68.0)).toEqual({ ok: false, reason: "no_service" }));
  it("inactive city does not count", () => expect(findServiceCity([bukhara], 39.77, 64.42)).toEqual({ ok: false, reason: "no_service" }));
  it("outside Uzbekistan is rejected", () => {
    expect(findServiceCity([tashkent], 55.75, 37.62)).toEqual({ ok: false, reason: "outside_uzbekistan" });
    expect(inUzbekistan(41.3, 69.2)).toBe(true);
  });
  it("garbage coordinates are rejected", () => expect(findServiceCity([tashkent], Number.NaN, 69)).toEqual({ ok: false, reason: "invalid" }));
  it("route visits nearest first", () => {
    const pts = [
      { id: "far", lat: 41.4, lng: 69.4 },
      { id: "near", lat: 41.311, lng: 69.281 },
      { id: "mid", lat: 41.35, lng: 69.3 },
    ];
    expect(nearestNeighbourRoute({ lat: 41.3111, lng: 69.2797 }, pts).map((p) => p.id)).toEqual(["near", "mid", "far"]);
  });
});

describe("order status machine", () => {
  it("online orders open only by the system after payment", () => {
    expect(canTransition("awaiting_payment", "open", "system")).toBe(true);
    expect(canTransition("awaiting_payment", "open", "customer")).toBe(false);
    expect(canTransition("awaiting_payment", "accepted", "courier")).toBe(false);
  });
  it("customer may cancel only while open", () => {
    expect(canTransition("open", "cancelled", "customer")).toBe(true);
    expect(canTransition("accepted", "cancelled", "customer")).toBe(false);
    expect(canTransition("on_the_way", "cancelled", "customer")).toBe(false);
  });
  it("courier flow", () => {
    expect(canTransition("open", "accepted", "courier")).toBe(true);
    expect(canTransition("accepted", "on_the_way", "courier")).toBe(true);
    expect(canTransition("on_the_way", "completed", "courier")).toBe(true);
    expect(canTransition("accepted", "completed", "courier")).toBe(true);
    expect(canTransition("completed", "open", "admin")).toBe(false);
  });
  it("final statuses are final", () => {
    for (const to of ["open", "accepted", "completed"] as const) expect(canTransition("cancelled", to, "admin")).toBe(false);
  });
  it("tracker index", () => {
    expect(trackerIndex("open", false)).toBe(0);
    expect(trackerIndex("completed", false)).toBe(3);
    expect(trackerIndex("awaiting_payment", true)).toBe(0);
    expect(trackerIndex("on_the_way", true)).toBe(3);
    expect(trackerIndex("cancelled", true)).toBe(-1);
  });
});

describe("permissions", () => {
  const order = { customerId: 1, courierId: null as number | null, cityId: 10, status: "open" as const };
  it("roles", () => {
    expect(can("customer", "admin.access")).toBe(false);
    expect(can("courier", "courier.access")).toBe(true);
    expect(can("customer", "courier.access")).toBe(false);
    expect(can("admin", "admin.access")).toBe(true);
    expect(can("admin", "admin.manage_admins")).toBe(false);
    expect(can("owner", "admin.manage_admins")).toBe(true);
  });
  it("customers see only their own orders", () => {
    expect(orderView({ id: 1, role: "customer", cityIds: [] }, order)).toBe("owner");
    expect(orderView({ id: 2, role: "customer", cityIds: [] }, order)).toBe("none");
  });
  it("couriers see open orders in their cities without private details", () => {
    const v = orderView({ id: 5, role: "courier", cityIds: [10] }, order);
    expect(v).toBe("courier_preview");
    expect(showsPrivateDetails(v)).toBe(false);
    expect(orderView({ id: 5, role: "courier", cityIds: [11] }, order)).toBe("none");
  });
  it("assigned courier sees full details; other couriers see nothing once taken", () => {
    const taken = { ...order, status: "accepted" as const, courierId: 5 };
    expect(showsPrivateDetails(orderView({ id: 5, role: "courier", cityIds: [10] }, taken))).toBe(true);
    expect(orderView({ id: 6, role: "courier", cityIds: [10] }, taken)).toBe("none");
  });
  it("couriers never see unpaid online orders", () => {
    expect(orderView({ id: 5, role: "courier", cityIds: [10] }, { ...order, status: "awaiting_payment" })).toBe("none");
  });
  it("admins see everything", () => expect(showsPrivateDetails(orderView({ id: 9, role: "admin", cityIds: [] }, order))).toBe(true));
});

describe("subscription pickups", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  const sub = { status: "active" as const, periodEnd: new Date("2026-12-10T00:00:00Z"), pickupsTotal: 4, pickupsUsed: 3 };
  it("consumes one pickup", () => {
    const next = consumePickup(sub, now);
    expect(next.pickupsUsed).toBe(4);
    expect(pickupsLeft(next)).toBe(0);
    expect(isUsable(next, now)).toBe(false);
    expect(() => consumePickup(next, now)).toThrow();
  });
  it("returns a pickup on cancel", () => {
    expect(returnPickup({ ...sub, pickupsUsed: 4 }).pickupsUsed).toBe(3);
    expect(returnPickup({ ...sub, pickupsUsed: 0 }).pickupsUsed).toBe(0);
  });
  it("expired plans are not usable", () => expect(isUsable({ ...sub, periodEnd: new Date("2026-11-01") }, now)).toBe(false));
  it("price per pickup", () => expect(pricePerPickup(100_000, 8)).toBe(12_500));
});

describe("deep links", () => {
  it("round-trips screens", () => {
    expect(decodeStartParam(encodeStartParam({ name: "order", id: "clx123abc" }))).toEqual({ name: "order", id: "clx123abc" });
    expect(decodeStartParam("inv_AbC-123_x")).toEqual({ name: "invite", token: "AbC-123_x" });
    expect(decodeStartParam("plans")).toEqual({ name: "plans" });
    expect(decodeStartParam("auser_15")).toEqual({ name: "admin_user", id: 15 });
  });
  it("ignores unsafe params", () => {
    expect(decodeStartParam("order_<script>")).toEqual({ name: "home" });
    expect(decodeStartParam("x".repeat(65))).toEqual({ name: "home" });
  });
});

import { reminderDue } from "../src/domain/subscription";

describe("subscription reminders", () => {
  const now = new Date("2026-11-21T06:00:00Z"); // 11:00 Tashkent
  const sub = (end: string, r3 = false, rd = false) => ({ periodEnd: new Date(end), reminded3d: r3, remindedDay: rd, status: "active" });
  it("3 days before → expiring (once)", () => {
    expect(reminderDue(sub("2026-11-24T05:00:00Z"), now, 3, false)).toBe("expiring");
    expect(reminderDue(sub("2026-11-24T05:00:00Z", true), now, 3, false)).toBeNull();
  });
  it("too early → nothing", () => expect(reminderDue(sub("2026-11-30T05:00:00Z"), now, 3, false)).toBeNull());
  it("on the day → today (once)", () => {
    expect(reminderDue(sub("2026-11-21T15:00:00Z", true), now, 3, false)).toBe("today");
    expect(reminderDue(sub("2026-11-21T15:00:00Z", true, true), now, 3, false)).toBeNull();
  });
  it("after the end → expired", () => expect(reminderDue(sub("2026-11-21T05:00:00Z", true, true), now, 3, false)).toBe("expired"));
  it("already renewed → no reminders, but still expires", () => {
    expect(reminderDue(sub("2026-11-23T05:00:00Z"), now, 3, true)).toBeNull();
    expect(reminderDue(sub("2026-11-20T05:00:00Z"), now, 3, true)).toBe("expired");
  });
});
