// More: broadcasts, cash handovers, audit log, settings.
import { useEffect, useState } from "react";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { dateTime, phoneDisplay } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { confirmDialog } from "../../lib/tg";
import { Button, Card, Chip, EmptyState, Field, inputCls, Row, RowGroup, Section, SkeletonList, Toggle } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";

export function AdminMore() {
  const t = useT();
  const nav = useNav();
  return (
    <Page hasTabBar title={t("more")}>
      <RowGroup>
        <Row icon="box" label={t("a_services")} onClick={() => nav.push("a_services")} />
        <Row icon="megaphone" label={t("a_broadcast")} onClick={() => nav.push("a_broadcast")} />
        <Row icon="cash" label={t("a_cash")} onClick={() => nav.push("a_cash")} />
        <Row icon="clipboard" label={t("a_audit")} onClick={() => nav.push("a_audit")} />
        <Row icon="settings" label={t("a_settings")} onClick={() => nav.push("a_settings")} />
      </RowGroup>
      <Section>
        <RowGroup>
          <Row icon="user" label={t("profile")} onClick={() => nav.push("profile")} />
        </RowGroup>
      </Section>
    </Page>
  );
}

// ---------- Broadcast ----------
interface BroadcastRow {
  id: number;
  title: string;
  audience: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  createdAt: string;
}

export function AdminBroadcast() {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ title: "", text: "", button: "home" as string | null, audience: "all" as "all" | "customers" | "couriers" | "city", cityId: null as number | null });
  const [count, setCount] = useState<number | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const history = useQuery<BroadcastRow[]>("admin:broadcasts", () => api.get("/admin/broadcasts"), { refreshMs: 5000 });
  const valid = form.title.trim() && form.text.trim() && (form.audience !== "city" || form.cityId);

  useEffect(() => {
    setPreviewed(false);
    if (!valid) return setCount(null);
    const id = setTimeout(() => api.post<{ count: number }>("/admin/broadcasts/count", form).then((r) => setCount(r.count)).catch(() => {}), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, form.text, form.audience, form.cityId, form.button]);

  async function run(path: string) {
    setBusy(true);
    try {
      if (path === "send" && !(await confirmDialog(t("a_bc_send", { n: count ?? 0 })))) return;
      await api.post(`/admin/broadcasts${path === "preview" ? "/preview" : ""}`, form);
      if (path === "preview") {
        setPreviewed(true);
        toast(t("a_bc_preview_sent"));
      } else {
        toast(t("a_bc_sending"));
        setForm({ ...form, title: "", text: "" });
        invalidate("admin:broadcasts");
      }
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t("a_broadcast")} hasMainButton>
      <div className="space-y-3">
        <Field label={t("a_bc_title")}><input className={inputCls} maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t("a_bc_text")}><textarea className={inputCls + " min-h-[120px]"} maxLength={3500} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
        <Field label={t("a_bc_button")}>
          <div className="flex flex-wrap gap-2">
            {([[null, t("a_bc_none")], ["home", t("tab_home")], ["new_order", t("big_order")], ["plans", t("plans_title")], ["courier", t("mode_courier")]] as [string | null, string][]).map(([v, l]) => (
              <Chip key={String(v)} selected={form.button === v} onClick={() => setForm({ ...form, button: v })}>{l}</Chip>
            ))}
          </div>
        </Field>
        <Field label={t("a_bc_audience")}>
          <div className="flex flex-wrap gap-2">
            {(["all", "customers", "couriers", "city"] as const).map((a) => (
              <Chip key={a} selected={form.audience === a} onClick={() => setForm({ ...form, audience: a })}>{t(`a_aud_${a}`)}</Chip>
            ))}
          </div>
          {form.audience === "city" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {s.catalog.cities.map((c) => <Chip key={c.id} selected={form.cityId === c.id} onClick={() => setForm({ ...form, cityId: c.id })}>{t.name(c)}</Chip>)}
            </div>
          )}
        </Field>
        <Button block variant="secondary" icon="nav" disabled={!valid} loading={busy && !previewed} onClick={() => run("preview")}>{t("a_bc_preview")}</Button>
      </div>

      <Section title={t("a_bc_history")}>
        {!history.data?.length ? (
          <Card className="text-center text-hint">{t("a_no_data")}</Card>
        ) : (
          <RowGroup>
            {history.data.map((b) => (
              <Row key={b.id} icon="megaphone" label={b.title} sub={`${dateTime(b.createdAt, t.lang)} · ${t(`a_aud_${b.audience}` as "a_aud_all")} · ${b.status === "done" ? t("a_bc_report", { sent: b.sent, failed: b.failed, blocked: b.blocked }) : `${t("a_bc_sending")} ${b.sent + b.failed + b.blocked}/${b.total}`}`} />
            ))}
          </RowGroup>
        )}
      </Section>
      <MainButton text={count ? t("a_bc_send", { n: count }) : t("rate_send")} disabled={!valid || !previewed || !count} loading={busy && previewed} onClick={() => run("send")} />
    </Page>
  );
}

