// Wash price settings: the latest row per service is current; every change is a new row (history).
import type { WashPricing, WashService } from "../../domain/wash";
import { DEFAULT_WASH_PRICING } from "../../domain/wash";
import { audit } from "../audit";
import { db, type Tx } from "../db";
import type { AuthUser } from "../users";

type Row = { id: number } & WashPricing;

export const toPricing = (r: WashPricing): WashPricing => ({
  pricePerM2: r.pricePerM2,
  washerSharePerM2: r.washerSharePerM2,
  minOrder: r.minOrder,
  maxOrder: r.maxOrder,
  maxItems: r.maxItems,
  deliveryFee: r.deliveryFee,
  freeDeliveryFrom: r.freeDeliveryFrom,
  tolerancePct: r.tolerancePct,
  courierPay: r.courierPay,
});

export async function currentWashSettings(service: WashService, tx?: Tx): Promise<Row> {
  const row = await (tx ?? db()).washSettings.findFirst({ where: { service }, orderBy: { id: "desc" } });
  if (row) return row;
  // Not seeded yet: create the spec defaults so ordering never breaks.
  return (tx ?? db()).washSettings.create({ data: { service, ...DEFAULT_WASH_PRICING } });
}

/** Saves a new version. Applies to NEW orders only — existing orders keep the version they were created with. */
export async function saveWashSettings(actor: AuthUser, service: WashService, next: WashPricing) {
  const before = await currentWashSettings(service);
  const row = await db().washSettings.create({ data: { service, ...next, createdById: actor.id } });
  await audit({ actorId: actor.id, action: `wash_settings.${service}.update`, entity: "washSettings", entityId: row.id, before: toPricing(before), after: toPricing(row) });
  return row;
}

export async function washSettingsHistory(service: WashService) {
  return db().washSettings.findMany({ where: { service }, orderBy: { id: "desc" }, take: 30 });
}
