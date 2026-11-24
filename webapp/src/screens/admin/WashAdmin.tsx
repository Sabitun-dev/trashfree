// Admin: carpet & curtain price settings (with history) and the carpet/curtain order list.
import { useEffect, useState } from "react";
import { errorText, useT } from "../../i18n";
import type { DictKey } from "../../i18n/uz";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { dateTime } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import type { WashDTO } from "../../lib/types";
import { Card, Chip, EmptyState, Field, inputCls, Section, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { svcLabel, WashOrderCard } from "../wash/parts";

interface Pricing {
  pricePerM2: number;
  washerSharePerM2: number;
  minOrder: number;
  maxOrder: number;
  maxItems: number;
  deliveryFee: number;
  freeDeliveryFrom: number;
  tolerancePct: number;
  courierPay: number;
}
type Row = Pricing & { id: number; createdAt: string; createdById: number | null };

const FIELDS: [keyof Pricing, DictKey][] = [
  ["pricePerM2", "a_ws_price"],
  ["washerSharePerM2", "a_ws_washer"],
  ["minOrder", "a_ws_min"],
  ["maxOrder", "a_ws_max"],
  ["deliveryFee", "a_ws_fee"],
  ["freeDeliveryFrom", "a_ws_free"],
  ["maxItems", "a_ws_items"],
  ["tolerancePct", "a_ws_tol"],
  ["courierPay", "a_ws_courier"],
];

export function AdminWashSettings({ service }: { service: "carpet" | "curtain" }) {
  const t = useT();
  const toast = useToast();
  const q = useQuery<{ current: Row; history: Row[] }>(`admin:wash-settings:${service}`, () => api.get(`/admin/wash-settings/${service}`));
  const [v, setV] = useState<Pricing | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setV(q.data.current);
  }, [q.data]);
  if (!v || !q.data) return <Page><SkeletonList n={6} h="h-16" /></Page>;

  async function save() {
    setBusy(true);
    try {
      const { pricePerM2, washerSharePerM2, minOrder, maxOrder, maxItems, deliveryFee, freeDeliveryFrom, tolerancePct, courierPay } = v!;
      await api.put(`/admin/wash-settings/${service}`, { pricePerM2, washerSharePerM2, minOrder, maxOrder, maxItems, deliveryFee, freeDeliveryFrom, tolerancePct, courierPay });
      toast(t("a_settings_saved"));
      invalidate(`admin:wash-settings:${service}`);
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t("a_wash_prices", { svc: t(svcLabel(service)) })} hasMainButton>
      <p className="mb-3 px-1 text-[15px] text-hint">{t("a_ws_new_only")}</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([k, label]) => (
          <Field key={k} label={t(label)}>
            <input
              inputMode={k === "tolerancePct" ? "decimal" : "numeric"}
              className={inputCls}
              value={String(v[k])}
              onChange={(e) => setV({ ...v, [k]: k === "tolerancePct" ? Number(e.target.value.replace(",", ".")) || 0 : Number(e.target.value.replace(/\D/g, "")) || 0 })}
            />
          </Field>
        ))}
      </div>
      <Section title={t("a_ws_history")}>
        <Card className="text-[14px]">
          {q.data.history.map((h) => (
            <p key={h.id} className="border-b border-line py-1.5 last:border-0">
              <span className="text-hint">{dateTime(h.createdAt, t.lang)}</span> · {t.som(h.pricePerM2)}/m² · {t("a_ws_washer")}: {t.som(h.washerSharePerM2)} · min {t.som(h.minOrder)}
            </p>
          ))}
        </Card>
      </Section>
      <MainButton text={t("save")} loading={busy} onClick={save} />
    </Page>
  );
}

/** Carpet / curtain orders for admins (used inside Admin → Buyurtmalar when a wash service is selected). */
export function AdminWashList({ service, status, search }: { service: "carpet" | "curtain"; status?: string; search?: string }) {
  const t = useT();
  const nav = useNav();
  const [hold, setHold] = useState(false);
  const qs = new URLSearchParams({ service, ...(status ? { status } : {}), ...(search ? { q: search } : {}), ...(hold ? { onHold: "1" } : {}) }).toString();
  const q = useQuery<WashDTO[]>(`admin:wash-orders:${qs}`, () => api.get(`/admin/wash-orders?${qs}`), { refreshMs: 30_000 });
  return (
    <>
      <div className="mt-3 flex gap-2">
        <Chip selected={hold} onClick={() => setHold(!hold)}>
          {t("a_on_hold")}
        </Chip>
      </div>
      <div className="mt-3 space-y-2">
        {q.loading ? (
          <SkeletonList n={4} h="h-24" />
        ) : !q.data?.length ? (
          <EmptyState icon="list" title={t("a_no_data")} />
        ) : (
          q.data.map((o) => <WashOrderCard key={o.id} order={o} tracker={false} onClick={() => nav.push("wash_order", { id: o.id })} />)
        )}
      </div>
    </>
  );
}
