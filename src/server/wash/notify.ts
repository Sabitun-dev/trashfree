// Carpet & curtain notifications: client, couriers, and admin alerts.
import { formatSom } from "../../domain/money";
import { formatSlot } from "../../domain/time";
import { formatM2, washLabel, washNumber, type WashService } from "../../domain/wash";
import { asLang, bt, type TextKey } from "../bot/texts";
import { db } from "../db";
import { safeLog } from "../errors";
import { notify, notifyMany } from "../notify/send";
import type { WashOrderFull } from "./serialize";

const svcKey = (s: string): TextKey => (s === "carpet" ? "svc_carpet" : "svc_curtain");
const som = (n: number, lang: string) => formatSom(n, asLang(lang) === "ru" ? "сум" : "so'm");
const num = (o: { service: string; number: number }) => washNumber(o.service as WashService, o.number);
const screen = (o: { id: string }) => ({ name: "wash_order" as const, id: o.id });
const langOf = async (userId: number) => asLang((await db().user.findUnique({ where: { id: userId }, select: { language: true } }))?.language);

export async function notifyWashPlaced(o: WashOrderFull) {
  const lang = await langOf(o.customerId);
  await notify({
    userId: o.customerId,
    type: "wash_placed",
    params: { svc: bt(lang, svcKey(o.service)), num: num(o), date: o.pickupDate.split("-").reverse().join("."), slot: formatSlot(o.slot.startMinute, o.slot.endMinute) },
    screen: screen(o),
    dedupKey: `wplaced:${o.id}`,
  });
  // Couriers of this city who handle this service (admins with cities too).
  const couriers = await db().user.findMany({
    where: {
      courierCities: { some: { cityId: o.cityId } },
      OR: [{ role: "courier", courierServices: { some: { service: o.service } } }, { role: { in: ["admin", "owner"] } }],
      blocked: false,
      deletedAt: null,
    },
    select: { id: true, language: true },
  });
  await notifyMany(
    couriers.map((c) => ({
      userId: c.id,
      type: "wash_new" as const,
      params: { svc: bt(c.language, svcKey(o.service)), num: num(o), address: o.address, date: o.pickupDate.split("-").reverse().join("."), slot: formatSlot(o.slot.startMinute, o.slot.endMinute) },
      screen: screen(o),
      dedupKey: `wnew:${o.id}`,
    })),
  );
}

export async function notifyWashAssigned(o: WashOrderFull) {
  await notify({ userId: o.customerId, type: "wash_assigned", params: { num: num(o), courier: o.courier?.name ?? "" }, screen: screen(o), dedupKey: `wassign:${o.id}:${o.courierId}` });
}

/** The quote: every item's size, the price lines and the total, with Confirm / Decline buttons. */
export async function sendQuoteToClient(o: WashOrderFull) {
  const q = o.quotes[0];
  if (!q) return;
  const lang = await langOf(o.customerId);
  const lines = (q.lines as unknown as { lengthCm: number; widthCm: number; areaTenths: number; amount: number }[]).map((l, i) =>
    bt(lang, "wash_quote_line", {
      label: washLabel(o.service as WashService, o.number, i + 1),
      l: (l.lengthCm / 100).toFixed(2),
      w: (l.widthCm / 100).toFixed(2),
      area: (l.areaTenths / 10).toFixed(1),
      amount: som(l.amount, lang),
    }),
  );
  if (q.minimumApplied) lines.push("", bt(lang, "wash_quote_min", { amount: som(q.total - q.deliveryFee, lang) }));
  lines.push(q.deliveryFee > 0 ? bt(lang, "wash_quote_delivery", { amount: som(q.deliveryFee, lang) }) : bt(lang, "wash_quote_delivery_free"));
  await notify({
    userId: o.customerId,
    type: "wash_quote",
    params: { svc: bt(lang, svcKey(o.service)), num: num(o), lines: lines.join("\n"), total: som(q.total, lang) },
    screen: screen(o),
    dedupKey: `wquote:${o.id}:${q.version}`,
    callbackButtons: [
      { key: "wash_btn_confirm", data: `wq:${o.id}:${q.version}:y` },
      { key: "wash_btn_decline", data: `wq:${o.id}:${q.version}:n` },
    ],
  });
}

export async function notifyQuoteAnswer(o: WashOrderFull, accepted: boolean) {
  if (!o.courierId) return;
  await notify({ userId: o.courierId, type: accepted ? "wash_courier_confirmed" : "wash_courier_declined", params: { num: num(o) }, screen: screen(o), dedupKey: `wans:${o.id}:${o.quoteVersion}` });
}

export async function notifyWashPicked(o: WashOrderFull) {
  await notify({ userId: o.customerId, type: "wash_picked", params: { num: num(o) }, screen: screen(o), dedupKey: `wpicked:${o.id}` });
}

export async function notifyWashCancelled(o: WashOrderFull, reason: string | null, by: string) {
  const lang = await langOf(o.customerId);
  if (by !== "customer") await notify({ userId: o.customerId, type: "wash_cancelled", params: { num: num(o), reason: reason ?? bt(lang, "reason_none") }, screen: screen(o), dedupKey: `wcancel:${o.id}` });
  if (o.courierId) await notify({ userId: o.courierId, type: "wash_cancelled", params: { num: num(o), reason: reason ?? "" }, screen: screen(o), dedupKey: `wcancel:${o.id}` });
}

/** Admin alerts go to every admin and owner (bot message + bell). */
export async function alertAdmins(kind: Extract<TextKey, `alert_${string}`>, params: Record<string, string | number>, target: { id: string } | null, dedupKey: string) {
  try {
    const admins = await db().user.findMany({ where: { role: { in: ["admin", "owner"] }, blocked: false, deletedAt: null }, select: { id: true, language: true } });
    await notifyMany(
      admins.map((a) => ({
        userId: a.id,
        type: "admin_alert" as const,
        params: { text: bt(a.language, kind, params), kind },
        screen: target ? screen(target) : { name: "admin" as const },
        dedupKey: `alert:${dedupKey}`,
      })),
    );
  } catch (e) {
    safeLog("admin alert failed", e);
  }
}

export const fmtArea = formatM2;

const STATUS_KEY: Record<string, TextKey> = {
  washed: "wash_st_washed",
  out_for_delivery: "wash_st_out",
  delivered_paid: "wash_st_delivered",
};

/** Client updates for the later steps (washed, out for delivery, delivered). */
export async function notifyWashStatus(o: WashOrderFull, status: "washed" | "out_for_delivery" | "delivered_paid") {
  const lang = await langOf(o.customerId);
  await notify({ userId: o.customerId, type: "wash_status", params: { num: num(o), status }, text: bt(lang, STATUS_KEY[status], { num: num(o) }), screen: screen(o), dedupKey: `wst:${o.id}:${status}` });
}

export async function notifyWasherNewItems(o: WashOrderFull) {
  if (!o.washerId) return;
  await notify({ userId: o.washerId, type: "wash_status", params: { num: num(o), status: "at_washer" }, text: bt(await langOf(o.washerId), "wash_washer_new", { num: num(o), count: o.items.length }), screen: screen(o), dedupKey: `wwasher:${o.id}:${o.washerId}` });
}
