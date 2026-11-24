// Service switches on the server: read, enforce (new orders only), update with audit, auto re-enable.
import { isServiceOpen, serviceVisibility, SERVICE_CODES, type ServiceCode, type ServiceState } from "../domain/services";
import { audit } from "./audit";
import { db } from "./db";
import { ApiError } from "./errors";
import type { AuthUser } from "./users";

let cache: { at: number; value: ServiceState[] } | undefined;

export async function loadServices(fresh = false): Promise<ServiceState[]> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  const rows = await db().service.findMany({ orderBy: { sort: "asc" } });
  // A missing row means "not set up": trash stays on (as before services existed), the others stay off.
  const value = SERVICE_CODES.map(
    (code) =>
      rows.find((r) => r.code === code) ?? { code, enabled: code === "trash", showWhenOff: false, offMessage: null, offUntil: null },
  ).map((r) => ({ code: r.code as ServiceCode, enabled: r.enabled, showWhenOff: r.showWhenOff, offMessage: r.offMessage, offUntil: r.offUntil }));
  cache = { at: Date.now(), value };
  return value;
}

/** Rejects a NEW order for a service that is switched off. Orders already in progress never call this. */
export async function assertServiceOpen(code: ServiceCode, now = new Date()) {
  const s = (await loadServices(true)).find((x) => x.code === code);
  if (!isServiceOpen(s, now)) throw new ApiError(409, "service_disabled", { service: code, message: s?.offMessage ?? null });
}

/** What the client menu needs. */
export async function clientServices(now = new Date()) {
  return (await loadServices()).map((s) => ({ code: s.code, visibility: serviceVisibility(s, now), message: s.offMessage }));
}

export interface ServiceUpdate {
  enabled?: boolean;
  showWhenOff?: boolean;
  offMessage?: string | null;
  offUntil?: Date | null;
}

export async function updateService(actor: AuthUser | null, code: ServiceCode, patch: ServiceUpdate, reason?: string) {
  const before = await db().service.findUnique({ where: { code } });
  const data = { ...patch, ...(patch.enabled === true ? { offUntil: null } : {}) };
  const after = await db().service.upsert({ where: { code }, create: { code, enabled: code === "trash", ...data }, update: data });
  await audit({ actorId: actor?.id ?? null, action: `service.${code}.${after.enabled ? "on" : "off"}`, entity: "service", entityId: code, before, after, reason: reason ?? null });
  cache = undefined;
  return after;
}

/** Scheduler: a service switched off "until a date" turns on again by itself (logged as the system). */
export async function reopenScheduledServices(now = new Date()) {
  const due = await db().service.findMany({ where: { enabled: false, offUntil: { lte: now } } });
  for (const s of due) await updateService(null, s.code as ServiceCode, { enabled: true }, "offUntil reached");
  return { reopened: due.map((s) => s.code) };
}
