// Washer: items handed over by couriers. Re-measure each labelled item blind (the courier's sizes are hidden),
// then mark washed. The washer sees only their own share — never the client's price.
import { useEffect, useState } from "react";
import { areaTenths, metresToCm, MAX_SIDE_CM, MIN_SIDE_CM } from "@domain/wash";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { dateTime } from "../../lib/format";
import { invalidate, setQueryData, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import type { WashDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Card, cx, EmptyState, ErrorState, inputCls, Segmented, Section, Skeleton, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { Celebration, useToast } from "../../ui/overlays";
import { m, m2, svcLabel, WashStatusBadge } from "./parts";

type Tab = "mine" | "done";

export function WasherList() {
  const t = useT();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>("mine");
  const q = useQuery<WashDTO[]>(`washer:${tab}`, () => api.get(`/wash/washer?tab=${tab}`), { refreshMs: 20_000 });
  return (
    <Page hasTabBar title={t("tab_orders")}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "mine", label: t("wr_mine") },
          { value: "done", label: t("wr_done") },
        ]}
      />
      <div className="mt-3 space-y-3">
        {q.loading ? (
          <SkeletonList n={3} h="h-28" />
        ) : !q.data?.length ? (
          <EmptyState icon="sparkle" title={t("wr_empty")} />
        ) : (
          q.data.map((o) => (
            <Card key={o.id} onClick={() => nav.push("w_order", { id: o.id })}>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Icon name={o.service} size={18} /> {t(svcLabel(o.service))} · {o.displayNumber}
                </span>
                <span className="flex-1" />
                <WashStatusBadge status={o.status} onHold={o.onHold} />
              </div>
              <p className="mt-1 text-[15px] text-hint">
                {o.items.length} {t("pcs")} · {dateTime(o.statusAt, t.lang)}
              </p>
            </Card>
          ))
        )}
      </div>
    </Page>
  );
}

type Row = { l: string; w: string };
const cm = (r: Row) => {
  const l = metresToCm(r.l);
  const w = metresToCm(r.w);
  return l != null && w != null && l >= MIN_SIDE_CM && w >= MIN_SIDE_CM && l <= MAX_SIDE_CM && w <= MAX_SIDE_CM ? { lengthCm: l, widthCm: w } : null;
};

export function WasherOrder({ id }: { id: string }) {
  const t = useT();
  const toast = useToast();
  const key = `worder:${id}`;
  const q = useQuery<WashDTO>(key, () => api.get(`/wash/orders/${id}`), { refreshMs: 20_000 });
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState(false);
  const o = q.data;

  useEffect(() => {
    if (!o) return;
    setRows(Object.fromEntries(o.items.map((i) => [i.id, { l: i.washerLengthCm ? String(i.washerLengthCm / 100) : "", w: i.washerWidthCm ? String(i.washerWidthCm / 100) : "" }])));
  }, [o?.id, o?.items.length]);

  if (q.loading) return <Page><Skeleton className="h-72" /></Page>;
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;

  const measured = o.items.every((i) => i.washerAreaTenths != null);
  const parsed = o.items.map((i) => ({ id: i.id, v: rows[i.id] ? cm(rows[i.id]) : null }));
  const allValid = parsed.every((p) => p.v);

  async function act(path: string, payload: unknown, ok: string) {
    setBusy(true);
    try {
      const next = await api.post<WashDTO>(`/wash/orders/${id}/${path}`, payload);
      setQueryData(key, next);
      invalidate("washer");
      toast(ok);
      if (path === "washed") setParty(true);
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
      void q.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page hasMainButton title={`${t(svcLabel(o.service))} · ${o.displayNumber}`}>
      {party && <Celebration text={t("celebrate")} onDone={() => setParty(false)} />}
      <Card className="flex items-center justify-between">
        <WashStatusBadge status={o.status} onHold={o.onHold} />
        {o.money?.washerPayout != null && (
          <span className="text-right">
            <span className="block text-[13px] text-hint">{t("wr_share")}</span>
            <span className="money text-[20px] font-extrabold text-accent-ink">{t.som(o.money.washerPayout)}</span>
          </span>
        )}
      </Card>

      {o.onHold && (
        <Card className="mt-3 border-2 border-danger/40 bg-danger-soft">
          <p className="flex items-start gap-2 font-semibold text-danger">
            <Icon name="alert" className="mt-0.5 shrink-0" /> {t("wr_on_hold")}
          </p>
        </Card>
      )}

      <Section title={t("wr_measure")}>
        <p className="mb-2 px-1 text-[14px] text-hint">{t("wr_measure_hint")}</p>
        <div className="space-y-2">
          {o.items.map((i) => {
            const r = rows[i.id] ?? { l: "", w: "" };
            const v = cm(r);
            const locked = o.status !== "at_washer";
            return (
              <Card key={i.id} className={cx("p-3", !v && (r.l || r.w) && "border-2 border-danger/50")}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono font-bold text-accent-ink">{i.label}</span>
                  <span className="font-bold">{v ? `${m2(areaTenths(v.lengthCm, v.widthCm))} m²` : i.washerAreaTenths != null ? `${m2(i.washerAreaTenths)} m²` : "—"}</span>
                </div>
                {locked ? (
                  <p className="text-[16px]">
                    {m(i.washerLengthCm)} × {m(i.washerWidthCm)} m
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[13px] text-hint">
                      {t("wc_length")}
                      <input inputMode="decimal" className={inputCls + " text-[20px] font-semibold"} value={r.l} onChange={(e) => setRows({ ...rows, [i.id]: { ...r, l: e.target.value } })} />
                    </label>
                    <label className="text-[13px] text-hint">
                      {t("wc_width")}
                      <input inputMode="decimal" className={inputCls + " text-[20px] font-semibold"} value={r.w} onChange={(e) => setRows({ ...rows, [i.id]: { ...r, w: e.target.value } })} />
                    </label>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>

      {o.status === "at_washer" &&
        (!measured || !allValid || o.items.some((i) => rows[i.id] && cm(rows[i.id])?.lengthCm !== i.washerLengthCm) ? (
          <MainButton
            text={t("wr_submit")}
            disabled={!allValid}
            loading={busy}
            onClick={() => act("washer-measure", { items: parsed.map((p) => ({ id: p.id, ...p.v! })) }, t("wr_saved"))}
          />
        ) : (
          <MainButton text={t("wr_washed")} disabled={o.onHold} loading={busy} onClick={() => act("washed", {}, t("wr_washed"))} />
        ))}
    </Page>
  );
}
