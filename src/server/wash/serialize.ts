// What each role may see of a wash order. Price privacy is enforced HERE, on the server:
// - client (owner): sizes, price lines and total — never washer/courier payouts
// - courier: sizes and areas only — never any price
// - washer: labels, their own measurements and their washer share — never the client price
// - admin: everything
import type { Prisma } from "@prisma/client";
import { isAdmin } from "../../domain/permissions";
import { washLabel, washNumber, type WashService, type WashStatus } from "../../domain/wash";
import type { AuthUser } from "../users";

export const washInclude = {
  items: { orderBy: { position: "asc" } },
  slot: true,
  customer: { select: { id: true, name: true, phone: true } },
  courier: { select: { id: true, name: true, phone: true } },
  washer: { select: { id: true, name: true, phone: true } },
  photos: { select: { id: true, kind: true }, orderBy: { createdAt: "asc" } },
  quotes: { orderBy: { version: "desc" }, take: 1 },
  statusLog: { orderBy: { at: "asc" } },
} satisfies Prisma.WashOrderInclude;

export type WashOrderFull = Prisma.WashOrderGetPayload<{ include: typeof washInclude }>;

export type WashView = "owner" | "courier" | "washer" | "admin" | "none";

export function washViewFor(user: Pick<AuthUser, "id" | "role" | "cityIds" | "services">, o: { customerId: number; courierId: number | null; washerId: number | null; status: string; cityId: number; service: string }): WashView {
  if (isAdmin(user.role)) return "admin";
  if (o.customerId === user.id) return "owner";
  if (user.role === "courier") {
    if (o.courierId === user.id) return "courier";
    if (o.status === "created" && user.cityIds.includes(o.cityId) && user.services.includes(o.service as WashService)) return "courier";
  }
  if (user.role === "washer" && (o.washerId === user.id || (o.washerId === null && o.status === "picked_up"))) return "washer";
  return "none";
}

interface QuoteLineJson {
  lengthCm: number;
  widthCm: number;
  areaTenths: number;
  amount: number;
}

export function serializeWash(o: WashOrderFull, view: WashView) {
  const service = o.service as WashService;
  const priv = view !== "washer"; // washers don't need the client's contact details or address notes
  const seesCustomer = view === "owner" || view === "admin" || (view === "courier" && o.status !== "created");
  const quote = o.quotes[0];

  const base = {
    kind: "wash" as const,
    id: o.id,
    number: o.number,
    displayNumber: washNumber(service, o.number),
    service,
    status: o.status as WashStatus,
    statusAt: o.statusAt,
    cityId: o.cityId,
    address: view === "washer" ? null : o.address,
    lat: view === "washer" ? null : o.lat,
    lng: view === "washer" ? null : o.lng,
    notes: priv ? o.notes : null,
    pickupDate: o.pickupDate,
    slotStart: o.slot.startMinute,
    slotEnd: o.slot.endMinute,
    quoteVersion: o.quoteVersion,
    onHold: o.onHold,
    needsApproval: o.needsApproval,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt,
    cancelReason: o.cancelReason,
    photos: o.photos,
    customer: seesCustomer && view !== "owner" ? o.customer : null,
    courier: o.courier ? { id: o.courier.id, name: o.courier.name, phone: view === "owner" || view === "admin" ? o.courier.phone : null } : null,
    washer: view === "admin" && o.washer ? { id: o.washer.id, name: o.washer.name } : null,
    timeline: o.statusLog.map((l) => ({ to: l.to, at: l.at })),
  };

  // Items: everyone sees what they need about the pieces, never the price.
  const items = o.items.map((i) => ({
    id: i.id,
    position: i.position,
    label: i.label || washLabel(service, o.number, i.position),
    type: i.type,
    // The washer re-measures blind: they don't see the courier's sizes.
    lengthCm: view === "washer" ? null : i.lengthCm,
    widthCm: view === "washer" ? null : i.widthCm,
    areaTenths: view === "washer" ? null : i.areaTenths,
    washerLengthCm: view === "admin" || view === "washer" ? i.washerLengthCm : null,
    washerWidthCm: view === "admin" || view === "washer" ? i.washerWidthCm : null,
    washerAreaTenths: view === "admin" || view === "washer" ? i.washerAreaTenths : null,
  }));

  if (view === "courier") return { ...base, items, money: null };
  if (view === "washer") {
    const measured = o.items.every((i) => i.washerAreaTenths != null);
    return { ...base, items, money: { washerPayout: measured ? o.washerPayout : null } };
  }

  const lines = (quote?.lines as unknown as QuoteLineJson[] | undefined) ?? [];
  const clientMoney = quote
    ? {
        lines: lines.map((l) => ({ lengthCm: l.lengthCm, widthCm: l.widthCm, areaTenths: l.areaTenths, amount: l.amount })),
        subtotal: quote.subtotal,
        minimumApplied: quote.minimumApplied,
        deliveryFee: quote.deliveryFee,
        total: quote.total,
        quoteStatus: quote.status,
      }
    : null;
  if (view === "owner") return { ...base, items, money: clientMoney };
  // admin
  return {
    ...base,
    items,
    money: clientMoney && {
      ...clientMoney,
      washerPayout: o.washerPayout,
      courierPay: o.courierPay,
      waiveDelivery: o.waiveDelivery,
      waiveReason: o.waiveReason,
      cashCollected: o.cashCollected,
      margin: (o.total ?? 0) - (o.washerPayout ?? 0) - (o.courierPay ?? 0),
    },
  };
}

export type WashDTO = ReturnType<typeof serializeWash>;
