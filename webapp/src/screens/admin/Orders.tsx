// Admin orders: filters + search, detail with reassign / cancel (required reason) / refund note, CSV export.
import { useState } from "react";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@domain/types";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dateTime, friendlyDate, phoneDisplay } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { openLink } from "../../lib/tg";
import type { OrderDTO, PersonDTO } from "../../lib/types";
import { MapView } from "../../components/Maps";
import { PrivatePhoto } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, Chip, EmptyState, ErrorState, inputCls, KeyValue, Section, Skeleton, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet, useToast } from "../../ui/overlays";
import { PaymentBadge, StatusBadge } from "../../ui/status";
import type { OrderFilter } from "./Dashboard";

type AdminOrder = OrderDTO & { refundNote: string | null; cashHandoverId: number | null };

const qs = (f: OrderFilter) =>
  Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export function AdminOrders({ filter: initial = {} }: { filter?: OrderFilter }) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const s = useSession();
  const [filter, setFilter] = useState<OrderFilter>(initial);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const f = { ...filter, q: search.trim() || undefined };
  const key = `admin:orders:${qs(f)}`;
  const first = useQuery<{ items: AdminOrder[]; next: string | null }>(key, () => api.get(`/admin/orders?${qs(f)}`), { refreshMs: 30_000 });
  const [more, setMore] = useState<AdminOrder[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const items = [...(first.data?.items ?? []), ...more];
  const nextCursor = more.length ? next : first.data?.next;

  async function loadMore() {
    if (!nextCursor) return;
    const r = await api.get<{ items: AdminOrder[]; next: string | null }>(`/admin/orders?${qs({ ...f, cursor: nextCursor })}`);
    setMore((m) => [...m, ...r.items]);
    setNext(r.next);
  }

  const set = (k: string, v: string | number | undefined) => {
    setMore([]);
    setFilter((x) => ({ ...x, [k]: v }));
  };
  const activeCount = Object.values(filter).filter((v) => v !== undefined && v !== "").length;

  return (
    <Page
      hasTabBar={nav.depth === 1}
      title={t("tab_orders")}
      actions={
        <Button
          size="md"
          variant="ghost"
          icon="download"
          onClick={async () => {
            try {
              await api.post("/admin/orders/export", f);
              toast(t("a_export_sent"));
            } catch (e) {
              toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
            }
          }}
        >
          CSV
        </Button>
      }
    >
      <div className="flex gap-2">
        <input className={inputCls} placeholder={t("a_search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant={activeCount ? "secondary" : "outline"} icon="settings" onClick={() => setSheet(true)} aria-label={t("a_filters")}>
          {activeCount || ""}
        </Button>
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {[
          ["", t("all")],
          ["open,accepted,on_the_way", t("a_pending")],
          ["awaiting_payment", t("st_awaiting_payment")],
          ["completed", t("a_completed")],
          ["cancelled,expired", t("st_cancelled")],
        ].map(([v, l]) => (
          <Chip key={v} selected={(filter.status ?? "") === v} onClick={() => set("status", v || undefined)}>
            {l}
          </Chip>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {first.loading ? (
          <SkeletonList n={5} h="h-20" />
        ) : first.error ? (
          <ErrorState text={t("err_network")} onRetry={first.refetch} retryLabel={t("retry")} />
        ) : !items.length ? (
          <EmptyState icon="list" title={t("a_no_data")} />
        ) : (
          items.map((o) => (
            <Card key={o.id} onClick={() => nav.push("a_order", { id: o.id })} className="py-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">#{o.number}</span>
                <span className="text-[14px] text-hint">{dateTime(o.createdAt, t.lang)}</span>
                <span className="flex-1" />
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-1 truncate">{o.address}</p>
              <p className="flex items-center justify-between text-[14px] text-hint">
                <span className="min-w-0 truncate">{o.customer?.name ? `${o.customer.name} · ` : ""}{t(`pm_${o.paymentMethod}`)}</span>
                <span className="money font-semibold text-ink">{t.som(o.priceTotal)}</span>
              </p>
              {o.courier && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-hint">
                  <Icon name="truck" size={15} /> {o.courier.name}
                </p>
              )}
            </Card>
          ))
        )}
        {nextCursor && (
          <Button block variant="outline" onClick={loadMore}>
            {t("more")}
          </Button>
        )}
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title={t("a_filters")}>
        <div className="space-y-4">
          <FilterChips label={t("a_cities")} value={filter.cityId} options={s.catalog.cities.map((c) => [c.id, t.name(c)])} onChange={(v) => set("cityId", v)} />
          <FilterChips label={t("type")} value={filter.trashTypeId} options={s.catalog.trashTypes.map((c) => [c.id, t.name(c)])} onChange={(v) => set("trashTypeId", v)} />
          <FilterChips label={t("method")} value={filter.method} options={PAYMENT_METHODS.map((m) => [m, t(`pm_${m}`)])} onChange={(v) => set("method", v)} />
          <FilterChips label={t("status")} value={filter.status} options={ORDER_STATUSES.map((m) => [m, t(`st_${m}`)])} onChange={(v) => set("status", v)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[14px] text-hint">
              {t("a_from")}
              <input type="date" className={inputCls} value={(filter.dateFrom as string) ?? ""} onChange={(e) => set("dateFrom", e.target.value || undefined)} />
            </label>
            <label className="text-[14px] text-hint">
              {t("a_to")}
              <input type="date" className={inputCls} value={(filter.dateTo as string) ?? ""} onChange={(e) => set("dateTo", e.target.value || undefined)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { setFilter({}); setMore([]); }}>{t("a_reset")}</Button>
            <Button onClick={() => setSheet(false)}>{t("a_apply")}</Button>
          </div>
        </div>
      </BottomSheet>
    </Page>
  );
}

function FilterChips<V extends string | number>({ label, value, options, onChange }: { label: string; value: unknown; options: [V, string][]; onChange: (v: V | undefined) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[14px] font-medium text-hint">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <Chip key={String(v)} selected={value === v} onClick={() => onChange(value === v ? undefined : v)}>
            {l}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function AdminOrder({ id }: { id: string }) {
  const t = useT();
  const toast = useToast();
  const s = useSession();
  const q = useQuery<AdminOrder & { audits: { id: number; action: string; reason: string | null; createdAt: string }[] }>(`admin:order:${id}`, () => api.get(`/admin/orders/${id}`));
  const [action, setAction] = useState<"cancel" | "assign" | "refund" | null>(null);
  const [reason, setReason] = useState("");
  const [courierId, setCourierId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const o = q.data;
  const couriers = useQuery<PersonDTO[]>(o && action === "assign" ? `admin:couriers:${o.cityId}` : null, () => api.get(`/admin/couriers?cityId=${o!.cityId}`));

  if (q.loading) return <Page><Skeleton className="h-96" /></Page>;
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;
  const type = s.catalog.trashTypes.find((x) => x.id === o.trashTypeId);
  const size = s.catalog.packageSizes.find((x) => x.id === o.packageSizeId);
  const city = s.catalog.cities.find((x) => x.id === o.cityId);
  const activeOrder = ["open", "accepted", "on_the_way"].includes(o.status);

  async function submit() {
    if (reason.trim().length < 2) return toast(t("err_reason_required"), "error");
    setBusy(true);
    try {
      if (action === "cancel") await api.post(`/admin/orders/${id}/cancel`, { reason });
      if (action === "assign") await api.post(`/admin/orders/${id}/assign`, { courierId, reason });
      if (action === "refund") await api.post(`/admin/orders/${id}/refund-note`, { note: reason });
      toast(t("saved"));
      setAction(null);
      setReason("");
      invalidate("admin:");
      void q.refetch();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={`#${o.number}`}>
      <Card>
        <div className="flex items-center justify-between">
          <StatusBadge status={o.status} />
          <PaymentBadge status={o.paymentStatus} />
        </div>
        <p className="mt-2 text-[18px] font-semibold">{o.address}</p>
        {o.notes && <p className="text-hint">{o.notes}</p>}
        <div className="mt-2 text-[16px]">
          <KeyValue k={t("a_cities")} v={city ? t.name(city) : ""} />
          <KeyValue k={t("type")} v={`${type ? t.name(type) : ""} · ${size ? t.name(size) : ""} × ${o.quantity}`} />
          <KeyValue k={t("slot")} v={`${friendlyDate(o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, ${formatSlot(o.slotStart, o.slotEnd)}`} />
          <KeyValue k={t("method")} v={t(`pm_${o.paymentMethod}`)} />
          <KeyValue k={t("total")} v={<span className="money">{t.som(o.priceTotal)}</span>} strong />
          {o.cashCollected != null && <KeyValue k={t("c_today_cash")} v={`${t.som(o.cashCollected)} ${o.cashHandoverId ? "✅" : "⏳"}`} />}
          {o.rating && <KeyValue k="★" v={`${o.rating}${o.ratingComment ? ` · ${o.ratingComment}` : ""}`} />}
          {o.refundNote && <KeyValue k={t("a_refund_manual")} v={o.refundNote} />}
        </div>
      </Card>

      <Section>
        <Card className="space-y-2">
          <PersonLine icon="user" label={t("a_customer")} p={o.customer} />
          <PersonLine icon="truck" label={t("courier")} p={o.courier} />
        </Card>
      </Section>

      {o.lat != null && o.lng != null && <MapView className="mt-3 h-40" markers={[{ id: o.id, lat: o.lat, lng: o.lng, color: "#15803d" }]} />}
      {o.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {o.photos.map((p) => <PrivatePhoto key={p.id} id={p.id} className="h-28 w-28 shrink-0 rounded-2xl" />)}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {activeOrder && <Button variant="secondary" icon="truck" onClick={() => setAction("assign")}>{t("a_reassign")}</Button>}
        {(activeOrder || o.status === "awaiting_payment") && <Button variant="danger" icon="x" onClick={() => setAction("cancel")}>{t("a_cancel_order")}</Button>}
        {o.paymentStatus === "paid" && (o.status === "cancelled" || o.status === "expired") && !o.refundNote && (
          <Button variant="outline" className="col-span-2" onClick={() => setAction("refund")}>{t("a_refund_manual")}</Button>
        )}
      </div>

      {o.audits.length > 0 && (
        <Section title={t("a_audit")}>
          <Card className="text-[15px]">
            {o.audits.map((a) => (
              <p key={a.id} className="py-1">
                <span className="text-hint">{dateTime(a.createdAt, t.lang)}</span> · {a.action}
                {a.reason ? ` — ${a.reason}` : ""}
              </p>
            ))}
          </Card>
        </Section>
      )}

      <BottomSheet open={!!action} onClose={() => setAction(null)} title={action === "cancel" ? t("a_cancel_order") : action === "assign" ? t("a_reassign") : t("a_refund_manual")}>
        {action === "assign" && (
          <div className="mb-3 flex flex-wrap gap-2">
            {o.courier && <Chip selected={courierId === null} onClick={() => setCourierId(null)}>{t("a_unassign")}</Chip>}
            {couriers.data?.filter((c) => c.id !== o.courier?.id).map((c) => (
              <Chip key={c.id} selected={courierId === c.id} onClick={() => setCourierId(c.id)}>{c.name}</Chip>
            ))}
          </div>
        )}
        <textarea className={inputCls + " min-h-[90px]"} placeholder={t("a_reason_ph")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Button block className="mt-3" loading={busy} variant={action === "cancel" ? "danger" : "primary"} disabled={action === "assign" && courierId === null && !o.courier} onClick={submit}>
          {t("save")}
        </Button>
      </BottomSheet>
    </Page>
  );
}

function PersonLine({ icon, label, p }: { icon: string; label: string; p: PersonDTO | null }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} className="text-hint" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-hint">{label}</p>
        <p className="truncate font-medium">{p ? p.name : "—"}</p>
      </div>
      {p?.phone && (
        <Button size="md" variant="outline" icon="phone" onClick={() => openLink(`tel:${p.phone}`)} aria-label={t("call")}>
          {phoneDisplay(p.phone)}
        </Button>
      )}
    </div>
  );
}
