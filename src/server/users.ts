// Users come only from validated Telegram initData. No sign-up form.
import type { ServiceCode } from "../domain/services";
import type { Role } from "../domain/types";
import type { TgUser } from "./auth/initData";
import { db } from "./db";
import { env } from "./env";

export interface AuthUser {
  id: number;
  telegramId: bigint;
  name: string;
  username: string | null;
  phone: string | null;
  role: Role;
  language: string;
  blocked: boolean;
  nameConfirmed: boolean;
  introSeen: string[];
  mutedCategories: string[];
  cityIds: number[];
  /** Services this person handles as a courier. */
  services: ServiceCode[];
  deletionRequestedAt: Date | null;
  botBlocked: boolean;
}

export function tgFullName(u: { first_name: string; last_name?: string }): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim().slice(0, 80) || "—";
}

export function langFromTelegram(code?: string): string {
  return code?.startsWith("ru") ? "ru" : code?.startsWith("en") ? "en" : "uz";
}

export const userInclude = { courierCities: true, courierServices: true } as const;

/** Find or create the user for a Telegram account; owners from OWNER_TELEGRAM_IDS are promoted. */
export async function upsertTelegramUser(tgUser: TgUser): Promise<AuthUser> {
  const telegramId = BigInt(tgUser.id);
  const isOwner = env.ownerIds.includes(telegramId);
  let user = await db().user.findUnique({ where: { telegramId }, include: userInclude });
  if (!user) {
    user = await db().user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        name: tgFullName(tgUser),
        username: tgUser.username ?? null,
        language: langFromTelegram(tgUser.language_code),
        role: isOwner ? "owner" : "customer",
      },
      update: {},
      include: userInclude,
    });
  } else {
    const patch: { username?: string | null; role?: Role; botBlocked?: boolean } = {};
    if ((tgUser.username ?? null) !== user.username) patch.username = tgUser.username ?? null;
    if (isOwner && user.role !== "owner") patch.role = "owner";
    if (user.botBlocked && tgUser.allows_write_to_pm) patch.botBlocked = false;
    if (Object.keys(patch).length) {
      user = await db().user.update({ where: { id: user.id }, data: patch, include: userInclude });
    }
  }
  return toAuthUser(user);
}

export function toAuthUser(u: {
  id: number;
  telegramId: bigint;
  name: string;
  username: string | null;
  phone: string | null;
  role: Role;
  language: string;
  blocked: boolean;
  nameConfirmed: boolean;
  introSeen: string[];
  mutedCategories: string[];
  deletionRequestedAt: Date | null;
  botBlocked: boolean;
  courierCities: { cityId: number }[];
  courierServices?: { service: string }[];
}): AuthUser {
  return {
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    username: u.username,
    phone: u.phone,
    role: u.role,
    language: u.language,
    blocked: u.blocked,
    nameConfirmed: u.nameConfirmed,
    introSeen: u.introSeen,
    mutedCategories: u.mutedCategories,
    deletionRequestedAt: u.deletionRequestedAt,
    botBlocked: u.botBlocked,
    cityIds: u.courierCities.map((c) => c.cityId),
    services: (u.courierServices ?? []).map((c) => c.service as ServiceCode),
  };
}

export function publicMe(u: AuthUser) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    language: u.language,
    nameConfirmed: u.nameConfirmed,
    introSeen: u.introSeen,
    mutedCategories: u.mutedCategories,
    cityIds: u.cityIds,
    services: u.services,
    deletionRequested: !!u.deletionRequestedAt,
    /** False when the bot could not message this person (they never pressed Start or blocked the bot). */
    botReachable: !u.botBlocked,
  };
}

/** Normalise an Uzbek phone number to +998XXXXXXXXX (or keep +<digits> for others). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return "+998" + digits;
  return "+" + digits;
}
