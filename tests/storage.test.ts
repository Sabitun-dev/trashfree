import { describe, expect, it } from "vitest";
import { createOrderSchema } from "../src/server/orders/service";
import { localName } from "../src/domain/types";
import { BOT_DICTS, TEXT_KEYS } from "../src/server/bot/texts";
import { uz } from "../webapp/src/i18n/uz";
import { ru } from "../webapp/src/i18n/ru";
import { en } from "../webapp/src/i18n/en";

const base = {
  idempotencyKey: "abcdefgh-1234",
  lat: 41.31,
  lng: 69.28,
  address: "Amir Temur 15",
  packageSize: "medium",
  quantity: 3,
  pickupDate: "2026-11-22",
  slotId: 1,
  paymentMethod: "cash",
};

describe("trash types are stored as English codes", () => {
  it("accepts English codes", () => {
    for (const code of ["household", "non_residential", "construction"]) {
      expect(createOrderSchema.safeParse({ ...base, trashType: code }).success).toBe(true);
    }
  });
  it("rejects translated names", () => {
    for (const name of ["Maishiy", "Бытовой", "Qurilish chiqindilari", "Household", "non-residential"]) {
      expect(createOrderSchema.safeParse({ ...base, trashType: name }).success).toBe(false);
    }
  });
  it("shows the name in the user's language", () => {
    const t = { nameUz: "Maishiy", nameRu: "Бытовой", nameEn: "Household" };
    expect(localName(t, "uz")).toBe("Maishiy");
    expect(localName(t, "ru")).toBe("Бытовой");
    expect(localName(t, "en")).toBe("Household");
  });
});

describe("translations are complete", () => {
  it("app: ru and en have every uz key, none empty", () => {
    for (const d of [ru, en]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(uz).sort());
      expect(Object.values(d).every((v) => v.trim().length > 0)).toBe(true);
    }
  });
  it("bot: every language has every key", () => {
    for (const lang of ["uz", "ru", "en"] as const) {
      for (const k of TEXT_KEYS) expect(BOT_DICTS[lang][k], `${lang}.${k}`).toBeTruthy();
    }
  });
  it("placeholders match across languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(uz) as (keyof typeof uz)[]) {
      expect(ph(ru[k]), `ru.${k}`).toBe(ph(uz[k]));
      expect(ph(en[k]), `en.${k}`).toBe(ph(uz[k]));
    }
  });
});
