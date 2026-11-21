// Seed: catalog + demo data. Refuses to run on a database that already has data.
// Usage: npm run db:seed            (catalog + demo users/orders)
//        npm run db:seed -- --catalog-only
import { PrismaClient } from "@prisma/client";
import { calcPrice } from "../src/domain/price";
import { addDays, tashkentDate } from "../src/domain/time";

const db = new PrismaClient();
const catalogOnly = process.argv.includes("--catalog-only");

async function main() {
  // Owners who already opened the app are fine; an existing catalog or any orders are not.
  const [cities, types, orders] = await Promise.all([db.city.count(), db.trashType.count(), db.order.count()]);
  if (cities > 0 || types > 0 || orders > 0) {
    console.error(`❌ The database already has data (${cities} cities, ${types} trash types, ${orders} orders). The seed only runs on an empty catalog.`);
    process.exit(1);
  }

  const tashkent = await db.city.create({ data: { code: "tashkent", nameUz: "Toshkent", nameRu: "Ташкент", nameEn: "Tashkent", centerLat: 41.3111, centerLng: 69.2797, radiusKm: 25, sort: 1 } });
  const samarkand = await db.city.create({ data: { code: "samarkand", nameUz: "Samarqand", nameRu: "Самарканд", nameEn: "Samarkand", centerLat: 39.6542, centerLng: 66.9597, radiusKm: 15, sort: 2 } });

  // Trash types are stored by English code; names are translations only.
  const household = await db.trashType.create({ data: { code: "household", nameUz: "Maishiy", nameRu: "Бытовой", nameEn: "Household", icon: "household", sort: 1, ikpu: "", packageCode: "" } });
  const nonRes = await db.trashType.create({ data: { code: "non_residential", nameUz: "Nomaishiy", nameRu: "Небытовой", nameEn: "Non-residential", icon: "non_residential", sort: 2, ikpu: "", packageCode: "" } });
  const construction = await db.trashType.create({ data: { code: "construction", nameUz: "Qurilish chiqindilari", nameRu: "Строительный мусор", nameEn: "Construction debris", icon: "construction", sort: 3, ikpu: "", packageCode: "" } });

  const small = await db.packageSize.create({ data: { code: "small", nameUz: "Kichik", nameRu: "Маленький", nameEn: "Small", liters: 30, sort: 1 } });
  const medium = await db.packageSize.create({ data: { code: "medium", nameUz: "O'rta", nameRu: "Средний", nameEn: "Medium", liters: 60, sort: 2 } });
  const large = await db.packageSize.create({ data: { code: "large", nameUz: "Katta", nameRu: "Большой", nameEn: "Large", liters: 120, sort: 3 } });

  // Medium bags use the prices from the spec: household 15 000 + 10 000, non-residential 25 000 + 20 000.
  const prices: [number, number, number, number][] = [
    [household.id, small.id, 10_000, 7_000],
    [household.id, medium.id, 15_000, 10_000],
    [household.id, large.id, 25_000, 18_000],
    [nonRes.id, small.id, 18_000, 14_000],
    [nonRes.id, medium.id, 25_000, 20_000],
    [nonRes.id, large.id, 40_000, 30_000],
    [construction.id, small.id, 35_000, 25_000],
    [construction.id, medium.id, 50_000, 40_000],
    [construction.id, large.id, 80_000, 60_000],
  ];
  for (const [trashTypeId, packageSizeId, firstPrice, extraPrice] of prices) {
    await db.priceRule.create({ data: { trashTypeId, packageSizeId, firstPrice, extraPrice } });
  }

  const slots: { id: number }[] = [];
  for (const h of [9, 11, 13, 15, 17]) slots.push(await db.timeSlot.create({ data: { startMinute: h * 60, endMinute: (h + 2) * 60, capacity: 20 } }));

  const plans = [
    await db.subscriptionPlan.create({ data: { code: "start", nameUz: "Start", nameRu: "Старт", nameEn: "Start", pickups: 4, price: 55_000, sort: 1 } }),
    await db.subscriptionPlan.create({ data: { code: "business", nameUz: "Business", nameRu: "Бизнес", nameEn: "Business", pickups: 8, price: 100_000, sort: 2 } }),
    await db.subscriptionPlan.create({ data: { code: "professional", nameUz: "Professional", nameRu: "Профессионал", nameEn: "Professional", pickups: 16, price: 180_000, sort: 3 } }),
  ];
  console.log("✅ Catalog: 2 cities, 3 trash types, 3 sizes, 9 prices, 5 slots, 3 plans");
  if (catalogOnly) return;

  // ---- Demo people (fake Telegram ids; real people appear when they open the app) ----
  const courier1 = await db.user.create({ data: { telegramId: 9_000_000_001n, name: "Jasur Kuryer", phone: "+998901110001", role: "courier", nameConfirmed: true, introSeen: ["courier"], courierCities: { create: [{ cityId: tashkent.id }] } } });
  const courier2 = await db.user.create({ data: { telegramId: 9_000_000_002n, name: "Bekzod Kuryer", phone: "+998901110002", role: "courier", nameConfirmed: true, introSeen: ["courier"], courierCities: { create: [{ cityId: tashkent.id }, { cityId: samarkand.id }] } } });
  const customers = await Promise.all(
    [
      ["Dilnoza", "+998901234501"],
      ["Aziz", "+998901234502"],
      ["Malika", "+998901234503"],
    ].map(([name, phone], i) => db.user.create({ data: { telegramId: BigInt(9_000_000_100 + i), name, phone, nameConfirmed: true, introSeen: ["customer"] } })),
  );
  await db.address.create({ data: { userId: customers[0].id, label: "Uy", address: "Amir Temur ko'chasi, 15", lat: 41.3145, lng: 69.2815, notes: "2-podyezd, 4-qavat" } });

  const sub = await db.subscription.create({
    data: { userId: customers[1].id, planId: plans[1].id, pickupsTotal: 8, pickupsUsed: 3, status: "active", periodStart: new Date(), periodEnd: new Date(Date.now() + 20 * 86_400_000) },
  });

  const today = tashkentDate(new Date());
  const rule = (t: number, s: number) => {
    const r = prices.find((p) => p[0] === t && p[1] === s)!;
    return { firstPrice: r[2], extraPrice: r[3] };
  };
  let n = 0;
  async function order(o: {
    customer: number;
    type: number;
    size: number;
    qty: number;
    status: "open" | "accepted" | "on_the_way" | "completed" | "cancelled";
    method: "cash" | "click" | "payme" | "subscription";
    courier?: number;
    city?: number;
    day?: number;
    rating?: number;
  }) {
    n++;
    const price = calcPrice(rule(o.type, o.size), o.qty);
    const paid = o.method === "click" || o.method === "payme";
    const created = new Date(Date.now() - (o.status === "completed" ? 5 : 1) * 3_600_000);
    const res = await db.order.create({
      data: {
        customerId: o.customer,
        cityId: o.city ?? tashkent.id,
        address: `Demo ko'chasi, ${n}`,
        lat: 41.3111 + (n % 5) * 0.01,
        lng: 69.2797 + (n % 3) * 0.012,
        notes: n % 2 ? "Domofon 12" : null,
        trashTypeId: o.type,
        packageSizeId: o.size,
        quantity: o.qty,
        pickupDate: addDays(today, o.day ?? 0),
        slotId: slots[(n % 4) + 1].id,
        priceTotal: price.total,
        priceBreakdown: price as object,
        status: o.status,
        paymentMethod: o.method,
        paymentStatus: o.method === "subscription" ? "subscription" : paid ? "paid" : o.status === "cancelled" ? "cancelled" : "cod_pending",
        idempotencyKey: `seed-${n}`,
        courierId: o.courier ?? null,
        acceptedAt: o.courier ? new Date(created.getTime() + 600_000) : null,
        onTheWayAt: o.status === "on_the_way" || o.status === "completed" ? new Date(created.getTime() + 1_800_000) : null,
        completedAt: o.status === "completed" ? new Date(created.getTime() + 3_600_000) : null,
        cashCollected: o.status === "completed" && o.method === "cash" ? price.total : null,
        cancelledAt: o.status === "cancelled" ? new Date() : null,
        cancelledBy: o.status === "cancelled" ? "customer" : null,
        rating: o.rating ?? null,
        subscriptionId: o.method === "subscription" ? sub.id : null,
        createdAt: created,
      },
    });
    if (paid) {
      await db.payment.create({
        data: { userId: o.customer, orderId: res.id, provider: `telegram_${o.method}`, method: o.method, amount: price.total, status: "paid", paidAt: created, receiptNo: `TF-SEED-${n}`, providerTxId: `seed:${n}` },
      });
    }
  }

  const [c1, c2, c3] = customers.map((c) => c.id);
  await order({ customer: c1, type: household.id, size: medium.id, qty: 3, status: "open", method: "cash" });
  await order({ customer: c2, type: nonRes.id, size: medium.id, qty: 3, status: "open", method: "payme" });
  await order({ customer: c3, type: household.id, size: small.id, qty: 1, status: "open", method: "click", day: 1 });
  await order({ customer: c1, type: construction.id, size: large.id, qty: 2, status: "accepted", method: "cash", courier: courier1.id });
  await order({ customer: c2, type: household.id, size: medium.id, qty: 1, status: "on_the_way", method: "subscription", courier: courier1.id });
  await order({ customer: c3, type: household.id, size: medium.id, qty: 2, status: "completed", method: "cash", courier: courier1.id, rating: 5 });
  await order({ customer: c1, type: nonRes.id, size: small.id, qty: 1, status: "completed", method: "payme", courier: courier2.id, rating: 4 });
  await order({ customer: c2, type: household.id, size: large.id, qty: 4, status: "completed", method: "cash", courier: courier2.id });
  await order({ customer: c3, type: household.id, size: medium.id, qty: 1, status: "cancelled", method: "cash" });
  await order({ customer: c1, type: household.id, size: medium.id, qty: 2, status: "open", method: "cash", city: samarkand.id });

  console.log("✅ Demo: 2 couriers, 3 customers, 1 subscription, 10 orders");
  console.log("   Expected dashboard (today): 10 orders · 3 completed · 6 pending · 1 cancelled");
  console.log("   Cash not handed over: 25 000 (Jasur) + 79 000 (Bekzod) = 104 000 so'm");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
