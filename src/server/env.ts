// Environment variables. Read lazily so tests and builds don't need them.

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function req(name: string): string {
  const v = opt(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get botToken() {
    return req("BOT_TOKEN");
  },
  get webhookSecret() {
    return req("WEBHOOK_SECRET");
  },
  get setupSecret() {
    return req("SETUP_SECRET");
  },
  get ownerIds(): bigint[] {
    return (opt("OWNER_TELEGRAM_IDS") ?? "")
      .split(/[,\s]+/)
      .filter((s) => /^\d+$/.test(s))
      .map((s) => BigInt(s));
  },
  get miniAppShortName() {
    return opt("MINIAPP_SHORT_NAME") ?? "app";
  },
  get botUsername() {
    return opt("BOT_USERNAME");
  },
  get supportChatId() {
    return opt("ADMIN_SUPPORT_CHAT_ID");
  },
  get courierGroupChatId() {
    return opt("COURIER_GROUP_CHAT_ID");
  },
  /** Public site URL. Netlify sets URL (production) and DEPLOY_PRIME_URL (previews). */
  get siteUrl() {
    return (opt("PUBLIC_URL") ?? opt("URL") ?? "http://localhost:8888").replace(/\/$/, "");
  },
  get context() {
    return opt("CONTEXT") ?? "dev";
  },
  // Telegram Payments provider tokens (BotFather → Payments)
  get tgProviderClick() {
    return opt("TG_PROVIDER_TOKEN_CLICK");
  },
  get tgProviderPayme() {
    return opt("TG_PROVIDER_TOKEN_PAYME");
  },
  // Payme Merchant API
  get paymeMerchantId() {
    return opt("PAYME_MERCHANT_ID");
  },
  get paymeKey() {
    return opt("PAYME_KEY");
  },
  get paymeTestKey() {
    return opt("PAYME_TEST_KEY");
  },
  // Click SHOP API
  get clickServiceId() {
    return opt("CLICK_SERVICE_ID");
  },
  get clickMerchantId() {
    return opt("CLICK_MERCHANT_ID");
  },
  get clickSecretKey() {
    return opt("CLICK_SECRET_KEY");
  },
  get clickMerchantUserId() {
    return opt("CLICK_MERCHANT_USER_ID");
  },
};
