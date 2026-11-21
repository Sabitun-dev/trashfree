// Subscription pickups: consume one per order, give it back when the order is cancelled.

export interface SubscriptionState {
  status: "pending" | "active" | "expired" | "cancelled";
  periodEnd: Date | null;
  pickupsTotal: number;
  pickupsUsed: number;
}

export function isUsable(s: SubscriptionState | null | undefined, now: Date): boolean {
  return !!s && s.status === "active" && !!s.periodEnd && s.periodEnd > now && s.pickupsUsed < s.pickupsTotal;
}

export function pickupsLeft(s: SubscriptionState | null | undefined): number {
  return s ? Math.max(0, s.pickupsTotal - s.pickupsUsed) : 0;
}

export function consumePickup<S extends SubscriptionState>(s: S, now: Date): S {
  if (!isUsable(s, now)) throw new Error("subscription_unusable");
  return { ...s, pickupsUsed: s.pickupsUsed + 1 };
}

export function returnPickup<S extends SubscriptionState>(s: S): S {
  return { ...s, pickupsUsed: Math.max(0, s.pickupsUsed - 1) };
}

export function pricePerPickup(price: number, pickups: number): number {
  return pickups > 0 ? Math.round(price / pickups) : price;
}

/** Days left until the end of the period (rounded up). */
export function daysLeft(periodEnd: Date, now: Date): number {
  return Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000);
}
