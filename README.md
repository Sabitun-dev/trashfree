# Trashfree — Telegram Mini App for trash pickup

Customers order a pickup in 4 steps, couriers take orders on a map, admins see everything.
It all runs inside Telegram: a bot + a Mini App. Hosting is Netlify, the database is Neon (PostgreSQL).

- **Customer:** order with map pin, photo, type, quantity, time slot; pay with cash, Click, Payme, card or subscription; live status; rating; receipts.
- **Courier:** "Yangi / Meniki / Bajarilgan" tabs, map + route, "Olaman / Yo'ldaman / Bajarildi", batch completion, today's cash, sunlight mode.
- **Admin:** dashboard, orders (filters, reassign, cancel, CSV), people (roles, invites, blocking, data deletion), catalog (prices, slots, cities, trash types with IKPU, plans), broadcasts, cash handovers, audit log, settings.

---

## 1. One-time setup (about 30 minutes)

You need: a Telegram account, a GitHub account, a Netlify account, a Neon account.

### 1.1 Create the bot (BotFather)
1. Open **@BotFather** in Telegram → `/newbot` → choose a name and a username (e.g. `trashfree_bot`).
   BotFather gives you a **token** like `123456:ABC…`. This is `BOT_TOKEN`. Keep it secret.
2. `/newapp` → choose your bot → title "Trashfree", short description, a 640×360 picture →
   **Web App URL:** `https://<your-site>.netlify.app/app/` → **short name:** `app`
   (that becomes `MINIAPP_SHORT_NAME`). The Mini App link is then `https://t.me/<bot>/app`.
3. `/setprivacy` is **not needed**: in the support group the bot is an admin, and admins see all messages.
4. Payments (optional now, see section 3): `/mybots` → your bot → **Payments** → choose **Click** and/or **Payme** →
   connect a **test** account first. BotFather gives a **provider token** for each.

