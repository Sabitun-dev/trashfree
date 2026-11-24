// Courier: a carpet / curtain order. Take it, measure every item, send the price (the courier never sees prices),
// pick the items up. Later steps (washer, delivery) are added with those features.
import { useEffect, useState } from "react";
import { areaTenths, metresToCm, MAX_SIDE_CM, MIN_SIDE_CM } from "@domain/wash";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { friendlyDate } from "../../lib/format";
import { invalidate, setQueryData, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { haptic, openLink } from "../../lib/tg";
import type { WashDTO } from "../../lib/types";
import { CallButton } from "../../components/CallButton";
import { PrivatePhoto } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, cx, ErrorState, inputCls, KeyValue, Section, Skeleton } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { m2, svcLabel, WashItemsList, WashStatusBadge } from "./parts";

type Row = { l: string; w: string };
const toRows = (o: WashDTO): Row[] => (o.items.length ? o.items.map((i) => ({ l: i.lengthCm ? (i.lengthCm / 100).toString() : "", w: i.widthCm ? (i.widthCm / 100).toString() : "" })) : [{ l: "", w: "" }]);

function rowCm(r: Row) {
  const l = metresToCm(r.l);
  const w = metresToCm(r.w);
  const ok = l != null && w != null && l >= MIN_SIDE_CM && w >= MIN_SIDE_CM && l <= MAX_SIDE_CM && w <= MAX_SIDE_CM;
  return ok ? { lengthCm: l!, widthCm: w! } : null;
}

