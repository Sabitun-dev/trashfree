// App settings. Defaults from the spec; admins change them in Catalog → Settings. Stored as one JSON row.
import { db } from "./db";

export interface AppSettings {
  orderLimitPerHour: number;
  maxQuantity: number;
  maxPhotos: number;
  slotCutoffMinutes: number;
  bookingDaysAhead: number;
  paymentTimeoutMinutes: number;
  methods: { subscription: boolean; cash: boolean; click: boolean; payme: boolean; card: boolean };
  /** Which provider handles the "Karta" button. */
  cardProvider: "payme" | "click";
  /** How each provider is used: Telegram Payments (in-app sheet) or the direct merchant API. */
  paymentMode: { click: "telegram" | "merchant"; payme: "telegram" | "merchant" };
  /** Send fiscal items (IKPU) as provider_data in Telegram invoices. */
  telegramFiscalData: boolean;
  paymeTestMode: boolean;
  ipAllowlistEnabled: boolean;
  ipAllowlist: { payme: string[]; click: string[] };
  retention: { photosDays: number; supportDays: number; archiveMonths: number };
  ratingAskDelayMinutes: number;
  subscriptionReminderDays: number;
  prioritySlotsForSubscribers: boolean;
  supportMessagesPerMinute: number;
  uploadsPerHour: number;
  supportPhone: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  orderLimitPerHour: 5,
  maxQuantity: 20,
  maxPhotos: 3,
  slotCutoffMinutes: 60,
  bookingDaysAhead: 7,
  paymentTimeoutMinutes: 30,
  methods: { subscription: true, cash: true, click: true, payme: true, card: true },
  cardProvider: "payme",
  paymentMode: { click: "telegram", payme: "telegram" },
  telegramFiscalData: true,
  paymeTestMode: true,
  ipAllowlistEnabled: false,
  // Fill in the IP ranges your provider gives you (exact IPs or CIDR like "1.2.3.0/24"), then enable.
  ipAllowlist: { payme: [], click: [] },
  retention: { photosDays: 90, supportDays: 90, archiveMonths: 12 },
  ratingAskDelayMinutes: 60,
  subscriptionReminderDays: 3,
  prioritySlotsForSubscribers: false,
  supportMessagesPerMinute: 20,
  uploadsPerHour: 30,
  supportPhone: "",
};

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const b = out[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

let cache: { at: number; value: AppSettings } | undefined;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await db().setting.findUnique({ where: { key: "app" } });
  const value = merge(DEFAULT_SETTINGS, row?.value);
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const value = merge(current, patch);
  await db().setting.upsert({ where: { key: "app" }, create: { key: "app", value: value as object }, update: { value: value as object } });
  cache = { at: Date.now(), value };
  return value;
}

export { merge as mergeSettings };
