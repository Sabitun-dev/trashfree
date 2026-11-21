// Reverse geocoding through Nominatim, following its usage policy:
// identifying User-Agent, at most 1 request per second (shared across all instances via the DB), cached results.
import { db } from "./db";
import { env } from "./env";
import { hit } from "./ratelimit";
import { sleep } from "./bot/telegram";

const UA = () => `Trashfree/1.0 (trash pickup Mini App; ${env.siteUrl})`;

async function nominatimSlot(): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    if (await hit("nominatim", 1, 1)) return true;
    await sleep(1100);
  }
  return false;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  residential?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
}

export function formatAddress(a: NominatimAddress | undefined, display?: string): string {
  if (!a) return (display ?? "").split(",").slice(0, 3).join(",").trim();
  const street = [a.road ?? a.pedestrian, a.house_number].filter(Boolean).join(", ");
  const area = a.neighbourhood ?? a.quarter ?? a.residential ?? a.suburb ?? a.city_district;
  const city = a.city ?? a.town ?? a.village;
  const parts = [street, area, city].filter(Boolean);
  return parts.length ? parts.join(", ") : (display ?? "").split(",").slice(0, 3).join(",").trim();
}

export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${lang}`;
  const cached = await db().geocodeCache.findUnique({ where: { key } });
  if (cached) return cached.address;
  if (!(await nominatimSlot())) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}&accept-language=${lang}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA(), Referer: env.siteUrl }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    const address = formatAddress(j.address, j.display_name).slice(0, 300);
    if (address) await db().geocodeCache.upsert({ where: { key }, create: { key, address }, update: { address } });
    return address || null;
  } catch {
    return null;
  }
}

export interface SearchResult {
  address: string;
  lat: number;
  lng: number;
}

export async function searchAddress(q: string, lang: string): Promise<SearchResult[]> {
  if (!(await nominatimSlot())) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=uz&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA(), Referer: env.siteUrl }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { lat: string; lon: string; address?: NominatimAddress; display_name?: string }[];
    return j.map((r) => ({ address: formatAddress(r.address, r.display_name), lat: Number(r.lat), lng: Number(r.lon) }));
  } catch {
    return [];
  }
}