### 1.2 Create the database (Neon)
1. In Neon create a project (region: Frankfurt is closest to Uzbekistan).
2. On the dashboard click **Connect**. Copy two strings:
   - **Pooled** connection (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** connection (turn "Connection pooling" off) → `DATABASE_URL_UNPOOLED`
3. **Branches → Create branch** named `dev`. Copy its pooled/direct strings too — they are for test deploys (deploy previews),
   so experiments never touch real customer data.

### 1.3 GitHub + Netlify
1. Push this folder to a new GitHub repository (private).
2. In Netlify: **Add new site → Import from GitHub** → pick the repo. Build settings come from `netlify.toml` automatically.
3. **Site configuration → Environment variables** — add these (scope: all; for `DATABASE_URL*` use the
   *Production* value from Neon `main` and the *Deploy previews* value from Neon `dev`):

| Variable | What it is |
|---|---|
| `BOT_TOKEN` | from BotFather |
| `BOT_USERNAME` | your bot username without @ (optional, saves a request) |
| `WEBHOOK_SECRET` | any long random text (letters, digits, `_` and `-`) |
| `SETUP_SECRET` | another long random text — the password of the setup page |
| `OWNER_TELEGRAM_IDS` | your Telegram user id (ask **@userinfobot**); several ids separated by commas |
| `MINIAPP_SHORT_NAME` | `app` (what you typed in `/newapp`) |
| `DATABASE_URL` | Neon pooled string |
| `DATABASE_URL_UNPOOLED` | Neon direct string |
| `ADMIN_SUPPORT_CHAT_ID` | support forum group id (section 2), optional |
| `COURIER_GROUP_CHAT_ID` | courier group id (section 2), optional |
| `TG_PROVIDER_TOKEN_CLICK` / `TG_PROVIDER_TOKEN_PAYME` | from BotFather → Payments |
| `PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_TEST_KEY` | only for the direct Payme API |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, `CLICK_MERCHANT_USER_ID` | only for the direct Click API |

Secrets live **only** in Netlify. They are never in the code, in git or in the app.

4. **Deploys → Trigger deploy.** The production build automatically applies database migrations
   (only on production — previews never change the database structure).

### 1.4 Fill the catalog (seed)
On your computer, in this folder:
```
copy .env.example .env      (then paste DATABASE_URL and DATABASE_URL_UNPOOLED into .env)
npm install
npm run db:seed                       # catalog + demo couriers/customers/orders
npm run db:seed -- --catalog-only     # or: only cities, types, prices, slots, plans
```
The seed refuses to run on a database that already has data, so it can never overwrite real orders.
Demo people have fake Telegram ids; real people appear automatically when they open the app.

### 1.5 Open the setup page
Go to `https://<your-site>.netlify.app/setup?key=<SETUP_SECRET>`.
It sets the webhook, the bot commands (uz/ru/en) and the **"Ochish"** menu button, and checks everything with ✅ / ❌.
Opening it again is always safe. Fix any ❌ and reload.

Then open your bot in Telegram → **Ochish**. Because your id is in `OWNER_TELEGRAM_IDS`, you are the owner.

---

## 2. Groups

### Support (one topic per customer)
1. Create a Telegram group "Trashfree Support" → **Settings → Topics: ON** (it becomes a forum).
2. Add your bot → make it **admin** with **Manage topics** (and "Pin messages").
3. Get the group id: forward any message from the group to **@userinfobot** (or add **@RawDataBot** for a moment). It looks like `-100…`. Put it in `ADMIN_SUPPORT_CHAT_ID`, redeploy, reload the setup page.

How it works: anything a customer writes to the bot appears in their own topic (title: name · phone · last order) with a pinned card of recent orders and an "Admin" button. **Reply inside the topic** and the customer gets your message from the bot. Start a message with `//` to leave an internal note the customer won't see.

### Couriers (optional)
Create a group with your couriers, add the bot, put its id into `COURIER_GROUP_CHAT_ID`. New orders are posted there with an "Ochish" button; when someone takes an order, the post changes to "Olindi ✅".

---

## 3. Payments

Online orders are created as **"To'lov kutilmoqda"** and reach couriers **only after a verified confirmation** from the provider. If they're not paid within 30 minutes (a setting), they become "To'lov o'tmadi" and the customer sees **Qayta urinish / Boshqa usul**.

### 3.1 Preferred: Telegram Payments (card entered in Telegram's own sheet)
1. BotFather → Payments → **Click** / **Payme** → connect (test first) → copy the tokens into `TG_PROVIDER_TOKEN_CLICK` / `TG_PROVIDER_TOKEN_PAYME`.
2. In the app: **Admin → Ko'proq → Sozlamalar → To'lov rejimi** = "Telegram ichida" (the default).
3. Test with the provider's test card in Telegram's payment sheet.

### 3.2 Fallback: direct merchant APIs (if a provider isn't available in BotFather)
Switch the provider to **"To'g'ridan-to'g'ri API"** in Settings.

**Payme Merchant API**
- In the Payme business cabinet set the endpoint to `https://<site>/payments/payme`, the account field `order_id`.
- Put `PAYME_MERCHANT_ID`, `PAYME_TEST_KEY` (sandbox) and later `PAYME_KEY` (production) into Netlify.
- Keep "Payme sandbox (test)" ON in Settings while testing; run Payme's sandbox test at **test.paycom.uz** — all scenarios (auth, wrong amount, unknown order, create/perform/cancel, 12-hour timeout, statement) are implemented and unit-tested.
- Turn "Payme sandbox" OFF when Payme approves production.

**Click SHOP API**
- In the Click merchant cabinet: Prepare URL `https://<site>/payments/click/prepare`, Complete URL `https://<site>/payments/click/complete`.
- Put `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, `CLICK_MERCHANT_USER_ID` into Netlify.

**IP allow-list** (optional): Settings → IP allow-list → paste the IP ranges your provider gives you.

### 3.3 Fiscal receipts (IKPU)
**Admin → Katalog → Chiqindi turlari** → for each type fill **IKPU (MXIK) kodi** and **Qadoq kodi** (from tasnif.soliq.uz).
They are sent with every payment (Payme `detail.items`, Telegram invoice `provider_data`). Confirm the exact Telegram
`provider_data` format with your provider; if they need it differently, switch that provider to the direct API.

### 3.4 Receipts and refunds
After payment the customer gets a receipt in the app and from the bot; **Profil → To'lovlar tarixi** lists all payments.
Refunds are not automatic: when a paid order is cancelled, it shows up in Admin → Orders; do the refund in the provider's
cabinet and press **"Qaytarish qo'lda bajarildi"** with a note (audit-logged).

---

## 4. Testing with three phones (customer, courier, admin)

Phone **A** = admin (your account, in `OWNER_TELEGRAM_IDS`), **B** = courier, **C** = customer.

| # | Who | Do this | Expect |
|---|---|---|---|
| 1 | A | Open bot → Ochish → intro → Panel | Dashboard opens |
| 2 | A | Odamlar → **Kuryer taklifi** → pick Toshkent → Havola yaratish → send link to B | Link `t.me/<bot>/app?startapp=inv_…` |
| 3 | B | Open the link → **Qabul qilish** | "Endi siz kuryersiz 🚚", courier tabs |
| 4 | C | Open bot → Ochish → **Chiqindini olib ketish** | Phone request → 1 tap → name → 1 tap |
| 5 | C | Step 1: drag map, address fills in; step 2: Maishiy · O'rta · 3 + photo | Price shows `1-qop 15 000 + 2 × 10 000 = 35 000` |
| 6 | C | Step 3: Bugun, a free slot; step 4: **Naqd** → Buyurtma berish | Order "Qabul qilindi", bot message to C |
| 7 | B | Bot says "Yangi buyurtma"; open → **Olaman** | C gets "Kuryer buyurtmangizni oldi" |
| 8 | A+B | A also accepts the same order from courier mode at the same time | Only one wins; the other sees "Boshqa kuryer oldi" |
| 9 | B | **Yo'ldaman** | C: "Kuryer yo'lda 🚚", tracker moves |
| 10 | B | **Bajarildi** → photo → tick "Naqd olindi: 35 000 so'm" | C: "Rahmat! Hammasi toza ✨" with photo + "Baholash"; B's **Bugun** shows 35 000 to hand over |
| 11 | C | Open order → 5 stars | Rating saved; admin dashboard shows it |
| 12 | C | Make 3 more cash orders; B takes all 3 → Meniki → **Tanlash** → select 3 → Hammasini bajarildi | One confirmation with the total cash; Bugun increases by that total |
| 13 | A | Ko'proq → Naqd topshirish → **Naqd topshirildi** | Courier's cash goes to 0, audit log entry |
| 14 | C | New order with **Payme/Click** (test) → pay in the sheet | Order "Qabul qilindi" + "To'langan", receipt in app and bot |
| 15 | C | New online order → close the payment sheet → wait 30 min | Never visible to B; becomes "To'lov o'tmadi" with Qayta urinish / Boshqa usul |
| 16 | C | Obuna → Business → pay (test) | Badge "Business · 8 ta qoldi"; pay an order with **Obuna** → 7 left; cancel it → 8 again |
| 17 | A | Ko'proq → Xabar yuborish → audience "Kuryerlarga" → preview → send | Only B receives it; report shows sent / failed / blocked |
| 18 | C | Profil → Til → Русский / English | Every screen switches at once |
| 19 | C | Write "salom" to the bot | A new topic appears in the support group; A replies there → C receives it |
| 20 | C | Profil → Ma'lumotlarimni o'chirish; A confirms in Odamlar | C's name/phone/addresses/photos removed, totals stay |

Seed check (on a fresh seeded database, "Bugun"): **10 orders · 3 completed · 6 pending · 1 cancelled**; cash not handed over **104 000 so'm** (Jasur 25 000 + Bekzod 79 000).

---

## 5. Changes I made to the spec (and why)

1. **Payment status `pending`** was added for online orders that aren't paid yet — the fixed list had no value for "not paid yet, not failed".
2. **Tracker:** 4 steps for cash/subscription orders; online orders get a 5th "To'lov" step first.
3. **"Karta"** goes through the provider chosen in Settings (default Payme), so customers never meet two different card screens.
4. **Broadcasts** are sent by a Netlify *background function* (up to 15 minutes) and resumed by the scheduler — a normal function stops after seconds.
5. **Rate limits and the Nominatim 1-request-per-second rule** are counted in the database (serverless copies don't share memory).
6. **"First courier wins"** uses one conditional `UPDATE … WHERE status='open'`. Postgres locks the row, so the second courier's update changes nothing — the same guarantee as `SELECT … FOR UPDATE`, in one step.
7. **Photos:** the phone compresses and re-encodes to JPEG (≤1600 px, ~1 MB), which removes EXIF/GPS. The server checks the real file type from the bytes and strips any remaining metadata (EXIF, XMP, comments) without a native image library, so deploys stay simple.
8. **Map pin:** the pin stays in the middle and you move the map under it — easier with one thumb than dragging a small pin.
9. **"Yandex Navigator"** opens Yandex Maps' universal link (Telegram can only open web links; Yandex then offers the app). "Telegram joylashuv" makes the bot send the pickup point as a location message.
10. **Archive** = an `archivedAt` mark, not a move to another table.
11. **Subscriptions:** a renewal paid early starts when the current month ends, so no pickups are lost.

---

## 6. Not built yet / ideas for later

Out of scope for v1 (as agreed): refunds through the provider API, saved cards, auto-recurring subscriptions, live courier GPS tracking, courier payouts, a separate courier app.

Not yet done / to verify with real accounts:
- Real-device test inside Telegram (my review used a browser preview with demo data; Telegram's own buttons replace the preview buttons).
- The exact Telegram Payments `provider_data` format for fiscal receipts must be confirmed with Click/Payme.
- Address *search* box (the API exists: `/api/geocode/search`; the wizard currently uses the map pin + editable address).
- Admin courier-performance details per day, CSV of payments (orders CSV exists).
- Push of "rate your pickup" is part of the completion message; a separate delayed reminder is not sent.

Ideas: promo codes, referral bonus, courier ratings visible to customers, recurring weekly pickups, Uzbek Cyrillic.

---

## 7. For developers

```
npm install
npm run check          # typecheck + tests + build (must be green before every commit)
npm test               # unit tests (vitest)
npm run dev:web        # app preview at http://localhost:5173/app/?mock=customer  (mock=courier|admin, lang=ru|en)
npm run screenshots    # with dev:web running: screenshots of every main screen, light/dark, 360/414 px
sh scripts/commit.sh -m "message"   # commit only if the full check passes
```

Structure:
```
webapp/                 React app (Vite + Tailwind) → built into public/app/
  src/ui/               UI kit (Button, Tile, Chip, Card, BottomSheet, Stepper, StatusTracker, Toast, Badge, EmptyState…)
  src/screens/          customer / courier / admin / common
  src/i18n/             uz (source), ru, en
  src/mock/             demo data for previews (dev only)
src/domain/             pure rules shared by app and server: price, slots, geo, status machine, permissions, subscriptions
src/server/             business logic (platform-neutral): auth, orders, courier, payments, notify, admin, support, scheduler
netlify/functions/      thin entry points: api, telegram (webhook), payments, scheduler, broadcast-background, setup
prisma/                 schema, migrations, seed
tests/                  unit tests
```

**Moving to a VPS later:** `src/server/api/app.ts` is a plain Hono app. Write one small `server.ts` with `@hono/node-server`
that serves `/api/*` from `buildApi()`, `/telegram/webhook` → `handleWebhookUpdate`, `/payments/*` → the same handlers as
`netlify/functions/payments.mts`, a cron calling `runScheduler()` every 15 minutes, and replace Netlify Blobs in `src/server/photos.ts`
with S3 or the local disk.

**Neon dev branch for previews:** in Netlify, give `DATABASE_URL`/`DATABASE_URL_UNPOOLED` a *Deploy previews* value from the Neon `dev`
branch. To create its tables once: put the dev strings in `.env` and run `npx prisma migrate deploy`.
