// Demo data for browser previews and screenshots. Development builds only (never in production).
// Open e.g. http://localhost:5173/app/?mock=customer&lang=ru&route=[["home"],["order",{"id":"o1"}]]
import { addDays, tashkentDate } from "@domain/time";
import { setInitData, setTransport, ApiError } from "../lib/api";

const today = tashkentDate(new Date());
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

const catalog = {
  cities: [
    { id: 1, code: "tashkent", nameUz: "Toshkent", nameRu: "Ташкент", nameEn: "Tashkent", centerLat: 41.3111, centerLng: 69.2797, radiusKm: 25, active: true, sort: 1 },
    { id: 2, code: "samarkand", nameUz: "Samarqand", nameRu: "Самарканд", nameEn: "Samarkand", centerLat: 39.6542, centerLng: 66.9597, radiusKm: 15, active: true, sort: 2 },
  ],
  trashTypes: [
    { id: 1, code: "household", nameUz: "Maishiy", nameRu: "Бытовой", nameEn: "Household", icon: "household", ikpu: "10305008002000000", packageCode: "1500391", vatPercent: 0, active: true, sort: 1 },
    { id: 2, code: "non_residential", nameUz: "Nomaishiy", nameRu: "Небытовой", nameEn: "Non-residential", icon: "non_residential", ikpu: "", packageCode: "", vatPercent: 0, active: true, sort: 2 },
    { id: 3, code: "construction", nameUz: "Qurilish chiqindilari", nameRu: "Строительный мусор", nameEn: "Construction debris", icon: "construction", ikpu: "", packageCode: "", vatPercent: 0, active: true, sort: 3 },
  ],
  packageSizes: [
    { id: 1, code: "small", nameUz: "Kichik", nameRu: "Маленький", nameEn: "Small", liters: 30, active: true, sort: 1 },
    { id: 2, code: "medium", nameUz: "O'rta", nameRu: "Средний", nameEn: "Medium", liters: 60, active: true, sort: 2 },
    { id: 3, code: "large", nameUz: "Katta", nameRu: "Большой", nameEn: "Large", liters: 120, active: true, sort: 3 },
  ],
  prices: [
    [1, 1, 10000, 7000], [1, 2, 15000, 10000], [1, 3, 25000, 18000],
    [2, 1, 18000, 14000], [2, 2, 25000, 20000], [2, 3, 40000, 30000],
    [3, 1, 35000, 25000], [3, 2, 50000, 40000], [3, 3, 80000, 60000],
  ].map(([trashTypeId, packageSizeId, firstPrice, extraPrice], i) => ({ id: i + 1, trashTypeId, packageSizeId, firstPrice, extraPrice })),
  slots: [9, 11, 13, 15, 17].map((h, i) => ({ id: i + 1, startMinute: h * 60, endMinute: (h + 2) * 60, capacity: 20, priority: false, active: true })),
  plans: [
    { id: 1, code: "start", nameUz: "Start", nameRu: "Старт", nameEn: "Start", pickups: 4, price: 55000, durationDays: 30, active: true, sort: 1 },
    { id: 2, code: "business", nameUz: "Business", nameRu: "Бизнес", nameEn: "Business", pickups: 8, price: 100000, durationDays: 30, active: true, sort: 2 },
    { id: 3, code: "professional", nameUz: "Professional", nameRu: "Профессионал", nameEn: "Professional", pickups: 16, price: 180000, durationDays: 30, active: true, sort: 3 },
  ],
};

const order = (o: Record<string, unknown>) => ({
  id: "o1",
  number: 1042,
  status: "on_the_way",
  paymentStatus: "cod_pending",
  paymentMethod: "cash",
  cityId: 1,
  address: "Amir Temur ko'chasi, 15",
  lat: 41.3145,
  lng: 69.2815,
  notes: "2-podyezd, 4-qavat, kod 1234",
  trashTypeId: 1,
  packageSizeId: 2,
  quantity: 3,
  pickupDate: today,
  slotId: 3,
  slotStart: 780,
  slotEnd: 900,
  priceTotal: 35000,
  priceBreakdown: { quantity: 3, firstPrice: 15000, extraPrice: 10000, extraCount: 2, extraTotal: 20000, total: 35000 },
  createdAt: iso(90),
  paidAt: null,
  acceptedAt: iso(60),
  onTheWayAt: iso(10),
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
  expiresAt: null,
  rating: null,
  ratingComment: null,
  cashCollected: null,
  courier: { id: 7, name: "Jasur Karimov", phone: "+998901110001" },
  customer: { id: 3, name: "Dilnoza Rahimova", phone: "+998901234501" },
  photos: [],
  receiptNo: null,
  canCancel: false,
  ...o,
});

