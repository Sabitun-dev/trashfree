// Screenshot every main screen (light + dark, 360 + 414 px) from the dev server with demo data.
// Usage: npm run dev:web  (in another terminal), then: npm run screenshots
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173/app/";
const BROWSER = process.env.BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const only = process.argv[2];

const r = (list) => encodeURIComponent(JSON.stringify(list));
const SCREENS = [
  ["c-home", "customer", r([["home"]])],
  ["c-wizard-1", "customer", r([["home"], ["new_order", { step: 1 }]]), "&draft=1"],
  ["c-wizard-2", "customer", r([["home"], ["new_order", { step: 2 }]]), "&draft=1"],
  ["c-wizard-3", "customer", r([["home"], ["new_order", { step: 3 }]]), "&draft=1"],
  ["c-wizard-4", "customer", r([["home"], ["new_order", { step: 4 }]]), "&draft=1&nosub=1"],
  ["c-order", "customer", r([["home"], ["order", { id: "o1" }]])],
  ["c-orders", "customer", r([["orders"]])],
  ["c-plans", "customer", r([["plans"]])],
  ["c-profile", "customer", r([["profile"]])],
  ["c-bell", "customer", r([["home"], ["notifications"]])],
  ["c-receipt", "customer", r([["home"], ["receipt", { orderId: "o2" }]])],
  ["c-intro", "customer", "", "&intro=1"],
  ["k-list", "courier", r([["c_list"]]), "&mode=courier"],
  ["k-order", "courier", r([["c_list"], ["c_order", { id: "c3" }]]), "&mode=courier"],
  ["k-map", "courier", r([["c_map"]]), "&mode=courier"],
  ["k-today", "courier", r([["c_today"]]), "&mode=courier"],
  ["a-dash", "admin", r([["a_dash"]]), "&mode=admin"],
  ["a-orders", "admin", r([["a_orders"]]), "&mode=admin"],
  ["a-people", "admin", r([["a_people"]]), "&mode=admin"],
  ["a-catalog", "admin", r([["a_catalog"]]), "&mode=admin"],
  ["a-broadcast", "admin", r([["a_more"], ["a_broadcast"]]), "&mode=admin"],
  ["a-cash", "admin", r([["a_more"], ["a_cash"]]), "&mode=admin"],
  ["s-home3", "customer", r([["home"]]), "&curtainoff=1"],
  ["s-wash-new", "customer", r([["home"], ["wash_new", { service: "carpet", step: 3 }]])],
  ["s-wash-quote", "customer", r([["home"], ["wash_order", { id: "w1" }]])],
  ["s-courier-measure", "courier", r([["c_list"], ["c_wash", { id: "w1" }]]), "&mode=courier"],
  ["s-washer", "washer", r([["w_list"], ["w_order", { id: "w1" }]]), "&mode=washer"],
  ["s-admin-services", "admin", r([["a_more"], ["a_services"]]), "&mode=admin"],
  ["s-admin-wash-prices", "admin", r([["a_catalog"], ["a_wash_settings", { service: "carpet" }]]), "&mode=admin"],
  ["s-admin-dash", "admin", r([["a_dash"]]), "&mode=admin"],
];

mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch({ executablePath: BROWSER });
for (const scheme of ["light", "dark"]) {
  for (const width of [360, 414]) {
    const ctx = await browser.newContext({ viewport: { width, height: 780 }, deviceScaleFactor: 1, colorScheme: scheme, locale: "uz-UZ" });
    for (const [name, role, route, extra = ""] of SCREENS) {
      if (only && !name.startsWith(only)) continue;
      const page = await ctx.newPage();
      const lang = process.env.LANG_UI ?? "uz";
      const url = `${BASE}?mock=${role}&lang=${lang}${route ? `&route=${route}` : ""}${extra}`;
      await page.addInitScript(() => localStorage.clear());
      await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `screenshots/${name}-${scheme}-${width}.png`, fullPage: false });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log("done");
