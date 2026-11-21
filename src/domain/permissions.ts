// Who may do what. The server checks these on every endpoint; the app only uses them to hide buttons.
import type { OrderStatus, Role } from "./types";

export const isAdmin = (r: Role) => r === "admin" || r === "owner";
export const isCourier = (r: Role) => r === "courier";

export type Action =
  | "order.create"
  | "courier.access"
  | "admin.access"
  | "admin.manage_admins"
  | "admin.broadcast"
  | "admin.catalog";

export function can(role: Role, action: Action): boolean {
  switch (action) {
    case "order.create":
      return true; // every role can order a pickup for themselves
    case "courier.access":
      return role === "courier" || isAdmin(role);
    case "admin.access":
    case "admin.broadcast":
    case "admin.catalog":
      return isAdmin(role);
    case "admin.manage_admins":
      return role === "owner";
  }
}

export interface OrderAccessInput {
  customerId: number;
  courierId: number | null;
  cityId: number;
  status: OrderStatus;
}

export interface Viewer {
  id: number;
  role: Role;
  cityIds: number[];
}

export type OrderView = "none" | "owner" | "courier_preview" | "courier_full" | "admin";

/**
 * What a viewer may see of an order.
 * - customers: only their own orders
 * - couriers: open orders in their cities (no phone, no exact notes) and their own accepted ones (full)
 * - admins: everything
 */
export function orderView(viewer: Viewer, order: OrderAccessInput): OrderView {
  if (isAdmin(viewer.role)) return "admin";
  if (order.customerId === viewer.id) return "owner";
  if (viewer.role === "courier") {
    if (order.courierId === viewer.id) return "courier_full";
    if (order.status === "open" && viewer.cityIds.includes(order.cityId)) return "courier_preview";
  }
  return "none";
}

/** Whether the customer's phone and exact notes may be shown in this view. */
export const showsPrivateDetails = (v: OrderView) => v === "owner" || v === "courier_full" || v === "admin";