const orders = [
  order({}),
  order({ id: "o2", number: 1043, status: "open", paymentStatus: "paid", paymentMethod: "payme", address: "Mustaqillik shoh ko'chasi, 59", lat: 41.3168, lng: 69.2491, trashTypeId: 2, quantity: 1, priceTotal: 25000, pickupDate: addDays(today, 1), slotId: 1, slotStart: 540, slotEnd: 660, acceptedAt: null, onTheWayAt: null, courier: null, canCancel: true, paidAt: iso(80), receiptNo: "TF-261121-00042" }),
  order({ id: "o3", number: 1031, status: "completed", completedAt: iso(60 * 26), rating: null, pickupDate: addDays(today, -1) }),
];

const courierOrders = {
  new: [
    order({ id: "c1", number: 1051, status: "open", address: "Shota Rustaveli ko'chasi, 12", lat: 41.29, lng: 69.27, notes: null, customer: null, courier: null, priceTotal: 65000, trashTypeId: 2, quantity: 3 }),
    order({ id: "c2", number: 1052, status: "open", paymentMethod: "click", paymentStatus: "paid", address: "Bobur ko'chasi, 4", lat: 41.302, lng: 69.258, notes: null, customer: null, courier: null, priceTotal: 15000, quantity: 1 }),
  ],
  mine: [
    order({ id: "c3", number: 1046, status: "accepted", courier: { id: 1, name: "Siz", phone: null }, address: "Yunusobod 4-mavze, 17-uy", lat: 41.36, lng: 69.29 }),
    order({ id: "c4", number: 1047, status: "on_the_way", paymentMethod: "subscription", paymentStatus: "subscription", priceTotal: 0, courier: { id: 1, name: "Siz", phone: null }, address: "Chilonzor 9-kvartal, 3", lat: 41.28, lng: 69.21 }),
  ],
  done: [order({ id: "c5", number: 1040, status: "completed", completedAt: iso(120), cashCollected: 35000, courier: { id: 1, name: "Siz", phone: null } })],
};

const me = (role: string) => ({
  id: 1,
  name: role === "admin" ? "Sardor Admin" : role === "courier" ? "Jasur Karimov" : "Dilnoza Rahimova",
  phone: "+998901234501",
  role: role === "admin" ? "owner" : role,
  language: new URLSearchParams(location.search).get("lang") ?? "uz",
  nameConfirmed: true,
  introSeen: new URLSearchParams(location.search).has("intro") ? [] : ["customer", "courier", "admin"],
  mutedCategories: [],
  cityIds: role === "customer" ? [] : [1],
  services: role === "customer" ? [] : ["trash", "carpet", "curtain"],
  deletionRequested: false,
  botReachable: true,
});

const subscription = { id: 5, status: "active", plan: { id: 2, code: "business", nameUz: "Business", nameRu: "Бизнес", nameEn: "Business", pickups: 8 }, periodStart: iso(60 * 24 * 10), periodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(), pickupsTotal: 8, pickupsUsed: 3, left: 5 };

const dashboard = {
  fromDate: addDays(today, -6),
  toDate: today,
  orders: { total: 214, completed: 168, pending: 31, awaitingPayment: 3, cancelled: 12 },
  revenue: { cash: 2_450_000, click: 1_310_000, payme: 1_985_000, card: 640_000 },
  revenueTotal: 6_385_000,
  cashNotHandedOver: 104_000,
  cashNotHandedOverOrders: 2,
  byType: [{ trashTypeId: 1, count: 141 }, { trashTypeId: 2, count: 52 }, { trashTypeId: 3, count: 21 }],
  byCity: [{ cityId: 1, count: 176 }, { cityId: 2, count: 38 }],
  couriers: [
    { courierId: 7, name: "Jasur Karimov", pickups: 64, avgMinutes: 142, avgRating: 4.8 },
    { courierId: 8, name: "Bekzod Aliyev", pickups: 51, avgMinutes: 175, avgRating: 4.6 },
    { courierId: 9, name: "Otabek Nazarov", pickups: 38, avgMinutes: 128, avgRating: 4.9 },
  ],
  perDay: Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i - 6), count: [26, 31, 28, 35, 24, 39, 31][i] })),
};

