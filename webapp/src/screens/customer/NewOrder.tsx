// New order: a 4-step wizard. One question per screen; the MainButton is always "Next".
import { useEffect, useMemo, useRef, useState } from "react";
import { findServiceCity } from "@domain/geo";
import { calcPrice } from "@domain/price";
import { addDays, formatSlot, tashkentDate } from "@domain/time";
import type { SlotAvailability } from "@domain/slots";
import type { PaymentMethod } from "@domain/types";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { clearDraft, takeRestored, updateDraft, useDraft, type Draft } from "../../lib/draft";
import { friendlyDate } from "../../lib/format";
import { runPayment } from "../../lib/pay";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { getLocation, requestWriteAccess } from "../../lib/tg";
import type { AddressDTO, CreateOrderResult } from "../../lib/types";
import { MapPicker } from "../../components/Maps";
import { PhotoPicker } from "../../components/Photos";
import { BagPicture, TrashPicture } from "../../components/Pictures";
import { Icon } from "../../ui/Icon";
import { Button, Card, Chip, cx, Field, inputCls, KeyValue, ProgressBar, Section, Skeleton, Stepper, Tile } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { RequirePhone } from "../common/PhoneFlow";

const TITLES = ["w_where", "w_what", "w_when", "w_pay"] as const;

export function NewOrder({ step = 1 }: { step?: number }) {
  return (
    <RequirePhone>
      <Wizard step={step} />
    </RequirePhone>
  );
}

