// Telegram webhook. Telegram sends our WEBHOOK_SECRET in X-Telegram-Bot-Api-Secret-Token.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { handleWebhookUpdate } from "../../src/server/bot/bot";
import { env } from "../../src/server/env";
import { safeLog } from "../../src/server/errors";

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!sameSecret(secret, env.webhookSecret)) return new Response("forbidden", { status: 403 });
  let update: { update_id: number };
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    await handleWebhookUpdate(update);
    return new Response("ok");
  } catch (e) {
    safeLog("Webhook update failed", e);
    return new Response("error", { status: 500 });
  }
};

export const config: Config = { path: "/telegram/webhook" };
