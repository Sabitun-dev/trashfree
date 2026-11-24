import { describe, expect, it } from "vitest";
import { serializeWash, washViewFor, type WashOrderFull } from "../src/server/wash/serialize";

// A measured, quoted carpet order: 4.0 × 2.5 m → client total 130 000, washer share 80 000.
const order = {
  id: "cwash000000000001",
  number: 12,
  service: "carpet",
  customerId: 3,
  cityId: 1,
  address: "Amir Temur 15",
  lat: 41.3,
  lng: 69.2,
  notes: "kod 1234",
  pickupDate: "2026-11-25",
  slotId: 1,
  status: "quote_sent",
  statusAt: new Date(),
  settingsId: 1,
  idempotencyKey: "k",
  courierId: 7,
  washerId: 9,
  quoteVersion: 1,
  subtotal: 120_000,
  total: 130_000,
  deliveryFee: 10_000,
  washerPayout: 80_000,
  courierPay: 15_000,
  waiveDelivery: false,
  waiveReason: null,
  needsApproval: false,
  approvedById: null,
  approvedAt: null,
  onHold: false,
  holdReason: null,
  paymentMethod: "cash",
  paymentStatus: "cod_pending",
  cashCollected: null,
  cashHandoverId: null,
  cancelReason: null,
  cancelledBy: null,
  alertedStuckAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    { id: 1, orderId: "x", position: 1, type: "carpet", lengthCm: 400, widthCm: 250, areaTenths: 100, washerLengthCm: 402, washerWidthCm: 251, washerAreaTenths: 101, label: "G-12-1", createdAt: new Date(), updatedAt: new Date() },
  ],
  slot: { id: 1, startMinute: 540, endMinute: 660, capacity: null, priority: false, active: true },
  customer: { id: 3, name: "Dilnoza", phone: "+998901234501" },
  courier: { id: 7, name: "Jasur", phone: "+998901110001" },
  washer: { id: 9, name: "Washer Co", phone: "+998900000009" },
  photos: [],
  quotes: [
    { id: 1, orderId: "x", version: 1, lines: [{ lengthCm: 400, widthCm: 250, areaTenths: 100, amount: 120_000, washerAmount: 80_000 }], subtotal: 120_000, total: 130_000, deliveryFee: 10_000, washerPayout: 80_000, minimumApplied: false, status: "sent", sentAt: new Date(), respondedAt: null },
  ],
  statusLog: [],
} as unknown as WashOrderFull;

const prices = ["120000", "130000", "10000", "12000"];
const text = (v: unknown) => JSON.stringify(v).replace(/(\d)\s(?=\d)/g, "$1");

describe("price privacy (server-side)", () => {
  it("the courier never receives any client price", () => {
    const dto = serializeWash(order, "courier");
    expect(dto.money).toBeNull();
    for (const p of prices) expect(text(dto)).not.toContain(p);
    expect(text(dto)).not.toContain("80000"); // nor the washer share
    expect(dto.items[0].areaTenths).toBe(100); // area only
  });

  it("the washer sees only the washer share, not the client price or the courier's sizes", () => {
    const dto = serializeWash(order, "washer");
    for (const p of prices) expect(text(dto)).not.toContain(p);
    expect(dto.money).toEqual({ washerPayout: 80_000 });
    expect(dto.items[0].lengthCm).toBeNull(); // blind re-measure
    expect(dto.address).toBeNull();
  });

  it("the client sees the price lines and total, but not payouts", () => {
    const dto = serializeWash(order, "owner") as ReturnType<typeof serializeWash> & { money: { total: number } };
    expect(dto.money?.total).toBe(130_000);
    expect(text(dto)).not.toContain("80000");
    expect(text(dto)).not.toContain("15000");
  });

  it("the admin sees everything, including the margin", () => {
    const dto = serializeWash(order, "admin") as { money: { margin: number; washerPayout: number } };
    expect(dto.money.washerPayout).toBe(80_000);
    expect(dto.money.margin).toBe(130_000 - 80_000 - 15_000);
  });

  it("who gets which view", () => {
    const u = (id: number, role: string, services: string[] = [], cityIds: number[] = [1]) => ({ id, role, services, cityIds }) as never;
    expect(washViewFor(u(3, "customer"), order)).toBe("owner");
    expect(washViewFor(u(7, "courier", ["carpet"]), order)).toBe("courier");
    expect(washViewFor(u(8, "courier", ["carpet"]), order)).toBe("none"); // someone else's order
    expect(washViewFor(u(8, "courier", ["trash"]), { ...order, status: "created", courierId: null })).toBe("none"); // not his service
    expect(washViewFor(u(8, "courier", ["carpet"]), { ...order, status: "created", courierId: null })).toBe("courier");
    expect(washViewFor(u(9, "washer"), order)).toBe("washer");
    expect(washViewFor(u(5, "customer"), order)).toBe("none");
    expect(washViewFor(u(1, "admin"), order)).toBe("admin");
  });
});
