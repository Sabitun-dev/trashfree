// Validates Telegram Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

export interface InitData {
  user: TgUser;
  authDate: number;
  startParam?: string;
  queryId?: string;
}

export type InitDataResult = { ok: true; data: InitData } | { ok: false; reason: "missing" | "bad_hash" | "expired" | "no_user" };

export const MAX_AGE_SECONDS = 24 * 60 * 60;

export function secretKey(botToken: string): Buffer {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

export function signInitData(params: Record<string, string>, botToken: string): string {
  const check = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");
  return createHmac("sha256", secretKey(botToken)).update(check).digest("hex");
}

export function validateInitData(raw: string | null | undefined, botToken: string, nowSec = Math.floor(Date.now() / 1000)): InitDataResult {
  if (!raw) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: "bad_hash" };
  const fields: Record<string, string> = {};
  for (const [k, v] of params) if (k !== "hash") fields[k] = v;

  const expected = Buffer.from(signInitData(fields, botToken), "hex");
  const given = Buffer.from(hash, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_hash" };

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || nowSec - authDate > MAX_AGE_SECONDS || authDate - nowSec > 300) {
    return { ok: false, reason: "expired" };
  }
  let user: TgUser | undefined;
  try {
    user = fields.user ? JSON.parse(fields.user) : undefined;
  } catch {
    user = undefined;
  }
  if (!user || typeof user.id !== "number") return { ok: false, reason: "no_user" };
  return { ok: true, data: { user, authDate, startParam: fields.start_param, queryId: fields.query_id } };
}
