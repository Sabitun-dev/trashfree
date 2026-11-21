import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "../src/server/auth/initData";

const TOKEN = "123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz";
const now = 1_760_000_000;

function make(fields: Record<string, string>, token = TOKEN) {
  const hash = signInitData(fields, token);
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: "Ali", language_code: "uz" });

describe("initData validation", () => {
  it("accepts valid data", () => {
    const raw = make({ auth_date: String(now - 60), user, query_id: "AAA", start_param: "order_abc" });
    const r = validateInitData(raw, TOKEN, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.user.id).toBe(42);
      expect(r.data.startParam).toBe("order_abc");
    }
  });

  it("rejects tampered data (changed user id)", () => {
    const raw = make({ auth_date: String(now - 60), user });
    const tampered = raw.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(tampered).not.toBe(raw);
    expect(validateInitData(tampered, TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects data signed with another bot token", () => {
    const raw = make({ auth_date: String(now - 60), user }, "999:OTHER");
    expect(validateInitData(raw, TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects expired data (older than 24 h)", () => {
    const raw = make({ auth_date: String(now - 24 * 3600 - 1), user });
    expect(validateInitData(raw, TOKEN, now)).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts data exactly 24 h old", () => {
    const raw = make({ auth_date: String(now - 24 * 3600), user });
    expect(validateInitData(raw, TOKEN, now).ok).toBe(true);
  });

  it("rejects missing or malformed input", () => {
    expect(validateInitData("", TOKEN, now)).toEqual({ ok: false, reason: "missing" });
    expect(validateInitData("user=x&hash=zz", TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects data without a user", () => {
    const raw = make({ auth_date: String(now) });
    expect(validateInitData(raw, TOKEN, now)).toEqual({ ok: false, reason: "no_user" });
  });
});