export function CourierWash({ id }: { id: string }) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const key = `cwash:${id}`;
  const q = useQuery<WashDTO>(key, () => api.get(`/wash/orders/${id}`), { refreshMs: 15_000 });
  const [rows, setRows] = useState<Row[]>([{ l: "", w: "" }]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const o = q.data;

  useEffect(() => {
    if (o && !editing) setRows(toRows(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.quoteVersion, o?.id]);

  if (q.loading) return <Page><Skeleton className="h-72" /></Page>;
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code === "not_found" ? "taken" : q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;

  async function act(path: string, payload: unknown, ok: string) {
    setBusy(true);
    try {
      setQueryData(key, await api.post<WashDTO>(`/wash/orders/${id}/${path}`, payload));
      invalidate("courier");
      invalidate("wash");
      setEditing(false);
      toast(ok);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      toast(code === "taken" ? t("c_taken_other") : errorText(t, code, { max: 10 }), "error");
      if (code === "taken") nav.back();
      void q.refetch();
    } finally {
      setBusy(false);
    }
  }

  const measurable = o.status === "courier_assigned" || o.status === "measured" || o.status === "quote_sent";
  const parsed = rows.map(rowCm);
  const allValid = parsed.every(Boolean) && parsed.length > 0;
  const total = parsed.reduce((s, r) => s + (r ? areaTenths(r.lengthCm, r.widthCm) : 0), 0);
  const showForm = measurable && (o.status === "courier_assigned" || editing);

  return (
    <Page hasMainButton>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-hint">
          <Icon name={o.service} size={18} /> {t(svcLabel(o.service))} · {o.displayNumber}
        </span>
        <span className="flex-1" />
        <WashStatusBadge status={o.status} onHold={o.onHold} />
      </div>
      {o.address && <h1 className="mt-2 text-[24px] font-extrabold leading-7">{o.address}</h1>}
      {o.notes && <p className="mt-2 rounded-2xl bg-info-soft px-3 py-2 text-[17px] font-medium text-info">{o.notes}</p>}

      <Card className="mt-3 text-[17px]">
        <KeyValue k={t("slot")} v={<b>{friendlyDate(o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(o.slotStart, o.slotEnd)}</b>} />
        {o.customer && <KeyValue k={t("a_customer")} v={o.customer.name} />}
      </Card>

      {o.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {o.photos.map((p) => (
            <PrivatePhoto key={p.id} id={p.id} className="h-32 w-32 shrink-0 rounded-card" />
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {o.customer?.phone ? <CallButton phone={o.customer.phone} label={t("call")} className="flex-1" /> : <div className="flex flex-1 items-center rounded-2xl bg-line/50 px-3 text-[14px] text-hint">{t("c_phone_after")}</div>}
        {o.lat != null && o.lng != null && (
          <>
            <Button size="xl" variant="outline" onClick={() => openLink(`https://yandex.uz/maps/?rtext=~${o.lat},${o.lng}&rtt=auto`)}>
              Yandex
            </Button>
            <Button size="xl" variant="outline" onClick={() => openLink(`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`)}>
              Google
            </Button>
          </>
        )}
      </div>

      {showForm ? (
        <Section title={t("wc_measure")}>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const cm = parsed[i];
              return (
                <Card key={i} className={cx("p-3", !cm && (r.l || r.w) && "border-2 border-danger/50")}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold">#{i + 1}</span>
                    <span className="text-[16px] font-bold">{cm ? `${m2(areaTenths(cm.lengthCm, cm.widthCm))} m²` : "—"}</span>
                    {rows.length > 1 && (
                      <button aria-label={t("delete")} className="flex h-10 w-10 items-center justify-center text-danger" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                        <Icon name="trash" size={20} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[13px] text-hint">
                      {t("wc_length")}
                      <input inputMode="decimal" className={inputCls + " text-[20px] font-semibold"} value={r.l} placeholder="4.0" onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, l: e.target.value } : x)))} />
                    </label>
                    <label className="text-[13px] text-hint">
                      {t("wc_width")}
                      <input inputMode="decimal" className={inputCls + " text-[20px] font-semibold"} value={r.w} placeholder="2.5" onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, w: e.target.value } : x)))} />
                    </label>
                  </div>
                </Card>
              );
            })}
          </div>
          <Button
            block
            variant="secondary"
            icon="plus"
            className="mt-2"
            disabled={rows.length >= 10}
            onClick={() => {
              haptic.tick();
              setRows([...rows, { l: "", w: "" }]);
            }}
          >
            {t("wc_add_item")}
          </Button>
          <Card className="mt-3 flex items-center justify-between bg-accent-soft">
            <span className="font-semibold text-accent-ink">{t("wc_area_total")}</span>
            <span className="text-[22px] font-extrabold text-accent-ink">{m2(total)} m²</span>
          </Card>
          <MainButton text={t("wc_send_quote")} disabled={!allValid} loading={busy} onClick={() => act("measure", { items: parsed }, t("wc_quote_sent"))} />
        </Section>
      ) : (
        o.items.length > 0 && (
          <Section title={o.status === "client_confirmed" ? t("wash_labels") : t("wash_items")}>
            <Card>
              {o.status === "client_confirmed" && <p className="mb-1 text-[14px] text-hint">{t("wc_label_hint")}</p>}
              <WashItemsList order={o} />
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
                <span>{t("wc_area_total")}</span>
                <span>{m2(o.items.reduce((s, i) => s + (i.areaTenths ?? 0), 0))} m²</span>
              </div>
            </Card>
          </Section>
        )
      )}

      <div className="mt-4 space-y-2">
        {o.status === "created" && <MainButton text={t("c_take")} loading={busy} onClick={() => act("take", {}, t("c_taken_toast"))} />}
        {o.status === "measured" && o.needsApproval && !editing && <Card className="text-center text-warn">{t("wc_needs_approval")}</Card>}
        {o.status === "quote_sent" && !editing && <Card className="text-center text-hint">{t("wc_waiting_client")}</Card>}
        {(o.status === "measured" || o.status === "quote_sent") && !editing && (
          <Button block variant="outline" icon="edit" onClick={() => setEditing(true)}>
            {t("wc_measure")}
          </Button>
        )}
        {o.status === "client_confirmed" && (
          <>
            <p className="px-1 text-center text-[14px] text-hint">{t("wc_locked")}</p>
            <MainButton text={t("wc_pickup")} loading={busy} onClick={() => act("pickup", {}, t("done"))} />
          </>
        )}
        {o.status === "courier_assigned" && (
          <Button block variant="ghost" onClick={() => act("give-back", {}, t("done"))}>
            {t("c_give_back")}
          </Button>
        )}
      </div>
    </Page>
  );
}

/** A compact card in the courier's lists (no prices). */
export function CourierWashCard({ order, onOpen }: { order: WashDTO; onOpen: () => void }) {
  const t = useT();
  return (
    <Card onClick={onOpen}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-hint">
          <Icon name={order.service} size={16} /> {t(svcLabel(order.service))} · {order.displayNumber}
        </span>
        <span className="flex-1" />
        <WashStatusBadge status={order.status} onHold={order.onHold} />
      </div>
      {order.address && <p className="mt-2 text-[19px] font-bold leading-6">{order.address}</p>}
      <p className="mt-1 text-[16px] text-hint">
        {friendlyDate(order.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(order.slotStart, order.slotEnd)}
        {order.items.length > 0 && ` · ${order.items.length} ${t("pcs")} · ${m2(order.items.reduce((s, i) => s + (i.areaTenths ?? 0), 0))} m²`}
      </p>
    </Card>
  );
}
