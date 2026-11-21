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

export type ReminderKind = "expiring" | "today" | "expired" | null;

/**
 * Which renewal reminder is due now: "expiring" N days before the end, "today" on the last day (Tashkent),
 * "expired" after the end. Nothing if the customer already renewed.
 */
export function reminderDue(
  s: { periodEnd: Date; reminded3d: boolean; remindedDay: boolean; status: string },
  now: Date,
  days: number,
  renewed: boolean,
): ReminderKind {
  if (s.status !== "active") return null;
  if (s.periodEnd <= now) return "expired";
  if (renewed) return null;
  const tkDate = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
  if (tkDate(s.periodEnd) === tkDate(now) && !s.remindedDay) return "today";
  if (s.periodEnd.getTime() - now.getTime() <= days * 86_400_000 && !s.reminded3d && tkDate(s.periodEnd) !== tkDate(now)) return "expiring";
  return null;
}
