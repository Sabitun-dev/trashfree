// Carpet & curtain washing: areas, the price engine and the status machine. Pure code, shared by server and app.
//
// Sizes are stored as whole centimetres and areas as whole tenths of a square metre ("dm2x10"),
// so no floating-point rounding can ever change a price. 1 m² = 10 000 cm²; 0.1 m² = 1 000 cm².

export type WashService = "carpet" | "curtain";

export interface WashPricing {
  pricePerM2: number; // so'm, charged to the client
  washerSharePerM2: number; // so'm, paid to the washer
  minOrder: number; // if the subtotal is below this, this amount is charged instead
  maxOrder: number; // above this total, the quote needs admin approval
  maxItems: number; // items per pickup
  deliveryFee: number;
  freeDeliveryFrom: number; // delivery is free when the subtotal reaches this
  tolerancePct: number; // allowed courier/washer area difference before an alert
  courierPay: number; // per order
}

export const DEFAULT_WASH_PRICING: WashPricing = {
  pricePerM2: 12_000,
  washerSharePerM2: 8_000,
  minOrder: 60_000,
  maxOrder: 1_500_000,
  maxItems: 10,
  deliveryFee: 10_000,
  freeDeliveryFrom: 180_000,
  tolerancePct: 5,
  courierPay: 0,
};

export const MIN_SIDE_CM = 10;
export const MAX_SIDE_CM = 2_000; // 20 m

/** Area in tenths of m², rounded UP: 4.0 m × 2.5 m → 100 (= 10.0 m²); 1.23 m × 1.0 m → 13 (= 1.3 m²). */
export function areaTenths(lengthCm: number, widthCm: number): number {
  return Math.ceil((lengthCm * widthCm) / 1_000);
}