const washOrder = (over: Record<string, unknown> = {}) => ({
  kind: "wash",
  id: "w1",
  number: 12,
  displayNumber: "G-12",
  service: "carpet",
  status: "quote_sent",
  statusAt: iso(20),
  cityId: 1,
  address: "Amir Temur ko'chasi, 15",
  lat: 41.3145,
  lng: 69.2815,
  notes: "2-podyezd, 4-qavat",
  pickupDate: today,
  slotStart: 780,
  slotEnd: 900,
  quoteVersion: 1,
  onHold: false,
  needsApproval: false,
  paymentMethod: "cash",
  paymentStatus: "cod_pending",
  createdAt: iso(120),
  cancelReason: null,
  photos: [],
  customer: null,
  courier: { id: 7, name: "Jasur Karimov", phone: "+998901110001" },
  washer: null,
  timeline: [{ to: "created", at: iso(120) }, { to: "courier_assigned", at: iso(90) }, { to: "measured", at: iso(25) }, { to: "quote_sent", at: iso(25) }],
  items: [
    { id: 1, position: 1, label: "G-12-1", type: "carpet", lengthCm: 400, widthCm: 250, areaTenths: 100, washerLengthCm: null, washerWidthCm: null, washerAreaTenths: null },
    { id: 2, position: 2, label: "G-12-2", type: "carpet", lengthCm: 200, widthCm: 150, areaTenths: 30, washerLengthCm: null, washerWidthCm: null, washerAreaTenths: null },
  ],
  money: { lines: [{ lengthCm: 400, widthCm: 250, areaTenths: 100, amount: 120000 }, { lengthCm: 200, widthCm: 150, areaTenths: 30, amount: 36000 }], subtotal: 156000, minimumApplied: false, deliveryFee: 10000, total: 166000, quoteStatus: "sent" },
  ...over,
});

