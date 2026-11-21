// The setup page (/setup?key=SETUP_SECRET). Safe to open any number of times.
import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { tg } from "./bot/telegram";
import { BOT_DICTS } from "./bot/texts";

interface Check {
  name: string;
  ok: boolean | null; // null = optional and not configured
  detail: string;
}

const REQUIRED_ENV = ["BOT_TOKEN", "WEBHOOK_SECRET", "SETUP_SECRET", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "OWNER_TELEGRAM_IDS", "MINIAPP_SHORT_NAME"];
const OPTIONAL_ENV = [
  "BOT_USERNAME",
  "ADMIN_SUPPORT_CHAT_ID",
  "COURIER_GROUP_CHAT_ID",
  "TG_PROVIDER_TOKEN_CLICK",
  "TG_PROVIDER_TOKEN_PAYME",
  "PAYME_MERCHANT_ID",
  "PAYME_KEY",
  "PAYME_TEST_KEY",
  "CLICK_SERVICE_ID",
  "CLICK_MERCHANT_ID",
  "CLICK_SECRET_KEY",
  "CLICK_MERCHANT_USER_ID",
];

export function keyMatches(given: string | null): boolean {
  let expected: string;
  try {
    expected = env.setupSecret;
  } catch {
    return false;
  }
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function step(checks: Check[], name: string, fn: () => Promise<string | { ok: boolean | null; detail: string }>) {
  try {
    const r = await fn();
    checks.push(typeof r === "string" ? { name, ok: true, detail: r } : { name, ...r });
  } catch (e) {
    checks.push({ name, ok: false, detail: e instanceof Error ? e.message.replace(/\d{6,}:[\w-]{30,}/g, "<token>") : String(e) });
  }
}

export async function runSetup(): Promise<Check[]> {
  const checks: Check[] = [];
  for (const k of REQUIRED_ENV) checks.push({ name: `Env ${k}`, ok: !!process.env[k], detail: process.env[k] ? "set" : "missing — add it in Netlify → Site configuration → Environment variables" });
  for (const k of OPTIONAL_ENV) checks.push({ name: `Env ${k}`, ok: process.env[k] ? true : null, detail: process.env[k] ? "set" : "optional, not set" });

  const site = env.siteUrl;
  checks.push({ name: "Site URL", ok: site.startsWith("https://"), detail: site });

  await step(checks, "Database connection", async () => {
    const users = await db().user.count();
    return `connected · ${users} users`;
  });
  await step(checks, "Catalog data", async () => {
    const [cities, types, slots] = await Promise.all([db().city.count(), db().trashType.count(), db().timeSlot.count()]);
    const ok = cities > 0 && types > 0 && slots > 0;
    return { ok, detail: ok ? `${cities} cities, ${types} trash types, ${slots} slots` : "empty — run the seed script (README → Seed data)" };
  });

  let username = "";
  await step(checks, "Bot token", async () => {
    const me = await tg().getMe();
    username = me.username;
    return `@${me.username}`;
  });
  if (!username) return checks;

  await step(checks, "Webhook", async () => {
    await tg().setWebhook(`${site}/telegram/webhook`, {
      secret_token: env.webhookSecret,
      allowed_updates: ["message", "callback_query", "pre_checkout_query", "my_chat_member"],
      drop_pending_updates: false,
    });
    const info = await tg().getWebhookInfo();
    const err = info.last_error_message ? ` · last error: ${info.last_error_message}` : "";
    return { ok: info.url === `${site}/telegram/webhook`, detail: `${info.url} · pending ${info.pending_update_count}${err}` };
  });

  await step(checks, "Bot commands (uz/ru/en)", async () => {
    for (const lang of ["uz", "ru", "en"] as const) {
      const d = BOT_DICTS[lang];
      const commands = [
        { command: "start", description: d.cmd_start },
        { command: "orders", description: d.cmd_orders },
        { command: "help", description: d.cmd_help },
      ];
      await tg().setMyCommands(commands, lang === "uz" ? {} : { language_code: lang });
    }
    return "set";
  });

  await step(checks, "Menu button «Ochish»", async () => {
    await tg().setChatMenuButton({ menu_button: { type: "web_app", text: "Ochish", web_app: { url: `${site}/app/` } } });
    return `${site}/app/`;
  });

  checks.push({
    name: "Mini App link",
    ok: null,
    detail: `https://t.me/${username}/${env.miniAppShortName} — create it in BotFather with /newapp (short name "${env.miniAppShortName}", URL ${site}/app/)`,
  });

  if (env.supportChatId) {
    await step(checks, "Support forum group", async () => {
      const chat = await tg().getChat(env.supportChatId!);
      const isForum = "is_forum" in chat && chat.is_forum;
      const me = await tg().getChatMember(env.supportChatId!, (await tg().getMe()).id);
      const canTopics = me.status === "administrator" && !!me.can_manage_topics;
      return { ok: !!isForum && canTopics, detail: `${"title" in chat ? chat.title : ""} · topics ${isForum ? "on" : "OFF — turn on Topics"} · bot ${canTopics ? "can manage topics" : "must be admin with «Manage topics»"}` };
    });
  }
  if (env.courierGroupChatId) {
    await step(checks, "Courier group", async () => {
      const chat = await tg().getChat(env.courierGroupChatId!);
      const me = await tg().getChatMember(env.courierGroupChatId!, (await tg().getMe()).id);
      const ok = me.status === "administrator" || me.status === "member";
      return { ok, detail: `${"title" in chat ? chat.title : ""} · bot is ${me.status}` };
    });
  }
  checks.push({ name: "Telegram Payments: Click", ok: env.tgProviderClick ? true : null, detail: env.tgProviderClick ? "token set" : "optional — BotFather → Payments → Click" });
  checks.push({ name: "Telegram Payments: Payme", ok: env.tgProviderPayme ? true : null, detail: env.tgProviderPayme ? "token set" : "optional — BotFather → Payments → Payme" });
  checks.push({ name: "Payme Merchant API", ok: env.paymeMerchantId && env.paymeKey ? true : null, detail: `endpoint ${site}/payments/payme` });
  checks.push({ name: "Click SHOP API", ok: env.clickServiceId && env.clickSecretKey ? true : null, detail: `prepare ${site}/payments/click/prepare · complete ${site}/payments/click/complete` });
  return checks;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderSetup(checks: Check[]): string {
  const failed = checks.filter((c) => c.ok === false).length;
  const rows = checks
    .map((c) => `<tr><td>${c.ok === true ? "✅" : c.ok === false ? "❌" : "➖"}</td><td>${esc(c.name)}</td><td>${esc(c.detail)}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trashfree setup</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6f8f7;color:#14201a}h1{font-size:24px}table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden}td{padding:10px;border-bottom:1px solid #e6ece9;vertical-align:top;word-break:break-word}td:first-child{width:28px}.s{padding:12px 16px;border-radius:12px;margin-bottom:16px;background:${failed ? "#fdecec" : "#e8f7ee"}}</style></head>
<body><h1>Trashfree · setup</h1><div class="s">${failed ? `❌ ${failed} problem(s). Fix them and reload this page.` : "✅ Everything is set. You can reload this page any time."}</div><table>${rows}</table></body></html>`;
}
