// Applies every migration, in order, to a throwaway in-memory Postgres (PGlite) that already holds trash data —
// the way production looks — and checks that nothing existing breaks.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "prisma", "migrations");
const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let db: PGlite;

async function apply(name: string) {
  await db.exec(readFileSync(join(dir, name, "migration.sql"), "utf8"));
}

/** Minimal trash data, inserted right after the first migration (before any later ones). */
async function seedTrashData() {
  await db.exec(`
    INSERT INTO "User" (id, "telegramId", name, role, "updatedAt") VALUES
      (1, 100, 'Owner', 'owner', now()), (2, 200, 'Courier A', 'courier', now()), (3, 300, 'Client', 'customer', now()),
      (4, 400, 'Admin courier', 'admin', now());
    INSERT INTO "City" (id, code, "nameUz", "nameRu", "nameEn", "centerLat", "centerLng", "radiusKm") VALUES (1, 'tashkent', 'Toshkent', 'Ташкент', 'Tashkent', 41.3, 69.2, 25);
    INSERT INTO "CourierCity" ("userId", "cityId") VALUES (2, 1), (4, 1);
    INSERT INTO "TrashType" (id, code, "nameUz", "nameRu", "nameEn") VALUES (1, 'household', 'Maishiy', 'Бытовой', 'Household');
    INSERT INTO "PackageSize" (id, code, "nameUz", "nameRu", "nameEn") VALUES (1, 'medium', 'O''rta', 'Средний', 'Medium');
    INSERT INTO "TimeSlot" (id, "startMinute", "endMinute") VALUES (1, 540, 660);
    INSERT INTO "Order" (id, "customerId", "cityId", address, "trashTypeId", "packageSizeId", quantity, "pickupDate", "slotId", "priceTotal", "priceBreakdown",
      status, "paymentStatus", "paymentMethod", "idempotencyKey", "courierId", "cashCollected", "updatedAt")
    VALUES ('ctrash1', 3, 1, 'Street 1', 1, 1, 3, '2026-11-20', 1, 35000, '{}', 'completed', 'cod_pending', 'cash', 'k1', 2, 35000, now()),
           ('ctrash2', 3, 1, 'Street 2', 1, 1, 1, '2026-11-24', 1, 15000, '{}', 'accepted', 'cod_pending', 'cash', 'k2', 2, NULL, now());
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await apply(migrations[0]);
  await seedTrashData();
  for (const m of migrations.slice(1)) await apply(m);
}, 60_000);

describe("database migrations", () => {
  it("all migrations apply in order on a database that already has trash orders", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(3);
  });

  it("existing trash orders are untouched", async () => {
    const r = await db.query<{ id: string; status: string; priceTotal: number; cashCollected: number | null }>(`SELECT id, status, "priceTotal", "cashCollected" FROM "Order" ORDER BY id`);
    expect(r.rows).toEqual([
      { id: "ctrash1", status: "completed", priceTotal: 35000, cashCollected: 35000 },
      { id: "ctrash2", status: "accepted", priceTotal: 15000, cashCollected: null },
    ]);
  });

  it("trash stays on; carpet and curtain start off", async () => {
    const r = await db.query<{ code: string; enabled: boolean }>(`SELECT code, enabled FROM "Service" ORDER BY sort`);
    expect(r.rows).toEqual([
      { code: "trash", enabled: true },
      { code: "carpet", enabled: false },
      { code: "curtain", enabled: false },
    ]);
  });

  it("every existing courier (and admin with cities) keeps handling trash", async () => {
    const r = await db.query<{ userId: number; service: string }>(`SELECT "userId", service FROM "CourierService" ORDER BY "userId"`);
    expect(r.rows).toEqual([
      { userId: 2, service: "trash" },
      { userId: 4, service: "trash" },
    ]);
  });

  it("carpet and curtain get the starting price settings from the spec", async () => {
    const r = await db.query<{ service: string; pricePerM2: number; washerSharePerM2: number; minOrder: number; deliveryFee: number; freeDeliveryFrom: number }>(
      `SELECT service, "pricePerM2", "washerSharePerM2", "minOrder", "deliveryFee", "freeDeliveryFrom" FROM "WashSettings" ORDER BY service`,
    );
    expect(r.rows).toEqual([
      { service: "carpet", pricePerM2: 12000, washerSharePerM2: 8000, minOrder: 60000, deliveryFee: 10000, freeDeliveryFrom: 180000 },
      { service: "curtain", pricePerM2: 12000, washerSharePerM2: 8000, minOrder: 60000, deliveryFee: 10000, freeDeliveryFrom: 180000 },
    ]);
  });

  it("the new washer role can be used", async () => {
    await db.exec(`INSERT INTO "User" (id, "telegramId", name, role, "updatedAt") VALUES (9, 900, 'Washer', 'washer', now())`);
    const r = await db.query<{ role: string }>(`SELECT role FROM "User" WHERE id = 9`);
    expect(r.rows[0].role).toBe("washer");
  });
});
