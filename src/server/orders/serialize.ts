// What the app receives for an order. Private details only for the owner, the assigned courier and admins.
import type { Prisma } from "@prisma/client";
import { orderView, showsPrivateDetails, type Viewer } from "../../domain/permissions";

export const orderInclude = {
  slot: true,
  courier: { select: { id: true, name: true, phone: true } },
  customer: { select: { id: true, name: true, phone: true } },
  photos: { select: { id: true, kind: true }, orderBy: { createdAt: "asc" } },
  payments: { where: { status: "paid" }, orderBy: { paidAt: "desc" }, take: 1, select: { receiptNo: true, paidAt: true } },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeOrder(o: OrderFull, viewer: Viewer) {
  const view = orderView(viewer, o);
  const priv = showsPrivateDetails(view);
  const isOwner = view === "owner";
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    cityId: o.cityId,
    address: o.address,
    lat: o.lat,
    lng: o.lng,
    notes: priv ? o.notes : null,
    trashTypeId: o.trashTypeId,
    packageSizeId: o.packageSizeId,
    quantity: o.quantity,
    pickupDate: o.pickupDate,
    slotId: o.slotId,
    slotStart: o.slot.startMinute,
    slotEnd: o.slot.endMinute,
    priceTotal: o.priceTotal,
    priceBreakdown: o.priceBreakdown,
    createdAt: o.createdAt,
    paidAt: o.payments[0]?.paidAt ?? null,
    acceptedAt: o.acceptedAt,
    onTheWayAt: o.onTheWayAt,
    completedAt: o.completedAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    expiresAt: o.expiresAt,
    rating: o.rating,
    ratingComment: isOwner || view === "admin" ? o.ratingComment : null,
    cashCollected: o.cashCollected,
    // The customer sees the courier's name and phone once accepted.
    courier: o.courier ? { id: o.courier.id, name: o.courier.name, phone: isOwner || view === "admin" || view === "courier_full" ? o.courier.phone : null } : null,
    // Couriers see the customer only after accepting.
    customer: priv && !isOwner ? { id: o.customer.id, name: o.customer.name, phone: o.customer.phone } : null,
    photos: o.photos,
    receiptNo: o.payments[0]?.receiptNo ?? null,
    canCancel: isOwner && (o.status === "open" || o.status === "awaiting_payment"),
  };
}

export type OrderDTO = ReturnType<typeof serializeOrder>;
