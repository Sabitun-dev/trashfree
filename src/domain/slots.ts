// Slot availability: past, cutoff before start, capacity, and the booking window.
import { daysBetween, isValidDate, tashkentDate, tashkentMinutes } from "./time";

export interface SlotInput {
  id: number;
  startMinute: number;
  endMinute: number;
  capacity: number | null;
  active: boolean;
  priority?: boolean;
}

export type SlotUnavailableReason = "past" | "cutoff" | "full" | "too_far" | "inactive" | "subscribers_only";

export interface SlotAvailability {
  slotId: number;
  available: boolean;
  reason: SlotUnavailableReason | null;
  left: number | null;
}

export interface SlotRules {
  cutoffMinutes: number;
  daysAhead: number;
  prioritySlotsEnabled?: boolean;
  hasActiveSubscription?: boolean;
}

export const DEFAULT_SLOT_RULES: SlotRules = { cutoffMinutes: 60, daysAhead: 7 };

/** Is the date bookable at all? 0 = today … daysAhead. */
export function dateInWindow(date: string, now: Date, daysAhead: number): boolean {
  if (!isValidDate(date)) return false;
  const diff = daysBetween(tashkentDate(now), date);
  return diff >= 0 && diff <= daysAhead;
}

export function slotAvailability(
  slot: SlotInput,
  date: string,
  now: Date,
  booked: number,
  rules: SlotRules = DEFAULT_SLOT_RULES,
): SlotAvailability {
  const res = (reason: SlotUnavailableReason | null, left: number | null = null): SlotAvailability => ({
    slotId: slot.id,
    available: reason === null,
    reason,
    left,
  });
  if (!slot.active) return res("inactive");
  if (!isValidDate(date)) return res("too_far");
  const diff = daysBetween(tashkentDate(now), date);
  if (diff < 0) return res("past");
  if (diff > rules.daysAhead) return res("too_far");
  if (diff === 0) {
    const nowMin = tashkentMinutes(now);
    if (nowMin >= slot.startMinute) return res("past");
    if (nowMin > slot.startMinute - rules.cutoffMinutes) return res("cutoff");
  }
  if (slot.priority && rules.prioritySlotsEnabled && !rules.hasActiveSubscription) return res("subscribers_only");
  if (slot.capacity != null) {
    const left = slot.capacity - booked;
    if (left <= 0) return res("full", 0);
    return res(null, left);
  }
  return res(null);
}

export function slotsForDate(
  slots: SlotInput[],
  date: string,
  now: Date,
  bookedBySlot: Record<number, number>,
  rules: SlotRules = DEFAULT_SLOT_RULES,
): SlotAvailability[] {
  return [...slots]
    .filter((s) => s.active)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((s) => slotAvailability(s, date, now, bookedBySlot[s.id] ?? 0, rules));
}