// ---------- Cash handovers ----------
interface CashData {
  outstanding: { courier: { id: number; name: string; phone: string | null }; amount: number; orders: number }[];
  history: { id: number; amount: number; createdAt: string; courier: { name: string }; confirmedBy: { name: string }; _count: { orders: number } }[];
}

export function AdminCash() {
  const t = useT();
  const toast = useToast();
  const q = useQuery<CashData>("admin:cash", () => api.get("/admin/cash"), { refreshMs: 30_000 });
  async function confirm(c: CashData["outstanding"][number]) {
    if (!(await confirmDialog(t("a_cash_confirm_q", { name: c.courier.name, total: t.som(c.amount) })))) return;
    try {
      await api.post(`/admin/cash/${c.courier.id}/confirm`, { amount: c.amount });
      toast(t("a_cash_confirm"));
      invalidate("admin:");
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
      void q.refetch();
    }
  }
  return (
    <Page title={t("a_cash")}>
      {q.loading ? (
        <SkeletonList n={3} h="h-24" />
      ) : !q.data?.outstanding.length ? (
        <EmptyState icon="cash" title={t("a_cash_none")} />
      ) : (
        <div className="space-y-3">
          {q.data.outstanding.map((c) => (
            <Card key={c.courier.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.courier.name}</p>
                  <p className="text-[14px] text-hint">{phoneDisplay(c.courier.phone)} · {c.orders} {t("pcs")}</p>
                </div>
                <p className="money text-[22px] font-extrabold text-warn">{t.som(c.amount)}</p>
              </div>
              <Button block className="mt-3" icon="check" onClick={() => confirm(c)}>{t("a_cash_confirm")}</Button>
            </Card>
          ))}
        </div>
      )}
      <Section title={t("a_handovers")}>
        {q.data?.history.length ? (
          <RowGroup>
            {q.data.history.map((h) => (
              <Row key={h.id} icon="check" label={`${h.courier.name} · ${t.som(h.amount)}`} sub={`${dateTime(h.createdAt, t.lang)} · ${h.confirmedBy.name} · ${h._count.orders} ${t("pcs")}`} />
            ))}
          </RowGroup>
        ) : (
          <Card className="text-center text-hint">{t("a_no_data")}</Card>
        )}
      </Section>
    </Page>
  );
}

// ---------- Audit ----------
interface AuditRow {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

export function AdminAudit() {
  const t = useT();
  const q = useQuery<{ items: AuditRow[]; next: number | null }>("admin:audit", () => api.get("/admin/audit"));
  const [more, setMore] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const cursor = next === undefined ? q.data?.next : next;
  const items = [...(q.data?.items ?? []), ...more];
  return (
    <Page title={t("a_audit")}>
      {q.loading ? (
        <SkeletonList n={6} h="h-14" />
      ) : (
        <div className="card-hc divide-y divide-line overflow-hidden rounded-card bg-card">
          {items.map((a) => (
            <button key={a.id} className="block w-full px-4 py-3 text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <p className="font-medium">{a.action}{a.entityId ? ` · ${a.entity} ${a.entityId}` : ""}</p>
              <p className="text-[14px] text-hint">{dateTime(a.createdAt, t.lang)} · {a.actorName}{a.reason ? ` · ${a.reason}` : ""}</p>
              {open === a.id && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-line/40 p-2 text-[12px]">
                  {JSON.stringify({ before: a.before, after: a.after }, null, 1)}
                </pre>
              )}
            </button>
          ))}
        </div>
      )}
      {cursor && (
        <Button
          block
          variant="outline"
          className="mt-3"
          onClick={async () => {
            const r = await api.get<{ items: AuditRow[]; next: number | null }>(`/admin/audit?cursor=${cursor}`);
            setMore((m) => [...m, ...r.items]);
            setNext(r.next);
          }}
        >
          {t("more")}
        </Button>
      )}
    </Page>
  );
}

// ---------- Settings ----------
type Settings = {
  orderLimitPerHour: number;
  maxQuantity: number;
  maxPhotos: number;
  slotCutoffMinutes: number;
  bookingDaysAhead: number;
  paymentTimeoutMinutes: number;
  methods: Record<string, boolean>;
  cardProvider: "payme" | "click";
  paymentMode: { click: "telegram" | "merchant"; payme: "telegram" | "merchant" };
  telegramFiscalData: boolean;
  paymeTestMode: boolean;
  ipAllowlistEnabled: boolean;
  ipAllowlist: { payme: string[]; click: string[] };
  retention: { photosDays: number; supportDays: number; archiveMonths: number };
  subscriptionReminderDays: number;
  prioritySlotsForSubscribers: boolean;
  supportPhone: string;
};

