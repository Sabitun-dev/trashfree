// The order status machine. Every status change on the server goes through `canTransition`.
import type { OrderStatus, Role } from "./types";

type Actor = "customer" | "courier" | "admin" | "system";

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  awaiting_payment: {
    open: ["system"], // only after a verified provider confirmation
    expired: ["system"],
    cancelled: ["customer", "admin", "system"],
  },
  open: {
    accepted: ["courier", "admin"],
    cancelled: ["customer", "admin", "system"],
  },
  accepted: {
    on_the_way: ["courier", "admin"],
    completed: ["courier", "admin"],
    open: ["courier", "admin"], // courier gives the order back / admin unassigns
    cancelled: ["admin"],
  },
  on_the_way: {
    completed: ["courier", "admin"],
    cancelled: ["admin"],
  },
  completed: {},
  cancelled: {},
  expired: {
    open: ["system"], // a late but verified payment still counts
  },
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function actorForRole(role: Role): Actor {
  return role === "owner" || role === "admin" ? "admin" : role;
}

export const FINAL_STATUSES: OrderStatus[] = ["completed", "cancelled", "expired"];
export const ACTIVE_STATUSES: OrderStatus[] = ["awaiting_payment", "open", "accepted", "on_the_way"];
/** Orders that hold a place in a time slot. */
export const SLOT_HOLDING_STATUSES: OrderStatus[] = ["awaiting_payment", "open", "accepted", "on_the_way", "completed"];

/** Steps of the customer tracker. Online orders get a "payment" step first. */
export type TrackerStep = "payment" | "placed" | "accepted" | "on_the_way" | "completed";

export function trackerSteps(online: boolean): TrackerStep[] {
  return online ? ["payment", "placed", "accepted", "on_the_way", "completed"] : ["placed", "accepted", "on_the_way", "completed"];
}

/** Index of the current step (the last reached one). */
export function trackerIndex(status: OrderStatus, online: boolean): number {
  const steps = trackerSteps(online);
  const map: Partial<Record<OrderStatus, TrackerStep>> = {
    awaiting_payment: "payment",
    open: "placed",
    accepted: "accepted",
    on_the_way: "on_the_way",
    completed: "completed",
  };
  const step = map[status];
  return step ? steps.indexOf(step) : -1;
}
