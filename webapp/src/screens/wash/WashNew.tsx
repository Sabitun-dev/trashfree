// Carpet / curtain order: 3 short steps (where → when → details). No price yet — the courier measures first.
import { useEffect, useRef, useState } from "react";
import { findServiceCity } from "@domain/geo";
import type { SlotAvailability } from "@domain/slots";
import { addDays, formatSlot, tashkentDate } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { friendlyDate } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { getLocation, lastKnownLocation, requestWriteAccess } from "../../lib/tg";
import type { AddressDTO, WashDTO, WashService } from "../../lib/types";
import { MapPicker } from "../../components/Maps";
import { PhotoPicker } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Card, Chip, cx, Field, inputCls, ProgressBar, Section, Skeleton } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { RequirePhone } from "../common/PhoneFlow";
import { svcLabel } from "./parts";

interface WashDraft {
  service: WashService;
  lat: number | null;
  lng: number | null;
  address: string;
  notes: string;
  date: string | null;
  slotId: number | null;
  method: "cash" | "click" | "payme" | "card";
  photoIds: string[];
  idem: string;
}

// Kept in memory between the 3 steps (the BackButton moves between them).
let draft: WashDraft | null = null;
const fresh = (service: WashService): WashDraft => ({ service, lat: null, lng: null, address: "", notes: "", date: null, slotId: null, method: "cash", photoIds: [], idem: newIdempotencyKey() });

function useWashDraft(service: WashService) {
  if (!draft || draft.service !== service) draft = fresh(service);
  const [d, setD] = useState<WashDraft>(draft);
  const update = (p: Partial<WashDraft>) => {
    draft = { ...(draft as WashDraft), ...p };
    setD(draft);
  };
  return [d, update] as const;
}

export function WashNew({ service, step = 1 }: { service: WashService; step?: number }) {
  return (
    <RequirePhone>
      <Wizard service={service} step={step} />
    </RequirePhone>
  );
}

const TITLES = ["w_where", "w_when", "wash_details"] as const;

function Wizard({ service, step }: { service: WashService; step: number }) {
  const t = useT();
  const [d, update] = useWashDraft(service);
  return (
    <Page hasMainButton>
      <div className="mb-4">
        <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-hint">
          <Icon name={service} size={16} /> {t(svcLabel(service))} · {step}/3
        </p>
        <ProgressBar value={step / 3} />
        <h1 className="mt-4 text-title font-bold tracking-tight">{t(TITLES[step - 1])}</h1>
      </div>
      {step === 1 && <Where d={d} update={update} />}
      {step === 2 && <When d={d} update={update} />}
      {step === 3 && <Details d={d} update={update} />}
    </Page>
  );
}

type StepProps = { d: WashDraft; update: (p: Partial<WashDraft>) => void };

