// Service-area checks and straight-line distances.

export const UZ_BOUNDS = { minLat: 37.1, maxLat: 45.6, minLng: 55.9, maxLng: 73.2 };

export interface CityArea {
  id: number;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  active: boolean;
}

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function inUzbekistan(lat: number, lng: number): boolean {
  return lat >= UZ_BOUNDS.minLat && lat <= UZ_BOUNDS.maxLat && lng >= UZ_BOUNDS.minLng && lng <= UZ_BOUNDS.maxLng;
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type AreaCheck = { ok: true; cityId: number } | { ok: false; reason: "invalid" | "outside_uzbekistan" | "no_service" };

/** Returns the nearest active city whose circle contains the point. */
export function findServiceCity<C extends CityArea>(cities: C[], lat: number, lng: number): AreaCheck {
  if (!isValidCoord(lat, lng)) return { ok: false, reason: "invalid" };
  if (!inUzbekistan(lat, lng)) return { ok: false, reason: "outside_uzbekistan" };
  let best: { id: number; d: number } | null = null;
  for (const c of cities) {
    if (!c.active) continue;
    const d = distanceKm(lat, lng, c.centerLat, c.centerLng);
    if (d <= c.radiusKm && (!best || d < best.d)) best = { id: c.id, d };
  }
  return best ? { ok: true, cityId: best.id } : { ok: false, reason: "no_service" };
}

export interface Point {
  id: string;
  lat: number;
  lng: number;
}

/** Nearest-neighbour route from a start point (straight-line distance). */
export function nearestNeighbourRoute<P extends Point>(start: { lat: number; lng: number }, points: P[]): P[] {
  const left = [...points];
  const route: P[] = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((p, i) => {
      const d = distanceKm(cur.lat, cur.lng, p.lat, p.lng);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const [next] = left.splice(bi, 1);
    route.push(next);
    cur = next;
  }
  return route;
}
