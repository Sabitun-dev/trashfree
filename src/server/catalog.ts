// Catalog (cities, trash types, sizes, prices, slots, plans). Cached briefly per function instance.
import { db } from "./db";

export async function loadCatalog(includeInactive = false) {
  const where = includeInactive ? {} : { active: true };
  const [cities, trashTypes, packageSizes, prices, slots, plans] = await Promise.all([
    db().city.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    db().trashType.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    db().packageSize.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    db().priceRule.findMany(),
    db().timeSlot.findMany({ where, orderBy: { startMinute: "asc" } }),
    db().subscriptionPlan.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }] }),
  ]);
  return { cities, trashTypes, packageSizes, prices, slots, plans };
}

export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

let cache: { at: number; value: Catalog } | undefined;

export async function catalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const value = await loadCatalog();
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateCatalog() {
  cache = undefined;
}
