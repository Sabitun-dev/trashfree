// Order events → customer / courier notifications and the courier group post.
import { InlineKeyboard } from "grammy";
import { formatSom } from "../../domain/money";
import { formatSlot } from "../../domain/time";
import { localName, type Lang } from "../../domain/types";
import { appLink, tg } from "../bot/telegram";
import { asLang, bt } from "../bot/texts";
import { catalog } from "../catalog";
import { db } from "../db";
import { env } from "../env";
import { safeLog } from "../errors";
import type { OrderFull } from "../orders/serialize";
import { notify, notifyMany } from "./send";

const som = (n: number, lang: Lang) => formatSom(n, lang === "ru" ? "сум" : "so'm");

async function courierText(o: OrderFull, lang: Lang) {
  const cat = await catalog();
  const type = cat.trashTypes.find((x) => x.id === o.trashTypeId);
  const size = cat.packageSizes.find((x) => x.id === o.packageSizeId);
  const payment = o.paymentMethod === "cash" ? bt(lang, "cash_to_collect", { total: som(o.priceTotal, lang) }) : bt(lang, "paid_online");
  return bt(lang, "new_order", {
    n: o.number,
    address: o.address,
    date: o.pickupDate.split("-").reverse().join("."),
    slot: formatSlot(o.slot.startMinute, o.slot.endMinute),
    type: type ? localName(type, lang) : "",
    size: size ? localName(size, lang) : "",
    qty: o.quantity,
    payment,
  });
}

/** Couriers of the order's city get "Yangi buyurtma"; optionally also the courier group. */
export async function notifyCouriersNewOrder(o: OrderFull, round = "0") {
  try {
    const couriers = await db().user.findMany({
      where: { courierCities: { some: { cityId: o.cityId } }, role: { in: ["courier", "admin", "owner"] }, blocked: false, deletedAt: null },
      select: { id: true, language: true },
    });
    const inputs = [];
    for (const c of couriers) {
      const lang = asLang(c.language);
      inputs.push({
        userId: c.id,
        type: "new_order" as const,
        params: { n: o.number },
        text: await courierText(o, lang),
        screen: { name: "courier_order" as const, id: o.id },
        dedupKey: `new_order:${o.id}:${round}`,
      });
    }
    await notifyMany(inputs);
    await postToCourierGroup(o);
  } catch (e) {
    safeLog("notifyCouriersNewOrder failed", e);
  }
}

async function postToCourierGroup(o: OrderFull) {
  if (!env.courierGroupChatId) return;
  try {
    const msg = await tg().sendMessage(env.courierGroupChatId, await courierText(o, "uz"), {
      reply_markup: new InlineKeyboard().url(bt("uz", "open"), await appLink({ name: "courier_order", id: o.id })),
    });
    await db().order.update({ where: { id: o.id }, data: { courierGroupMsg: msg.message_id } });
  } catch (e) {
    safeLog("courier group post failed", e);
  }
}

/** Edit the group post: "Olindi ✅" when taken, or remove the button when cancelled. */
async function updateGroupPost(o: OrderFull, text: string) {
  if (!env.courierGroupChatId || !o.courierGroupMsg) return;
  try {
    await tg().editMessageText(env.courierGroupChatId, o.courierGroupMsg, text);
  } catch (e) {
    safeLog("courier group edit failed", e);
  }
}

export async function onOrderOpened(o: OrderFull, opts: { notifyCustomer?: boolean } = {}) {
  if (opts.notifyCustomer !== false) {
    const lang = asLang((await db().user.findUnique({ where: { id: o.customerId }, select: { language: true } }))?.language);
    await notify({
      userId: o.customerId,
      type: "order_placed",
      params: {
        n: o.number,
        date: o.pickupDate.split("-").reverse().join("."),
        slot: formatSlot(o.slot.startMinute, o.slot.endMinute),
        total: o.paymentMethod === "subscription" ? bt(lang, "method_subscription") : som(o.priceTotal, lang),
      },
      screen: { name: "order", id: o.id },
      dedupKey: `placed:${o.id}`,
    });
  }
  await notifyCouriersNewOrder(o);
}

export async function onOrderAccepted(o: OrderFull) {
  await notify({ userId: o.customerId, type: "order_accepted", params: { n: o.number, courier: o.courier?.name ?? "" }, screen: { name: "order", id: o.id }, dedupKey: `accepted:${o.id}:${o.acceptedAt?.getTime()}` });
  await updateGroupPost(o, bt("uz", "taken", { n: o.number }));
}

export async function onOrderOnTheWay(o: OrderFull) {
  await notify({ userId: o.customerId, type: "order_on_the_way", params: { n: o.number }, screen: { name: "order", id: o.id }, dedupKey: `otw:${o.id}` });
}

export async function onOrderCompleted(o: OrderFull) {
  const photo = await db().orderPhoto.findFirst({ where: { orderId: o.id, kind: "completion" }, select: { blobKey: true } });
  await notify({
    userId: o.customerId,
    type: "order_completed",
    params: { n: o.number },
    screen: { name: "order", id: o.id },
    dedupKey: `done:${o.id}`,
    photoBlobKey: photo?.blobKey,
    extraButtons: [{ key: "rate", screen: { name: "order", id: o.id } }],
  });
  // The rating request is already in the completion message.
  await db().order.update({ where: { id: o.id }, data: { ratingAskedAt: new Date() } });
}

export async function onOrderCancelled(o: OrderFull, info: { by: "customer" | "admin" | "system"; reason?: string }) {
  const lang = asLang((await db().user.findUnique({ where: { id: o.customerId }, select: { language: true } }))?.language);
  if (info.by !== "customer") {
    await notify({ userId: o.customerId, type: "order_cancelled", params: { n: o.number, reason: info.reason || bt(lang, "reason_none") }, screen: { name: "order", id: o.id }, dedupKey: `cancel:${o.id}` });
  }
  if (o.courierId) {
    await notify({ userId: o.courierId, type: "order_cancelled", params: { n: o.number, reason: info.reason || "" }, screen: { name: "courier_order", id: o.id }, dedupKey: `cancel:${o.id}` });
  }
  await updateGroupPost(o, `❌ #${o.number}`);
}

/** A courier gave the order back: it's open again for everyone. */
export async function onOrderReleased(o: OrderFull) {
  await updateGroupPost(o, `↩️ #${o.number}`);
  await notifyCouriersNewOrder(o, `r${Date.now()}`);
}

export async function onOrderAssigned(o: OrderFull, previousCourierId: number | null) {
  if (previousCourierId && previousCourierId !== o.courierId) {
    await notify({ userId: previousCourierId, type: "order_unassigned", params: { n: o.number }, screen: { name: "courier" }, dedupKey: `unassign:${o.id}:${Date.now()}` });
  }
  if (o.courierId) {
    await notify({ userId: o.courierId, type: "order_assigned", params: { n: o.number, address: o.address }, screen: { name: "courier_order", id: o.id }, dedupKey: `assign:${o.id}:${Date.now()}` });
    await notify({ userId: o.customerId, type: "order_accepted", params: { n: o.number, courier: o.courier?.name ?? "" }, screen: { name: "order", id: o.id }, dedupKey: `accepted:${o.id}:${o.courierId}` });
    await updateGroupPost(o, bt("uz", "taken", { n: o.number }));
  }
}
