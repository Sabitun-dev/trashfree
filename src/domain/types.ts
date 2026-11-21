// Shared string unions. Kept identical to the Prisma enums so the web app can use them without Prisma.

export const ROLES = ["customer", "courier", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "awaiting_payment",
  "open",
  "accepted",
  "on_the_way",
  "completed",
  "cancelled",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "cod_pending", "paid", "failed", "cancelled", "subscription"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["subscription", "cash", "click", "payme", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const ONLINE_METHODS: PaymentMethod[] = ["click", "payme", "card"];

export type Lang = "uz" | "ru" | "en";
export const LANGS: Lang[] = ["uz", "ru", "en"];

export interface Named {
  nameUz: string;
  nameRu: string;
  nameEn: string;
}

export function localName(item: Named, lang: Lang): string {
  return lang === "ru" ? item.nameRu : lang === "en" ? item.nameEn : item.nameUz;
}

/** Notification categories. Order and payment messages can never be muted. */
export const MUTABLE_CATEGORIES = ["new_orders", "reminders", "news"] as const;
export type MutableCategory = (typeof MUTABLE_CATEGORIES)[number];
