// Provider callbacks for the direct merchant APIs (Payme JSON-RPC, Click SHOP API).
import type { Config, Context } from "@netlify/functions";
import { env } from "../../src/server/env";
import { safeLog } from "../../src/server/errors";
import { ipAllowed } from "../../src/server/payments/ip";
import { handleClick } from "../../src/server/payments/click";
import { handlePayme } from "../../src/server/payments/payme";
import { prismaClickStore, prismaPaymeStore } from "../../src/server/payments/stores";
import { getSettings } from "../../src/server/settings";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname;
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const settings = await getSettings();

  if (path.endsWith("/payments/payme")) {
    if (settings.ipAllowlistEnabled && !ipAllowed(context.ip, settings.ipAllowlist.payme)) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32504, message: { ru: "Недостаточно привилегий", uz: "Ruxsat yo'q", en: "Insufficient privilege" } } });
    }
    const keys = settings.paymeTestMode ? [env.paymeTestKey ?? "", env.paymeKey ?? ""] : [env.paymeKey ?? ""];
    try {
      return json(await handlePayme(await req.text(), req.headers.get("authorization"), keys, prismaPaymeStore));
    } catch (e) {
      safeLog("Payme callback failed", e);
      return json({ jsonrpc: "2.0", id: null, error: { code: -32400, message: { ru: "Внутренняя ошибка", uz: "Ichki xato", en: "Internal error" } } });
    }
  }

  if (path.includes("/payments/click/")) {
    if (settings.ipAllowlistEnabled && !ipAllowed(context.ip, settings.ipAllowlist.click)) return json({ error: -8, error_note: "Forbidden" });
    if (!env.clickSecretKey || !env.clickServiceId) return json({ error: -8, error_note: "Not configured" });
    const ct = req.headers.get("content-type") ?? "";
    const params: Record<string, string> = ct.includes("application/json")
      ? Object.fromEntries(Object.entries((await req.json()) as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : Object.fromEntries(new URLSearchParams(await req.text()));
    const action = path.endsWith("/prepare") ? 0 : 1;
    try {
      return json(await handleClick(action, params, { secret: env.clickSecretKey, serviceId: env.clickServiceId }, prismaClickStore));
    } catch (e) {
      safeLog("Click callback failed", e);
      return json({ click_trans_id: params.click_trans_id, merchant_trans_id: params.merchant_trans_id, error: -7, error_note: "Failed to update user" });
    }
  }
  return json({ error: "not_found" }, 404);
};

export const config: Config = { path: ["/payments/payme", "/payments/click/prepare", "/payments/click/complete"] };
