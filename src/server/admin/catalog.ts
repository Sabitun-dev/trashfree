// Catalog editing: every change is audit-logged with before/after.
import { z } from "zod";
import { UZ_BOUNDS } from "../../domain/geo";
import { audit } from "../audit";
import { invalidateCatalog } from "../catalog";
import { db } from "../db";
import { bad, notFound } from "../errors";
import { getSettings, saveSettings, type AppSettings } from "../settings";
import type { AuthUser } from "../users";

const names = { nameUz: z.string().trim().min(1).max(60), nameRu: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60) };
const code = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);

export const schemas = {
  trashType: z.object({ code, ...names, icon: z.enum(["household", "non_residential", "construction", "other"]).default("other"), ikpu: z.string().regex(/^\d{0,20}$/).nullable().optional(), packageCode: z.string().regex(/^\d{0,20}$/).nullable().optional(), vatPercent: z.number().int().min(0).max(100).default(0), active: z.boolean().default(true), sort: z.number().int().default(0) }),
  packageSize: z.object({ code, ...names, liters: z.number().int().min(1).max(1000), active: z.boolean().default(true), sort: z.number().int().default(0) }),
  slot: z
    .object({ startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), capacity: z.number().int().min(1).max(1000).nullable(), priority: z.boolean().default(false), active: z.boolean().default(true) })
    .refine((s) => s.endMinute > s.startMinute, "end_before_start"),
  city: z.object({
    code,
    ...names,
    centerLat: z.number().min(UZ_BOUNDS.minLat).max(UZ_BOUNDS.maxLat),
    centerLng: z.number().min(UZ_BOUNDS.minLng).max(UZ_BOUNDS.maxLng),
    radiusKm: z.number().min(1).max(200),
    active: z.boolean().default(true),
    sort: z.number().int().default(0),
  }),
  plan: z.object({ code, ...names, pickups: z.number().int().min(1).max(100), price: z.number().int().min(0).max(100_000_000), durationDays: z.number().int().min(1).max(90).default(30), active: z.boolean().default(true), sort: z.number().int().default(0) }),
  prices: z.array(z.object({ trashTypeId: z.number().int(), packageSizeId: z.number().int(), firstPrice: z.number().int().min(0).max(100_000_000), extraPrice: z.number().int().min(0).max(100_000_000) })).max(500),
};

export type Entity = "trashType" | "packageSize" | "slot" | "city" | "plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (e: Entity): any => ({ trashType: db().trashType, packageSize: db().packageSize, slot: db().timeSlot, city: db().city, plan: db().subscriptionPlan })[e];

export async function upsertEntity(admin: AuthUser, entity: Entity, id: number | null, raw: unknown) {
  const data = schemas[entity].parse(raw) as Record<string, unknown>;
  const d = delegate(entity);
  let before = null;
  let saved;
  if (id) {
    before = await d.findUnique({ where: { id } });
    if (!before) throw notFound();
    // English codes are permanent: stored data and reports rely on them.
    if ("code" in data && before.code !== data.code) throw bad("invalid");
    saved = await d.update({ where: { id }, data });
  } else {
    if ("code" in data && (await d.findUnique({ where: { code: data.code } }))) throw bad("invalid");
    saved = await d.create({ data });
  }
  await audit({ actorId: admin.id, action: `catalog.${entity}.${id ? "update" : "create"}`, entity, entityId: saved.id, before, after: saved });
  invalidateCatalog();
  return saved;
}

export async function savePrices(admin: AuthUser, raw: unknown) {
  const rules = schemas.prices.parse(raw);
  const before = await db().priceRule.findMany();
  await db().$transaction(async (tx) => {
    for (const r of rules) {
      await tx.priceRule.upsert({
        where: { trashTypeId_packageSizeId: { trashTypeId: r.trashTypeId, packageSizeId: r.packageSizeId } },
        create: r,
        update: { firstPrice: r.firstPrice, extraPrice: r.extraPrice },
      });
    }
    await audit({ actorId: admin.id, action: "catalog.prices.update", entity: "priceRule", before, after: rules }, tx);
  });
  invalidateCatalog();
  return db().priceRule.findMany();
}

const settingsSchema = z
  .object({
    orderLimitPerHour: z.number().int().min(1).max(100),
    maxQuantity: z.number().int().min(1).max(100),
    maxPhotos: z.number().int().min(0).max(10),
    slotCutoffMinutes: z.number().int().min(0).max(600),
    bookingDaysAhead: z.number().int().min(0).max(60),
    paymentTimeoutMinutes: z.number().int().min(5).max(720),
    methods: z.object({ subscription: z.boolean(), cash: z.boolean(), click: z.boolean(), payme: z.boolean(), card: z.boolean() }).partial(),
    cardProvider: z.enum(["payme", "click"]),
    paymentMode: z.object({ click: z.enum(["telegram", "merchant"]), payme: z.enum(["telegram", "merchant"]) }).partial(),
    telegramFiscalData: z.boolean(),
    paymeTestMode: z.boolean(),
    ipAllowlistEnabled: z.boolean(),
    ipAllowlist: z.object({ payme: z.array(z.string().max(40)).max(50), click: z.array(z.string().max(40)).max(50) }).partial(),
    retention: z.object({ photosDays: z.number().int().min(1).max(3650), supportDays: z.number().int().min(1).max(3650), archiveMonths: z.number().int().min(1).max(120) }).partial(),
    ratingAskDelayMinutes: z.number().int().min(0).max(10_000),
    subscriptionReminderDays: z.number().int().min(1).max(14),
    prioritySlotsForSubscribers: z.boolean(),
    supportMessagesPerMinute: z.number().int().min(1).max(200),
    uploadsPerHour: z.number().int().min(1).max(500),
    supportPhone: z.string().max(30),
  })
  .partial();

export async function updateSettings(admin: AuthUser, raw: unknown): Promise<AppSettings> {
  const patch = settingsSchema.parse(raw);
  const before = await getSettings();
  const after = await saveSettings(patch as Partial<AppSettings>);
  await audit({ actorId: admin.id, action: "settings.update", entity: "settings", before, after });
  return after;
}