function Where({ d, update }: StepProps) {
  const t = useT();
  const nav = useNav();
  const { catalog } = useSession();
  const addresses = useQuery<AddressDTO[]>("addresses", () => api.get("/addresses"));
  const [fly, setFly] = useState<{ lat: number; lng: number; at: number } | null>(null);
  const seq = useRef(0);
  const city0 = catalog.cities[0];
  const initial = useRef(d.lat && d.lng ? { lat: d.lat, lng: d.lng } : (lastKnownLocation() ?? { lat: city0?.centerLat ?? 41.3111, lng: city0?.centerLng ?? 69.2797 }));
  const started = useRef(false);

  useEffect(() => {
    if (d.lat || started.current || addresses.data === undefined) return;
    started.current = true;
    const saved = addresses.data[0];
    if (saved) pick(saved);
    else void getLocation().then((p) => p && setFly({ ...p, at: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.data]);

  function pick(a: AddressDTO) {
    update({ lat: a.lat, lng: a.lng, address: a.address, notes: a.notes ?? "" });
    setFly({ lat: a.lat, lng: a.lng, at: Date.now() });
  }

  async function onMove(p: { lat: number; lng: number }) {
    update({ lat: p.lat, lng: p.lng });
    const n = ++seq.current;
    const r = await api.post<{ address: string | null }>("/geocode/reverse", p).catch(() => null);
    if (n === seq.current && r?.address) update({ address: r.address });
  }

  const area = d.lat != null && d.lng != null ? findServiceCity(catalog.cities, d.lat, d.lng) : null;
  return (
    <>
      {!!addresses.data?.length && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {addresses.data.map((a) => (
            <Chip key={a.id} onClick={() => pick(a)}>
              {a.label}
            </Chip>
          ))}
        </div>
      )}
      <MapPicker center={initial.current} onMove={onMove} flyTo={fly} />
      {area && !area.ok ? (
        <Card className="mt-3 border-2 border-warn/40 bg-warn-soft">
          <p className="font-semibold text-warn">{t("no_service_title")}</p>
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
            <input className={inputCls} value={d.address} maxLength={300} placeholder={t("address_ph")} onChange={(e) => update({ address: e.target.value })} />
          </Field>
          <Field label={t("notes")}>
            <input className={inputCls} value={d.notes} maxLength={300} placeholder={t("notes_ph")} onChange={(e) => update({ notes: e.target.value })} />
          </Field>
        </div>
      )}
      <MainButton text={t("next")} disabled={!area?.ok || !d.address.trim()} onClick={() => nav.push("wash_new", { service: d.service, step: 2 })} />
    </>
  );
}

function When({ d, update }: StepProps) {
  const t = useT();
  const nav = useNav();
  const { settings, catalog } = useSession();
  const today = tashkentDate(new Date());
  const dates = Array.from({ length: settings.bookingDaysAhead + 1 }, (_, i) => addDays(today, i));
  const date = d.date ?? today;
  const slots = useQuery<{ slots: SlotAvailability[] }>(`wslots:${d.service}:${date}`, () => api.get(`/wash/slots?service=${d.service}&date=${date}`), { staleMs: 5000 });
  useEffect(() => {
    if (!d.date) update({ date: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Section title={t("choose_date")} className="mt-0">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          {dates.map((x) => (
            <Chip key={x} selected={x === date} onClick={() => update({ date: x, slotId: null })}>
              {friendlyDate(x, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title={t("choose_slot")}>
        {!slots.data ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slots.data.slots.map((s) => {
              const def = catalog.slots.find((x) => x.id === s.slotId);
              if (!def) return null;
              return (
                <Chip key={s.slotId} className="w-full" selected={d.slotId === s.slotId} disabled={!s.available} reason={!s.available ? (s.reason === "full" ? t("slot_full") : t("slot_past")) : undefined} onClick={() => update({ slotId: s.slotId })}>
                  {formatSlot(def.startMinute, def.endMinute)}
                </Chip>
              );
            })}
          </div>
        )}
      </Section>
      <MainButton text={t("next")} disabled={!d.slotId} onClick={() => nav.push("wash_new", { service: d.service, step: 3 })} />
    </>
  );
}

function Details({ d, update }: StepProps) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const { settings } = useSession();
  const info = useQuery<{ pricePerM2: number; minOrder: number; deliveryFee: number; freeDeliveryFrom: number; maxItems: number }>(`winfo:${d.service}`, () => api.get(`/wash/info?service=${d.service}`));
  const [busy, setBusy] = useState(false);
  const methods = (["cash", "click", "payme", "card"] as const).filter((m) => settings.methods[m]);

  async function submit() {
    if (busy || d.lat == null || d.lng == null || !d.date || !d.slotId) return;
    setBusy(true);
    try {
      void requestWriteAccess();
      const o = await api.post<WashDTO>("/wash/orders", {
        service: d.service,
        idempotencyKey: d.idem,
        lat: d.lat,
        lng: d.lng,
        address: d.address.trim(),
        notes: d.notes.trim() || null,
        pickupDate: d.date,
        slotId: d.slotId,
        paymentMethod: d.method,
        photoIds: d.photoIds,
      });
      draft = null;
      invalidate("wash");
      toast(t("order_created"));
      nav.reset("home");
      nav.push("wash_order", { id: o.id });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      toast(errorText(t, code), "error");
      if (code === "slot_unavailable") nav.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="bg-accent-soft">
        <p className="flex items-start gap-2 font-semibold text-accent-ink">
          <Icon name="edit" size={20} className="mt-0.5 shrink-0" /> {t("wash_how")}
        </p>
        {info.data && (
          <ul className="mt-2 space-y-0.5 text-[15px] text-ink/80">
            <li>• {t("wash_price_info", { price: t.som(info.data.pricePerM2) })}</li>
            <li>• {t("wash_min_info", { min: t.som(info.data.minOrder) })}</li>
            <li>• {t("wash_delivery_info", { fee: t.som(info.data.deliveryFee), free: t.som(info.data.freeDeliveryFrom) })}</li>
          </ul>
        )}
      </Card>
      <Section>
        <PhotoPicker ids={d.photoIds} onChange={(photoIds) => update({ photoIds })} max={settings.maxPhotos} label={t("add_photo")} hint={t("wash_photo_hint")} />
      </Section>
      <Section title={t("wash_pay_pref")}>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <Chip key={m} className={cx("w-full")} selected={d.method === m} onClick={() => update({ method: m })}>
              {t(`pm_${m}`)}
            </Chip>
          ))}
        </div>
        {d.method !== "cash" && <p className="mt-2 px-1 text-[14px] text-hint">{t("wash_pay_online_sub")}</p>}
      </Section>
      <p className="mt-4 px-1 text-center text-[15px] text-hint">{t("wash_price_after")}</p>
      <MainButton text={t("wash_place")} loading={busy} onClick={submit} />
    </>
  );
}