function Wizard({ step }: { step: number }) {
  const t = useT();
  const toast = useToast();
  const { draft, ready } = useDraft();
  useEffect(() => {
    if (ready && step === 1 && takeRestored()) toast(t("draft_restored"), "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  if (!ready) return <Page><Skeleton className="h-[60vh]" /></Page>;
  return (
    <Page hasMainButton>
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-[14px] font-semibold text-hint">
          <span>{t("w_step", { n: step })}</span>
        </div>
        <ProgressBar value={step / 4} label={t("w_step", { n: step })} />
        <h1 className="mt-4 text-title font-bold tracking-tight">{t(TITLES[step - 1])}</h1>
      </div>
      {step === 1 && <StepWhere draft={draft} />}
      {step === 2 && <StepWhat draft={draft} />}
      {step === 3 && <StepWhen draft={draft} />}
      {step === 4 && <StepPay draft={draft} />}
    </Page>
  );
}

// ---------- 1. Where ----------
function StepWhere({ draft }: { draft: Draft }) {
  const t = useT();
  const nav = useNav();
  const { catalog } = useSession();
  const addresses = useQuery<AddressDTO[]>("addresses", () => api.get("/addresses"));
  const [fly, setFly] = useState<{ lat: number; lng: number; at: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const geoSeq = useRef(0);
  const city0 = catalog.cities[0];
  const initial = useRef(draft.lat && draft.lng ? { lat: draft.lat, lng: draft.lng } : city0 ? { lat: city0.centerLat, lng: city0.centerLng } : { lat: 41.3111, lng: 69.2797 });

  // First visit: jump to my location (or the last saved address).
  useEffect(() => {
    if (draft.lat) return;
    const saved = addresses.data?.[0];
    if (saved) {
      pickSaved(saved);
      return;
    }
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.data]);

  async function reverse(lat: number, lng: number) {
    const seq = ++geoSeq.current;
    setGeoBusy(true);
    try {
      const r = await api.post<{ address: string | null }>("/geocode/reverse", { lat, lng });
      if (seq === geoSeq.current && r.address) updateDraft({ address: r.address });
    } catch {
      /* the address stays editable */
    } finally {
      if (seq === geoSeq.current) setGeoBusy(false);
    }
  }

  function onMove(p: { lat: number; lng: number }) {
    if (draft.lat === p.lat && draft.lng === p.lng) return;
    const fromSaved = draft.addressId != null && Math.abs((draft.lat ?? 0) - p.lat) < 1e-5;
    updateDraft({ lat: p.lat, lng: p.lng, ...(fromSaved ? {} : { addressId: null }) });
    if (!fromSaved) void reverse(p.lat, p.lng);
  }

  async function locate() {
    setLocating(true);
    const p = await getLocation();
    setLocating(false);
    if (p) setFly({ ...p, at: Date.now() });
  }

  function pickSaved(a: AddressDTO) {
    updateDraft({ lat: a.lat, lng: a.lng, address: a.address, notes: a.notes ?? "", addressId: a.id, saveLabel: null });
    setFly({ lat: a.lat, lng: a.lng, at: Date.now() });
  }

  const area = draft.lat != null && draft.lng != null ? findServiceCity(catalog.cities, draft.lat, draft.lng) : null;
  const outside = area && !area.ok;
  const canNext = !!area?.ok && draft.address.trim().length > 0;
  const savedLabels = new Set((addresses.data ?? []).map((a) => a.label));

  return (
    <>
      {!!addresses.data?.length && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {addresses.data.map((a) => (
            <Chip key={a.id} selected={draft.addressId === a.id} onClick={() => pickSaved(a)}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name={a.label === t("label_office") ? "building" : "home"} size={18} />
                {a.label}
              </span>
            </Chip>
          ))}
          <Chip selected={draft.addressId == null} onClick={() => updateDraft({ addressId: null })}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" size={18} /> {t("new_address")}
            </span>
          </Chip>
        </div>
      )}

      <div className="relative">
        <MapPicker center={initial.current} onMove={onMove} flyTo={fly} />
        <button
          onClick={locate}
          className="card-hc absolute bottom-3 right-3 z-[600] flex min-h-tap items-center gap-2 rounded-full bg-card px-4 text-[15px] font-semibold text-accent-ink shadow-lg active:scale-95"
        >
          {locating ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Icon name="locate" size={20} />}
          {t("my_location")}
        </button>
        <p className="pointer-events-none absolute left-3 top-3 z-[600] rounded-full bg-card/90 px-3 py-1 text-[13px] font-medium text-hint shadow">{t("drag_pin")}</p>
      </div>

      {outside ? (
        <Card className="mt-3 border-2 border-warn/40 bg-warn-soft">
          <p className="flex items-center gap-2 font-semibold text-warn">
            <Icon name="alert" size={20} /> {area.reason === "outside_uzbekistan" ? t("err_outside_uzbekistan") : t("no_service_title")}
          </p>
          <p className="mt-2 text-[15px]">{t("no_service_cities")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalog.cities.map((c) => (
              <Chip key={c.id} onClick={() => setFly({ lat: c.centerLat, lng: c.centerLng, at: Date.now() })}>
                {t.name(c)}
              </Chip>
            ))}
          </div>
        </Card>
      ) : (
        <div className="mt-4 space-y-3">
          <Field label={t("address")}>
            <div className="relative">
              <input
                className={inputCls + " pr-10"}
                value={draft.address}
                placeholder={geoBusy ? t("address_loading") : t("address_ph")}
                maxLength={300}
                onChange={(e) => updateDraft({ address: e.target.value })}
              />
              {geoBusy && <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-hint border-r-transparent" />}
            </div>
          </Field>
          <Field label={t("notes")}>
            <input className={inputCls} value={draft.notes} placeholder={t("notes_ph")} maxLength={300} onChange={(e) => updateDraft({ notes: e.target.value })} />
          </Field>
          {draft.addressId == null && (
            <div>
              <p className="mb-1.5 px-1 text-[15px] font-medium text-hint">{t("save_address_as")}</p>
              <div className="flex gap-2">
                {[t("label_home"), t("label_office")]
                  .filter((l) => !savedLabels.has(l))
                  .map((l) => (
                    <Chip key={l} selected={draft.saveLabel === l} onClick={() => updateDraft({ saveLabel: draft.saveLabel === l ? null : l })}>
                      {l}
                    </Chip>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      <MainButton text={t("next")} disabled={!canNext} onClick={() => nav.push("new_order", { step: 2 })} />
    </>
  );
}

// ---------- 2. What ----------
function StepWhat({ draft }: { draft: Draft }) {
  const t = useT();
  const nav = useNav();
  const { catalog, settings } = useSession();
  const type = catalog.trashTypes.find((x) => x.code === draft.trashType);
  const size = catalog.packageSizes.find((x) => x.code === draft.packageSize);
  const rule = type && size ? catalog.prices.find((p) => p.trashTypeId === type.id && p.packageSizeId === size.id) : undefined;
  const price = useMemo(() => {
    try {
      return rule ? calcPrice(rule, draft.quantity, settings.maxQuantity) : null;
    } catch {
      return null;
    }
  }, [rule, draft.quantity, settings.maxQuantity]);

  return (
    <>
      <Section title={t("trash_type")} className="mt-0">
        <div className="grid grid-cols-3 gap-2">
          {catalog.trashTypes.map((x) => (
            <Tile key={x.id} selected={draft.trashType === x.code} onClick={() => updateDraft({ trashType: x.code })} picture={<TrashPicture code={x.icon || x.code} />} title={t.name(x)} />
          ))}
        </div>
      </Section>
      <Section title={t("pack_size")}>
        <div className="grid grid-cols-3 gap-2">
          {catalog.packageSizes.map((x) => {
            const r = type ? catalog.prices.find((p) => p.trashTypeId === type.id && p.packageSizeId === x.id) : undefined;
            return (
              <Tile
                key={x.id}
                selected={draft.packageSize === x.code}
                disabled={!!type && !r}
                onClick={() => updateDraft({ packageSize: x.code })}
                picture={<BagPicture code={x.code} />}
                title={t.name(x)}
                sub={r ? t.som(r.firstPrice) : `${x.liters} L`}
              />
            );
          })}
        </div>
      </Section>
      <Section title={t("quantity")}>
        <Stepper value={draft.quantity} max={settings.maxQuantity} onChange={(quantity) => updateDraft({ quantity })} label={t("quantity")} />
      </Section>
      <Section>
        <PhotoPicker ids={draft.photoIds} onChange={(photoIds) => updateDraft({ photoIds })} max={settings.maxPhotos} label={t("add_photo")} hint={t("add_photo_hint")} />
      </Section>
      {price && <PriceBreakdown price={price} />}
      <MainButton text={t("next")} disabled={!price} onClick={() => nav.push("new_order", { step: 3 })} />
    </>
  );
}

export function PriceBreakdown({ price }: { price: { firstPrice: number; extraCount: number; extraPrice: number; total: number } }) {
  const t = useT();
  return (
    <Card className="mt-5 bg-accent-soft">
      <p className="money text-[15px] text-accent-ink">
        {t("price_first")} {t.som(price.firstPrice).replace(` ${t("som")}`, "")}
        {price.extraCount > 0 && ` + ${price.extraCount} × ${t.som(price.extraPrice).replace(` ${t("som")}`, "")}`}
      </p>
      <p className="money mt-0.5 text-[26px] font-extrabold text-accent-ink" aria-live="polite">
        = {t.som(price.total)}
      </p>
    </Card>
  );
}

// ---------- 3. When ----------
function StepWhen({ draft }: { draft: Draft }) {
  const t = useT();
  const nav = useNav();
  const { settings } = useSession();
  const today = tashkentDate(new Date());
  const dates = Array.from({ length: settings.bookingDaysAhead + 1 }, (_, i) => addDays(today, i));
  const date = draft.date && dates.includes(draft.date) ? draft.date : null;
  const slots = useQuery<{ slots: (SlotAvailability & { slotId: number })[] }>(date ? `slots:${date}` : null, () => api.get(`/slots?date=${date}`), { staleMs: 5000 });
  const { catalog } = useSession();

  // Pick the first day with a free slot when nothing is chosen yet.
  useEffect(() => {
    if (!date) updateDraft({ date: today, slotId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const list = slots.data?.slots;
    if (!list || !date) return;
    const chosen = list.find((s) => s.slotId === draft.slotId);
    if (draft.slotId && (!chosen || !chosen.available)) updateDraft({ slotId: null });
    if (date === today && list.every((s) => !s.available) && !draft.repeat) updateDraft({ date: addDays(today, 1), slotId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.data]);

  const reasonText = (r: string | null) =>
    r === "full" ? t("slot_full") : r === "subscribers_only" ? t("slot_subscribers") : r ? t("slot_past") : undefined;

  return (
    <>
      <Section title={t("choose_date")} className="mt-0">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          {dates.map((d) => (
            <Chip key={d} selected={d === date} onClick={() => updateDraft({ date: d, slotId: null, repeat: false })}>
              {friendlyDate(d, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title={t("choose_slot")}>
        {slots.loading || !slots.data ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slots.data.slots.map((s) => {
              const def = catalog.slots.find((x) => x.id === s.slotId);
              if (!def) return null;
              return (
                <Chip
                  key={s.slotId}
                  className="w-full"
                  selected={draft.slotId === s.slotId}
                  disabled={!s.available}
                  reason={!s.available ? reasonText(s.reason) : s.left != null && s.left <= 3 ? t("slot_left", { n: s.left }) : undefined}
                  onClick={() => updateDraft({ slotId: s.slotId })}
                >
                  {formatSlot(def.startMinute, def.endMinute)}
                </Chip>
              );
            })}
          </div>
        )}
      </Section>
      <MainButton text={t("next")} disabled={!date || !draft.slotId} onClick={() => nav.push("new_order", { step: 4 })} />
    </>
  );
}

// ---------- 4. Payment ----------
const METHOD_ICON: Record<PaymentMethod, string> = { subscription: "crown", cash: "cash", click: "wallet", payme: "wallet", card: "card" };

function StepPay({ draft }: { draft: Draft }) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const s = useSession();
  const { catalog, settings, subscription } = s;
  const [busy, setBusy] = useState(false);
  const type = catalog.trashTypes.find((x) => x.code === draft.trashType);
  const size = catalog.packageSizes.find((x) => x.code === draft.packageSize);
  const slot = catalog.slots.find((x) => x.id === draft.slotId);
  const rule = type && size ? catalog.prices.find((p) => p.trashTypeId === type.id && p.packageSizeId === size.id) : undefined;
  let total = 0;
  try {
    total = rule ? calcPrice(rule, draft.quantity, settings.maxQuantity).total : 0;
  } catch {
    total = 0;
  }
  const subUsable = !!subscription && subscription.left > 0;
  const methods = (["subscription", "cash", "click", "payme", "card"] as PaymentMethod[]).filter((m) => settings.methods[m] && (m !== "subscription" || subUsable));
  const method = draft.method && methods.includes(draft.method) ? draft.method : null;

  useEffect(() => {
    if (!method && methods.length) updateDraft({ method: subUsable ? "subscription" : "cash" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!type || !size || !slot || !draft.date || draft.lat == null || draft.lng == null) {
    return <Button block variant="secondary" onClick={() => nav.reset("home")}>{t("back")}</Button>;
  }

  const sub = (m: PaymentMethod) =>
    m === "subscription" ? t("pm_subscription_sub", { left: subscription?.left ?? 0 }) : m === "cash" ? t("pm_cash_sub") : m === "card" ? t("pm_card_sub") : t("pm_online_sub");

  async function submit() {
    if (!method || busy) return;
    setBusy(true);
    try {
      void requestWriteAccess();
      const res = await api.post<CreateOrderResult>("/orders", {
        idempotencyKey: draft.idem,
        lat: draft.lat,
        lng: draft.lng,
        address: draft.address.trim(),
        notes: draft.notes.trim() || null,
        saveAddressLabel: draft.addressId == null ? draft.saveLabel : null,
        trashType: draft.trashType,
        packageSize: draft.packageSize,
        quantity: draft.quantity,
        pickupDate: draft.date,
        slotId: draft.slotId,
        paymentMethod: method,
        photoIds: draft.photoIds,
      });
      clearDraft();
      invalidate("orders");
      invalidate("addresses");
      if (method === "subscription") void s.refresh();
      const outcome = res.payment ? await runPayment(res.payment) : null;
      if (!res.payment || outcome === "paid") toast(t("order_created"));
      nav.reset("home");
      nav.push("order", { id: res.order.id, fresh: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      toast(errorText(t, code, { max: settings.maxQuantity }), "error");
      if (code === "slot_unavailable") nav.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <p className="text-[15px] font-semibold text-hint">{t("summary")}</p>
        <p className="mt-1 text-[17px] font-semibold leading-6">{draft.address}</p>
        <div className="mt-2 text-[16px]">
          <KeyValue k={t("type")} v={`${t.name(type)} · ${t.name(size)} × ${draft.quantity}`} />
          <KeyValue k={t("slot")} v={`${friendlyDate(draft.date, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, ${formatSlot(slot.startMinute, slot.endMinute)}`} />
          {draft.photoIds.length > 0 && <KeyValue k={<Icon name="camera" size={18} />} v={`${draft.photoIds.length}`} />}
          <div className="my-2 border-t border-line" />
          <KeyValue k={t("total")} v={<span className="money text-[20px]">{method === "subscription" ? t("pm_subscription") : t.som(total)}</span>} strong />
        </div>
      </Card>

      <Section title={t("payment")}>
        <div className="space-y-2" role="radiogroup">
          {methods.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={method === m}
              onClick={() => updateDraft({ method: m })}
              className={cx("card-hc flex min-h-[64px] w-full items-center gap-3 rounded-card border-2 bg-card px-4 text-left transition active:scale-[.99]", method === m ? "border-accent bg-accent-soft" : "border-transparent")}
            >
              <span className={cx("flex h-11 w-11 items-center justify-center rounded-full", method === m ? "bg-accent text-on-accent" : "bg-line/60 text-ink")}>
                <Icon name={METHOD_ICON[m]} />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{t(`pm_${m}`)}</span>
                <span className="block text-[14px] leading-5 text-hint">{sub(m)}</span>
              </span>
              <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border-2", method === m ? "border-accent bg-accent text-on-accent" : "border-line")}>
                {method === m && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {settings.methods.subscription && !subUsable && <PaywallCard />}

      <MainButton
        text={method === "subscription" ? t("place_order_free") : t("place_order", { total: t.som(total) })}
        disabled={!method}
        loading={busy}
        onClick={submit}
      />
    </>
  );
}

/** The subscription guard: a friendly card, never a dead end. */
export function PaywallCard() {
  const t = useT();
  const nav = useNav();
  return (
    <Card className="mt-4 border border-accent/30">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <Icon name="crown" />
        </span>
        <div className="flex-1">
          <p className="font-semibold">{t("paywall_title")}</p>
          <p className="text-[15px] leading-5 text-hint">{t("paywall_text")}</p>
        </div>
      </div>
      <Button size="md" block variant="secondary" className="mt-3" onClick={() => nav.push("plans")}>
        {t("paywall_cta")}
      </Button>
    </Card>
  );
}