export const tenthsToM2 = (t: number) => t / 10;
export const formatM2 = (t: number) => `${(t / 10).toFixed(1)} m²`;
/** Parse "4", "4.0", "4,05" metres → whole centimetres. */
export function metresToCm(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export class WashPriceError extends Error {
  constructor(public code: "no_items" | "too_many_items" | "bad_size") {
    super(code);
  }
}

export interface WashItemInput {
  lengthCm: number;
  widthCm: number;
}

export interface WashQuoteLine {
  lengthCm: number;
  widthCm: number;
  areaTenths: number;
  amount: number; // client price for this item
  washerAmount: number;
}

export interface WashQuote {
  lines: WashQuoteLine[];
  areaTenths: number;
  subtotal: number; // Σ area × price per m²
  minimumApplied: boolean;
  charged: number; // subtotal, or the minimum order if the subtotal is lower
  deliveryFee: number;
  deliveryWaived: boolean;
  total: number;
  washerPayout: number;
  courierPay: number;
  margin: number; // total − washer payout − courier pay
  needsApproval: boolean; // total above the maximum order
}

export function validateItems(items: WashItemInput[], p: Pick<WashPricing, "maxItems">) {
  if (!items.length) throw new WashPriceError("no_items");
  if (items.length > p.maxItems) throw new WashPriceError("too_many_items");
  for (const i of items) {
    for (const v of [i.lengthCm, i.widthCm]) {
      if (!Number.isInteger(v) || v < MIN_SIDE_CM || v > MAX_SIDE_CM) throw new WashPriceError("bad_size");
    }
  }
}

/**
 * The price engine (server side; the app only displays what the server returns).
 * - subtotal = Σ area × price per m²
 * - below the minimum order → the minimum order is charged
 * - delivery fee only if the subtotal is below the free-delivery limit (the admin can waive it per order)
 * - total = (subtotal or minimum) + delivery fee
 */
export function quoteWash(items: WashItemInput[], p: WashPricing, opts: { waiveDelivery?: boolean } = {}): WashQuote {
  validateItems(items, p);
  const lines = items.map((i) => {
    const a = areaTenths(i.lengthCm, i.widthCm);
    return { lengthCm: i.lengthCm, widthCm: i.widthCm, areaTenths: a, amount: Math.round((a * p.pricePerM2) / 10), washerAmount: Math.round((a * p.washerSharePerM2) / 10) };
  });
  const area = lines.reduce((s, l) => s + l.areaTenths, 0);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const minimumApplied = subtotal < p.minOrder;
  const charged = minimumApplied ? p.minOrder : subtotal;
  const feeDue = subtotal < p.freeDeliveryFrom ? p.deliveryFee : 0;
  const deliveryWaived = !!opts.waiveDelivery && feeDue > 0;
  const deliveryFee = deliveryWaived ? 0 : feeDue;
  const total = charged + deliveryFee;
  const washerPayout = lines.reduce((s, l) => s + l.washerAmount, 0);
  return {
    lines,
    areaTenths: area,
    subtotal,
    minimumApplied,
    charged,
    deliveryFee,
    deliveryWaived,
    total,
    washerPayout,
    courierPay: p.courierPay,
    margin: total - washerPayout - p.courierPay,
    needsApproval: total > p.maxOrder,
  };
}

/** Courier vs washer area difference, in percent of the courier's total. */
export function areaDiffPct(courierTenths: number, washerTenths: number): number {
  if (courierTenths <= 0) return washerTenths > 0 ? 100 : 0;
  return (Math.abs(washerTenths - courierTenths) / courierTenths) * 100;
}

export const isMismatch = (courierTenths: number, washerTenths: number, tolerancePct: number) => areaDiffPct(courierTenths, washerTenths) > tolerancePct;

// ---------------- Status machine ----------------

export const WASH_STATUSES = [
  "created",
  "courier_assigned",
  "measured",
  "quote_sent",
  "client_confirmed",
  "picked_up",
  "at_washer",
  "washed",
  "out_for_delivery",
  "delivered_paid",
  "closed",
  "cancelled",
] as const;
export type WashStatus = (typeof WASH_STATUSES)[number];

export type WashActor = "customer" | "courier" | "washer" | "admin" | "system";

const T: Partial<Record<WashStatus, Partial<Record<WashStatus, WashActor[]>>>> = {
  created: { courier_assigned: ["courier", "admin"], cancelled: ["customer", "admin"] },
  courier_assigned: { measured: ["courier"], created: ["courier", "admin"], courier_assigned: ["admin"], cancelled: ["customer", "admin"] },
  // Measured: the quote goes out (automatically, or after admin approval when above the maximum order).
  measured: { quote_sent: ["system", "admin"], measured: ["courier"], cancelled: ["admin"] },
  quote_sent: { client_confirmed: ["customer"], measured: ["courier", "admin"], cancelled: ["customer", "admin"] },
  // After confirmation the courier can't change sizes; only an admin can reopen for a corrected quote.
  client_confirmed: { picked_up: ["courier"], measured: ["admin"], cancelled: ["admin"] },
  picked_up: { at_washer: ["courier", "washer"], cancelled: ["admin"] },
  at_washer: { washed: ["washer"], cancelled: ["admin"] },
  washed: { out_for_delivery: ["courier"] },
  out_for_delivery: { delivered_paid: ["courier"] },
  delivered_paid: { closed: ["system", "admin"] },
};

export function canWashTransition(from: WashStatus, to: WashStatus, actor: WashActor): boolean {
  if (actor === "admin" && to === "cancelled" && !["delivered_paid", "closed", "cancelled"].includes(from)) return true;
  return T[from]?.[to]?.includes(actor) ?? false;
}

/** Sizes can be edited by the courier only before the client confirmed the quote. */
export const courierCanMeasure = (s: WashStatus) => s === "courier_assigned" || s === "measured" || s === "quote_sent";

export const WASH_ACTIVE: WashStatus[] = ["created", "courier_assigned", "measured", "quote_sent", "client_confirmed", "picked_up", "at_washer", "washed", "out_for_delivery"];
export const WASH_FINAL: WashStatus[] = ["delivered_paid", "closed", "cancelled"];

/** Order number shown to people and on labels: G-12 (carpet), P-12 (curtain); items G-12-1, G-12-2 … */
export const washPrefix = (s: WashService) => (s === "carpet" ? "G" : "P");
export const washNumber = (s: WashService, n: number) => `${washPrefix(s)}-${n}`;
export const washLabel = (s: WashService, n: number, position: number) => `${washPrefix(s)}-${n}-${position}`;
