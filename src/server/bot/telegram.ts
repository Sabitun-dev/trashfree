// Telegram Bot API access and Mini App deep links.
import { Api, GrammyError, InlineKeyboard } from "grammy";
import { encodeStartParam, type Screen } from "../../domain/deeplink";
import { env } from "../env";

let api: Api | undefined;
export function tg(): Api {
  return (api ??= new Api(env.botToken));
}

let username: string | undefined;
export async function botUsername(): Promise<string> {
  if (env.botUsername) return env.botUsername.replace(/^@/, "");
  if (!username) username = (await tg().getMe()).username;
  return username;
}

/** https://t.me/<bot>/<app>?startapp=<param> — opens the Mini App on that screen. */
export async function appLink(screen: Screen = { name: "home" }): Promise<string> {
  const base = `https://t.me/${await botUsername()}/${env.miniAppShortName}`;
  return screen.name === "home" ? base : `${base}?startapp=${encodeStartParam(screen)}`;
}

export async function openKeyboard(label: string, screen: Screen = { name: "home" }) {
  return new InlineKeyboard().url(label, await appLink(screen));
}

/** True when the user blocked the bot or deleted their account (stop sending to them). */
export function isBlockedError(e: unknown): boolean {
  return e instanceof GrammyError && (e.error_code === 403 || /chat not found|user is deactivated/i.test(e.description));
}

export function retryAfter(e: unknown): number | null {
  return e instanceof GrammyError && e.error_code === 429 ? (e.parameters?.retry_after ?? 1) : null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
