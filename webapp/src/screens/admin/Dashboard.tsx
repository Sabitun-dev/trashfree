// Admin dashboard. Every figure opens the matching filtered order list.
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { dayMonth } from "../../lib/format";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { Icon } from "../../ui/Icon";
import { Card, Chip, cx, ErrorState, IconButton, Section, Segmented, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";

type Period = "today" | "week" | "month";

interface Dash {
  fromDate: string;
  toDate: string;
  orders: { total: number; completed: number; pending: number; awaitingPayment: number; cancelled: number };
  revenue: Record<string, number>;
  revenueTotal: number;
  cashNotHandedOver: number;
  cashNotHandedOverOrders: number;
  byType: { trashTypeId: number; count: number }[];
  byCity: { cityId: number; count: number }[];
  couriers: { courierId: number; name: string; pickups: number; avgMinutes: number | null; avgRating: number | null }[];
  perDay: { day: string; count: number }[];
  washerPayouts: number;
  courierPay: number;
  margin: number;
  cashByCourier: { courier: { id: number; name: string }; amount: number; orders: number }[];
  byService: { service: "trash" | "carpet" | "curtain"; count: number }[];
  measurement: { courierId: number; name: string; orders: number; avgDiffPct: number }[];
}

type Svc = "all" | "trash" | "carpet" | "curtain";

export type OrderFilter = Record<string, string | number | undefined>;

export function AdminDashboard() {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const [period, setPeriod] = useState<Period>("today");
  const [svc, setSvc] = useState<Svc>("all");
  const q = useQuery<Dash>(`admin:dash:${period}:${svc}`, () => api.get(`/admin/dashboard?period=${period}&service=${svc}`), { refreshMs: 60_000 });
  const d = q.data;
  const range = d ? { dateFrom: d.fromDate, dateTo: d.toDate } : {};
  const open = (f: OrderFilter) => nav.push("a_orders", { filter: { ...range, ...f, ...(svc === "carpet" || svc === "curtain" ? { service: svc } : {}) } });

  return (
    <Page hasTabBar title={t("tab_dashboard")} actions={<IconButton icon="bell" label={t("bell_title")} badge={s.unread} onClick={() => nav.push("notifications")} />}>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {(["all", "trash", "carpet", "curtain"] as Svc[]).map((x) => (
          <Chip key={x} selected={svc === x} onClick={() => setSvc(x)}>
            {x === "all" ? t("all") : t(x === "trash" ? "svc_trash" : x === "carpet" ? "svc_carpet" : "svc_curtain")}
          </Chip>
        ))}
      </div>
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: "today", label: t("a_today") },
          { value: "week", label: t("a_week") },
          { value: "month", label: t("a_month") },
        ]}
      />
      {q.loading ? (
        <div className="mt-4"><SkeletonList n={4} h="h-24" /></div>
      ) : !d ? (
        <ErrorState text={t("err_network")} onRetry={q.refetch} retryLabel={t("retry")} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Tile label={t("a_orders")} value={d.orders.total} onClick={() => open({})} />
            <Tile label={t("a_completed")} value={d.orders.completed} tone="accent" onClick={() => open({ status: "completed" })} />
            <Tile label={t("a_pending")} value={d.orders.pending} tone="info" onClick={() => open({ status: "open,accepted,on_the_way" })} />
            <Tile label={t("st_cancelled")} value={d.orders.cancelled} tone="mute" onClick={() => open({ status: "cancelled,expired" })} />
          </div>

          <Card className="mt-3 border-2 border-warn/40 bg-warn-soft" onClick={() => nav.push("a_cash")}>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-warn">
              <Icon name="cash" size={18} /> {t("a_cash_out")}
            </p>
            <p className="money mt-1 text-[28px] font-extrabold text-warn">{t.som(d.cashNotHandedOver)}</p>
            <p className="text-[14px] text-ink/80">{d.cashNotHandedOverOrders} {t("pcs")}</p>
          </Card>

          <Section title={`${t("a_orders")} · ${dayMonth(d.fromDate, t.lang)} – ${dayMonth(d.toDate, t.lang)}`}>
            <Card>
              <div className="h-44" role="img" aria-label={d.perDay.map((x) => `${x.day}: ${x.count}`).join(", ")}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.perDay} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
                    <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 12, fill: "rgb(var(--c-hint))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "rgb(var(--c-hint))" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      cursor={{ fill: "rgb(var(--c-line) / .5)" }}
                      contentStyle={{ background: "rgb(var(--c-card))", border: "1px solid rgb(var(--c-line))", borderRadius: 12, color: "rgb(var(--c-ink))" }}
                      labelFormatter={(v) => dayMonth(String(v), t.lang)}
                      formatter={(v) => [String(v), t("a_orders")]}
                    />
                    <Bar dataKey="count" fill="rgb(var(--c-chart))" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Section>

          <Section title={`${t("a_revenue")} · ${t.som(d.revenueTotal)}`}>
            <Card>
              <Bars
                rows={(["cash", "click", "payme", "card"] as const).map((m) => ({ key: m, label: t(`pm_${m}`), value: d.revenue[m] ?? 0, display: t.som(d.revenue[m] ?? 0), onClick: () => open({ method: m }) }))}
              />
            </Card>
          </Section>

          {svc !== "trash" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MoneyTile label={t("a_washer_payouts")} value={t.som(d.washerPayouts)} />
              <MoneyTile label={t("a_courier_pay")} value={t.som(d.courierPay)} />
              <MoneyTile label={t("a_margin")} value={t.som(d.margin)} strong />
            </div>
          )}

          {d.byService.length > 1 && (
            <Section title={t("a_by_service")}>
              <Card>
                <Bars rows={d.byService.map((r) => ({ key: r.service, label: t(r.service === "trash" ? "svc_trash" : r.service === "carpet" ? "svc_carpet" : "svc_curtain"), value: r.count, display: String(r.count) }))} />
              </Card>
            </Section>
          )}

          <Section title={t("a_by_type")}>
            <Card>
              <Bars rows={d.byType.map((r) => {
                const tt = s.catalog.trashTypes.find((x) => x.id === r.trashTypeId);
                return { key: String(r.trashTypeId), label: tt ? t.name(tt) : `#${r.trashTypeId}`, value: r.count, display: String(r.count), onClick: () => open({ trashTypeId: r.trashTypeId }) };
              })} />
            </Card>
          </Section>

          <Section title={t("a_by_city")}>
            <Card>
              <Bars rows={d.byCity.map((r) => {
                const c = s.catalog.cities.find((x) => x.id === r.cityId);
                return { key: String(r.cityId), label: c ? t.name(c) : `#${r.cityId}`, value: r.count, display: String(r.count), onClick: () => open({ cityId: r.cityId }) };
              })} />
            </Card>
          </Section>

          <Section title={t("a_couriers")}>
            {d.couriers.length ? (
              <div className="card-hc overflow-hidden rounded-card bg-card">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[13px] uppercase text-hint">
                      <th className="px-3 py-2 font-semibold">{t("courier")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("a_pickups")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("a_avg_time")}</th>
                      <th className="px-3 py-2 text-right font-semibold">★</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.couriers.map((c) => (
                      <tr key={c.courierId} className="border-b border-line last:border-0 active:bg-line/40" onClick={() => open({ courierId: c.courierId, status: "completed" })}>
                        <td className="max-w-[120px] truncate px-3 py-2.5 font-medium">{c.name}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{c.pickups}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{c.avgMinutes != null ? `${Math.floor(c.avgMinutes / 60)}:${String(c.avgMinutes % 60).padStart(2, "0")}` : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.avgRating ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Card className="text-center text-hint">{t("a_no_data")}</Card>
            )}
          </Section>

          {d.cashByCourier.length > 0 && (
            <Section title={t("a_cash_by_courier")}>
              <Card onClick={() => nav.push("a_cash")}>
                <Bars rows={d.cashByCourier.map((c) => ({ key: String(c.courier.id), label: c.courier.name, value: c.amount, display: t.som(c.amount) }))} />
              </Card>
            </Section>
          )}

          {d.measurement.length > 0 && (
            <Section title={t("a_measure_acc")}>
              <div className="card-hc overflow-hidden rounded-card bg-card">
                <table className="w-full text-[15px]">
                  <tbody>
                    {d.measurement.map((m) => (
                      <tr key={m.courierId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2.5 font-medium">{m.name}</td>
                        <td className="px-2 py-2.5 text-right text-hint">{m.orders} {t("pcs")}</td>
                        <td className={cx("px-3 py-2.5 text-right font-semibold tabular-nums", m.avgDiffPct > 5 ? "text-danger" : "text-ink")}>
                          {m.avgDiffPct}% <span className="text-[13px] font-normal text-hint">{t("a_avg_diff")}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

function MoneyTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[13px] leading-4 text-hint">{label}</p>
      <p className={cx("mt-1 break-words text-[15px] leading-5 tabular-nums", strong ? "font-extrabold text-accent-ink" : "font-bold")}>{value}</p>
    </Card>
  );
}

function Tile({ label, value, tone, onClick }: { label: string; value: number; tone?: "accent" | "info" | "mute"; onClick: () => void }) {
  const cls = tone === "accent" ? "text-accent-ink" : tone === "info" ? "text-info" : tone === "mute" ? "text-mute" : "text-ink";
  return (
    <Card onClick={onClick} className="min-h-[88px]">
      <p className="text-[14px] font-medium text-hint">{label}</p>
      <p className={cx("mt-1 text-[30px] font-extrabold leading-9 tabular-nums", cls)}>{value}</p>
    </Card>
  );
}

/** Horizontal magnitude bars: one hue, labels in ink, value printed (never colour alone). */
function Bars({ rows }: { rows: { key: string; label: string; value: number; display: string; onClick?: () => void }[] }) {
  const t = useT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-center text-hint">{t("a_no_data")}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button onClick={r.onClick} className="block w-full text-left" title={`${r.label}: ${r.display}`}>
            <div className="flex justify-between gap-3 text-[15px]">
              <span className="font-medium">{r.label}</span>
              <span className="money font-semibold">{r.display}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-line/60">
              <div className="h-2 rounded-full bg-chart" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
