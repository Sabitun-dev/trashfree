import { describe, expect, it } from "vitest";
import { courierHandles, isServiceOpen, serviceVisibility, type ServiceState } from "../src/domain/services";

const now = new Date("2026-11-24T10:00:00Z");
const svc = (over: Partial<ServiceState> = {}): ServiceState => ({ code: "carpet", enabled: true, showWhenOff: false, offMessage: null, offUntil: null, ...over });

describe("service switches", () => {
  it("an enabled service is open and visible", () => {
    expect(isServiceOpen(svc(), now)).toBe(true);
    expect(serviceVisibility(svc(), now)).toBe("open");
  });

  it("a disabled service blocks new orders and is hidden by default", () => {
    const off = svc({ enabled: false });
    expect(isServiceOpen(off, now)).toBe(false);
    expect(serviceVisibility(off, now)).toBe("hidden");
  });

  it("the admin can show a disabled service as 'Hozircha mavjud emas'", () => {
    expect(serviceVisibility(svc({ enabled: false, showWhenOff: true, offMessage: "Bu hafta yo'q" }), now)).toBe("unavailable");
  });

  it("'off until a date' reopens by itself when the date is reached", () => {
    const until = svc({ enabled: false, offUntil: new Date("2026-11-26T19:00:00Z") });
    expect(isServiceOpen(until, now)).toBe(false);
    expect(isServiceOpen(until, new Date("2026-11-26T19:00:00Z"))).toBe(true);
    expect(serviceVisibility(until, new Date("2026-11-27T00:00:00Z"))).toBe("open");
  });

  it("a missing service counts as closed", () => {
    expect(isServiceOpen(null, now)).toBe(false);
    expect(serviceVisibility(undefined, now)).toBe("hidden");
  });

  it("all three on → three buttons; one off → two", () => {
    const all = [svc({ code: "trash" }), svc({ code: "carpet" }), svc({ code: "curtain" })];
    expect(all.filter((s) => serviceVisibility(s, now) !== "hidden")).toHaveLength(3);
    all[1] = svc({ code: "carpet", enabled: false });
    expect(all.filter((s) => serviceVisibility(s, now) !== "hidden").map((s) => s.code)).toEqual(["trash", "curtain"]);
  });
});

describe("courier service permissions", () => {
  it("couriers handle only the services they were given", () => {
    expect(courierHandles("courier", ["trash"], "trash")).toBe(true);
    expect(courierHandles("courier", ["trash"], "carpet")).toBe(false);
    expect(courierHandles("courier", ["carpet", "curtain"], "trash")).toBe(false);
  });
  it("admins acting as couriers handle everything; customers nothing", () => {
    expect(courierHandles("admin", [], "carpet")).toBe(true);
    expect(courierHandles("owner", [], "trash")).toBe(true);
    expect(courierHandles("customer", ["trash"], "trash")).toBe(false);
  });
});
