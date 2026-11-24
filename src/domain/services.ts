// Services: trash pickup, carpet washing, curtain washing. Rules for the admin on/off switches.

export const SERVICE_CODES = ["trash", "carpet", "curtain"] as const;
export type ServiceCode = (typeof SERVICE_CODES)[number];
export const WASH_SERVICES: ServiceCode[] = ["carpet", "curtain"];
export const isWashService = (s: string): s is "carpet" | "curtain" => s === "carpet" || s === "curtain";

export interface ServiceState {
  code: ServiceCode;
  enabled: boolean;
  /** When off: show the button as "Hozircha mavjud emas" (true) or hide it (false). */
  showWhenOff: boolean;
  offMessage: string | null;
  /** Off until this moment; from then on it counts as on. */
  offUntil: Date | null;
}

/** Can new orders be created for this service right now? */
export function isServiceOpen(s: Pick<ServiceState, "enabled" | "offUntil"> | null | undefined, now: Date): boolean {
  if (!s) return false;
  if (s.enabled) return true;
  return !!s.offUntil && s.offUntil.getTime() <= now.getTime();
}

export type ServiceVisibility = "open" | "unavailable" | "hidden";

/** What the client's menu shows for this service. */
export function serviceVisibility(s: ServiceState | null | undefined, now: Date): ServiceVisibility {
  if (!s) return "hidden";
  if (isServiceOpen(s, now)) return "open";
  return s.showWhenOff ? "unavailable" : "hidden";
}

/** Couriers handle the services they were given; admins acting as couriers handle all. */
export function courierHandles(role: string, services: readonly string[], service: ServiceCode): boolean {
  if (role === "admin" || role === "owner") return true;
  return role === "courier" && services.includes(service);
}