function route(role: string, method: string, path: string): unknown {
  const p = path.split("?")[0];
  if (p === "/bootstrap") {
    const sp = new URLSearchParams(location.search).get("sp");
    return { me: me(role), startParam: sp, catalog, settings: { maxQuantity: 20, maxPhotos: 3, bookingDaysAhead: 7, slotCutoffMinutes: 60, paymentTimeoutMinutes: 30, methods: { subscription: true, cash: true, click: true, payme: true, card: true }, prioritySlotsForSubscribers: false, supportPhone: "" }, subscription: new URLSearchParams(location.search).has("nosub") ? null : subscription, unread: 2, services: [{ code: "trash", visibility: "open", message: null }, { code: "carpet", visibility: "open", message: null }, { code: "curtain", visibility: new URLSearchParams(location.search).has("curtainoff") ? "unavailable" : "open", message: "Bu hafta parda yuvish ishlamaydi" }], bot: { username: "trashfree_bot", app: "app" } };
  }
  if (p === "/me") return me(role);
  if (p === "/orders" && method === "GET") {
    const f = new URLSearchParams(path.split("?")[1]).get("filter");
    return f === "done" ? [orders[2]] : f === "cancelled" ? [] : orders.slice(0, 2);
  }
  if (p === "/orders/last") return { ...orders[2], trashTypeCode: "household", packageSizeCode: "medium" };
  if (p.startsWith("/orders/")) return orders.find((o) => o.id === p.split("/")[2]) ?? Object.values(courierOrders).flat().find((o) => o.id === p.split("/")[2]) ?? orders[0];
  if (p === "/addresses") return [{ id: 1, label: "Uy", address: "Amir Temur ko'chasi, 15", lat: 41.3145, lng: 69.2815, notes: "2-podyezd, 4-qavat" }, { id: 2, label: "Ofis", address: "Mustaqillik shoh ko'chasi, 59", lat: 41.3168, lng: 69.2491, notes: null }];
  if (p === "/slots") {
    return { slots: catalog.slots.map((s, i) => ({ slotId: s.id, available: i > 1 && i !== 3, reason: i <= 1 ? "past" : i === 3 ? "full" : null, left: i === 4 ? 2 : null })) };
  }
  if (p === "/geocode/reverse") return { address: "Amir Temur ko'chasi, 15, Yunusobod, Toshkent" };
  if (p === "/subscriptions") return { active: new URLSearchParams(location.search).has("nosub") ? null : subscription, upcoming: null, plans: catalog.plans };
  if (p === "/notifications") {
    return [
      { id: 3, type: "order_on_the_way", payload: { n: 1042, screen: "order", id: "o1" }, readAt: null, createdAt: iso(10) },
      { id: 2, type: "order_accepted", payload: { n: 1042, screen: "order", id: "o1" }, readAt: null, createdAt: iso(60) },
      { id: 1, type: "payment_paid", payload: { total: "25 000 so'm", screen: "order", id: "o2" }, readAt: iso(70), createdAt: iso(80) },
    ];
  }
  if (p === "/payments") return [{ id: "p1", amount: 25000, method: "payme", provider: "telegram_payme", status: "paid", receiptNo: "TF-261121-00042", paidAt: iso(80), createdAt: iso(81), orderId: "o2", orderNumber: 1043, subscriptionId: null, planName: null }];
  if (p === "/receipt") return { receiptNo: "TF-261121-00042", paidAt: iso(80), method: "payme", provider: "telegram_payme", total: 25000, orderNumber: 1043, items: [{ title: "Nomaishiy chiqindini olib ketish (O'rta × 1)", count: 1, price: 25000, ikpu: "10305008002000000" }] };
  if (p === "/courier/orders") return courierOrders[new URLSearchParams(path.split("?")[1]).get("tab") as "new"] ?? [];
  if (p === "/courier/counts") return { new: 2, mine: 2 };
  if (p === "/courier/today") return { doneToday: 6, cashToday: 145000, onlineToday: 90000, onlineCount: 3, cashToHandOver: 145000, cashOrders: 4 };
  if (p === "/admin/dashboard") return { ...dashboard, washerPayouts: 1_040_000, courierPay: 195_000, margin: 5_150_000, cashByCourier: [{ courier: { id: 7, name: "Jasur Karimov" }, amount: 145000, orders: 4 }, { courier: { id: 8, name: "Bekzod Aliyev" }, amount: 79000, orders: 1 }], byService: [{ service: "trash", count: 214 }, { service: "carpet", count: 23 }, { service: "curtain", count: 9 }], measurement: [{ courierId: 8, name: "Bekzod Aliyev", orders: 6, avgDiffPct: 6.2 }, { courierId: 7, name: "Jasur Karimov", orders: 11, avgDiffPct: 1.8 }] };
  if (p === "/wash/info") return { pricePerM2: 12000, minOrder: 60000, deliveryFee: 10000, freeDeliveryFrom: 180000, maxItems: 10 };
  if (p === "/wash/slots") return { slots: catalog.slots.map((x, i) => ({ slotId: x.id, available: i > 1, reason: i <= 1 ? "past" : null, left: null })) };
  if (p === "/wash/orders" && method === "GET") return new URLSearchParams(path.split("?")[1]).get("filter") === "active" ? [washOrder()] : [];
  if (p.startsWith("/wash/orders/")) {
    if (role === "courier") return washOrder({ status: "courier_assigned", money: null, customer: { id: 3, name: "Dilnoza Rahimova", phone: "+998901234501" }, items: [] });
    if (role === "washer") return washOrder({ status: "at_washer", address: null, lat: null, lng: null, money: { washerPayout: 104000 }, items: washOrder().items.map((i) => ({ ...i, lengthCm: null, widthCm: null, areaTenths: null })) });
    return washOrder();
  }
  if (p === "/wash/courier") return new URLSearchParams(path.split("?")[1]).get("tab") === "new" ? [washOrder({ status: "created", items: [], money: null, displayNumber: "P-13", service: "curtain" })] : [];
  if (p === "/wash/washer") return [washOrder({ status: "at_washer", address: null, money: null })];
  if (p === "/wash/washers") return [{ id: 20, name: "Toza Gilam MChJ" }];
  if (p.startsWith("/admin/wash-settings/")) { const r = { id: 3, pricePerM2: 12000, washerSharePerM2: 8000, minOrder: 60000, maxOrder: 1500000, maxItems: 10, deliveryFee: 10000, freeDeliveryFrom: 180000, tolerancePct: 5, courierPay: 15000, createdAt: iso(60 * 24), createdById: 1 }; return { current: r, history: [r, { ...r, id: 1, pricePerM2: 10000, createdAt: iso(60 * 24 * 10) }] }; }
  if (p === "/admin/wash-orders") return [washOrder(), washOrder({ id: "w2", displayNumber: "G-11", number: 11, status: "at_washer", onHold: true })];
  if (p === "/admin/orders") return { items: [...orders, ...courierOrders.new].map((o) => ({ ...o, refundNote: null, cashHandoverId: null })), next: null };
  if (p.startsWith("/admin/orders/")) return { ...orders[0], refundNote: null, cashHandoverId: null, audits: [] };
  if (p === "/admin/people") return [{ id: 3, name: "Dilnoza Rahimova", username: "dilnoza", phone: "+998901234501", role: "customer", blocked: false, cityIds: [], orders: 12, deletionRequested: false }, { id: 7, name: "Jasur Karimov", username: null, phone: "+998901110001", role: "courier", blocked: false, cityIds: [1], orders: 0, deletionRequested: false }, { id: 9, name: "Aziz Tursunov", username: "aziz", phone: "+998901234502", role: "customer", blocked: true, cityIds: [], orders: 3, deletionRequested: false }];
  if (p === "/admin/people/deletion-requests") return [];
  if (p.startsWith("/admin/people/")) return { id: 3, name: "Dilnoza Rahimova", username: "dilnoza", phone: "+998901234501", role: "customer", language: "uz", blocked: false, blockedReason: null, botBlocked: false, cityIds: [], deletionRequested: false, createdAt: iso(60 * 24 * 40), orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, priceTotal: o.priceTotal, createdAt: o.createdAt })), subscriptions: [], completedAsCourier: 0 };
  if (p === "/admin/catalog") return catalog;
  if (p === "/admin/cash") return { outstanding: [{ courier: { id: 7, name: "Jasur Karimov", phone: "+998901110001" }, amount: 25000, orders: 1 }, { courier: { id: 8, name: "Bekzod Aliyev", phone: "+998901110002" }, amount: 79000, orders: 1 }], history: [] };
  if (p === "/admin/broadcasts") return [{ id: 1, title: "Bayram chegirmasi", audience: "customers", status: "done", total: 820, sent: 801, failed: 4, blocked: 15, createdAt: iso(60 * 30) }];
  if (p === "/admin/broadcasts/count") return { count: 820 };
  if (p === "/admin/audit") return { items: [{ id: 1, actorName: "Sardor Admin", action: "catalog.prices.update", entity: "priceRule", entityId: null, before: null, after: null, reason: null, createdAt: iso(30) }], next: null };
  if (p === "/admin/couriers") return [{ id: 7, name: "Jasur Karimov" }, { id: 8, name: "Bekzod Aliyev" }];
  if (p === "/admin/services") return [{ code: "trash", enabled: true, showWhenOff: false, offMessage: null, offUntil: null }, { code: "carpet", enabled: true, showWhenOff: false, offMessage: null, offUntil: null }, { code: "curtain", enabled: false, showWhenOff: true, offMessage: "Bu hafta parda yuvish ishlamaydi", offUntil: new Date(Date.now() + 3 * 86_400_000).toISOString() }];
  if (p === "/admin/settings") return { orderLimitPerHour: 5, maxQuantity: 20, maxPhotos: 3, slotCutoffMinutes: 60, bookingDaysAhead: 7, paymentTimeoutMinutes: 30, methods: { subscription: true, cash: true, click: true, payme: true, card: true }, cardProvider: "payme", paymentMode: { click: "telegram", payme: "telegram" }, telegramFiscalData: true, paymeTestMode: true, ipAllowlistEnabled: false, ipAllowlist: { payme: [], click: [] }, retention: { photosDays: 90, supportDays: 90, archiveMonths: 12 }, subscriptionReminderDays: 3, prioritySlotsForSubscribers: false, supportPhone: "" };
  if (method !== "GET") return { ok: true, unread: 0 };
  throw new ApiError("not_found", 404);
}

export async function installMock(role: string) {
  setInitData("mock");
  setTransport(async (method, path) => {
    await new Promise((r) => setTimeout(r, 120));
    return route(role, method, path);
  });
  if (new URLSearchParams(location.search).has("draft")) {
    localStorage.setItem(
      "order_draft",
      JSON.stringify({ v: 1, lat: 41.3145, lng: 69.2815, address: "Amir Temur ko'chasi, 15", notes: "2-podyezd", addressId: 1, saveLabel: null, trashType: "household", packageSize: "medium", quantity: 3, date: today, slotId: 3, method: "cash", photoIds: [], idem: "mock-key-123" }),
    );
  }
}