export function AdminSettings() {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const q = useQuery<Settings>("admin:settings", () => api.get("/admin/settings"));
  const [v, setV] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  if (!v) return <Page><SkeletonList n={5} /></Page>;
  const num = (key: keyof Settings, label: string) => (
    <Field key={key} label={label}>
      <input inputMode="numeric" className={inputCls} value={String(v[key])} onChange={(e) => setV({ ...v, [key]: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
    </Field>
  );
  async function save() {
    setBusy(true);
    try {
      setV(await api.put<Settings>("/admin/settings", v));
      toast(t("a_settings_saved"));
      invalidate("admin:settings");
      void s.refresh();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={t("a_settings")} hasMainButton>
      <Section title={t("a_methods")} className="mt-0">
        <RowGroup>
          {(["subscription", "cash", "click", "payme", "card"] as const).map((m) => (
            <Row key={m} label={t(`pm_${m}`)} right={<Toggle label={m} checked={!!v.methods[m]} onChange={(x) => setV({ ...v, methods: { ...v.methods, [m]: x } })} />} />
          ))}
        </RowGroup>
      </Section>
      <Section title={t("a_payment_modes")}>
        <Card className="space-y-3">
          {(["click", "payme"] as const).map((p) => (
            <div key={p}>
              <p className="mb-1 font-semibold">{t(`pm_${p}`)}</p>
              <div className="flex gap-2">
                {(["telegram", "merchant"] as const).map((m) => (
                  <Chip key={m} className="flex-1" selected={v.paymentMode[p] === m} onClick={() => setV({ ...v, paymentMode: { ...v.paymentMode, [p]: m } })}>{t(`a_mode_${m}`)}</Chip>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-1 font-semibold">{t("a_card_provider")}</p>
            <div className="flex gap-2">
              {(["payme", "click"] as const).map((p) => <Chip key={p} className="flex-1" selected={v.cardProvider === p} onClick={() => setV({ ...v, cardProvider: p })}>{t(`pm_${p}`)}</Chip>)}
            </div>
          </div>
        </Card>
        <div className="mt-3">
          <RowGroup>
            <Row label="Fiscal data (IKPU) → Telegram invoice" right={<Toggle label="fiscal" checked={v.telegramFiscalData} onChange={(x) => setV({ ...v, telegramFiscalData: x })} />} />
            <Row label="Payme sandbox (test)" right={<Toggle label="test" checked={v.paymeTestMode} onChange={(x) => setV({ ...v, paymeTestMode: x })} />} />
            <Row label="IP allow-list" right={<Toggle label="ip" checked={v.ipAllowlistEnabled} onChange={(x) => setV({ ...v, ipAllowlistEnabled: x })} />} />
          </RowGroup>
        </div>
        {v.ipAllowlistEnabled && (
          <div className="mt-3 space-y-3">
            {(["payme", "click"] as const).map((p) => (
              <Field key={p} label={`${t(`pm_${p}`)} IP`}>
                <textarea className={inputCls + " min-h-[70px] font-mono text-[14px]"} value={v.ipAllowlist[p].join("\n")} onChange={(e) => setV({ ...v, ipAllowlist: { ...v.ipAllowlist, [p]: e.target.value.split(/\s+/).filter(Boolean) } })} />
              </Field>
            ))}
          </div>
        )}
      </Section>
      <Section title={t("a_limits")}>
        <div className="grid grid-cols-2 gap-3">
          {num("orderLimitPerHour", t("a_order_limit"))}
          {num("maxQuantity", t("a_max_qty"))}
          {num("slotCutoffMinutes", t("a_cutoff"))}
          {num("bookingDaysAhead", t("a_days_ahead"))}
          {num("paymentTimeoutMinutes", t("a_pay_timeout"))}
          {num("subscriptionReminderDays", t("n_sub_expiring", { days: "N" }))}
        </div>
        <div className="mt-3">
          <RowGroup>
            <Row label={t("a_priority")} right={<Toggle label="priority" checked={v.prioritySlotsForSubscribers} onChange={(x) => setV({ ...v, prioritySlotsForSubscribers: x })} />} />
          </RowGroup>
        </div>
      </Section>
      <Section title={t("a_retention")}>
        <div className="grid grid-cols-3 gap-2">
          {(["photosDays", "supportDays", "archiveMonths"] as const).map((k) => (
            <Field key={k} label={t(k === "photosDays" ? "a_photos_days" : k === "supportDays" ? "a_support_days" : "a_archive_months")}>
              <input inputMode="numeric" className={inputCls} value={v.retention[k]} onChange={(e) => setV({ ...v, retention: { ...v.retention, [k]: Number(e.target.value.replace(/\D/g, "")) || 1 } })} />
            </Field>
          ))}
        </div>
      </Section>
      <Section>
        <Field label={t("a_support_phone")}>
          <input className={inputCls} value={v.supportPhone} onChange={(e) => setV({ ...v, supportPhone: e.target.value })} />
        </Field>
      </Section>
      <MainButton text={t("save")} loading={busy} onClick={save} />
    </Page>
  );
}
