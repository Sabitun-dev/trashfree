// People: search, roles, courier cities, block, invite links, deletion requests, manual subscription.
import { useState } from "react";
import { localName, type Role } from "@domain/types";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dateTime, phoneDisplay } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { confirmDialog, openLink } from "../../lib/tg";
import type { Plan } from "../../lib/types";
import { Badge, Button, Card, Chip, EmptyState, ErrorState, inputCls, Row, RowGroup, Section, Skeleton, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet, useToast } from "../../ui/overlays";
import { StatusBadge } from "../../ui/status";
import type { OrderStatus } from "@domain/types";

interface PersonRow {
  id: number;
  name: string;
  username: string | null;
  phone: string | null;
  role: Role;
  blocked: boolean;
  cityIds: number[];
  orders: number;
  deletionRequested: boolean;
}

export function AdminPeople() {
  const t = useT();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [invite, setInvite] = useState(false);
  const list = useQuery<PersonRow[]>(`admin:people:${q}:${role}`, () => api.get(`/admin/people?q=${encodeURIComponent(q)}${role ? `&role=${role}` : ""}`));
  const deletions = useQuery<{ id: number; name: string; phone: string | null; requestedAt: string }[]>("admin:deletions", () => api.get("/admin/people/deletion-requests"));

  return (
    <Page hasTabBar title={t("tab_people")} actions={<Button size="md" variant="secondary" icon="link" onClick={() => setInvite(true)}>{t("a_invite")}</Button>}>
      <input className={inputCls} placeholder={t("a_people_ph")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {(["", "customer", "courier", "admin"] as const).map((r) => (
          <Chip key={r} selected={role === r} onClick={() => setRole(r)}>
            {r ? t(`mode_${r}`) : t("all")}
          </Chip>
        ))}
      </div>

      {!!deletions.data?.length && (
        <Section title={t("a_deletion_requests")}>
          <RowGroup>
            {deletions.data.map((d) => (
              <Row key={d.id} icon="trash" label={d.name} sub={`${phoneDisplay(d.phone)} · ${dateTime(d.requestedAt, t.lang)}`} onClick={() => nav.push("a_person", { id: d.id })} />
            ))}
          </RowGroup>
        </Section>
      )}

      <Section>
        {list.loading ? (
          <SkeletonList n={6} h="h-14" />
        ) : list.error ? (
          <ErrorState text={t("err_network")} onRetry={list.refetch} retryLabel={t("retry")} />
        ) : !list.data?.length ? (
          <EmptyState icon="users" title={t("a_no_data")} />
        ) : (
          <RowGroup>
            {list.data.map((p) => (
              <Row
                key={p.id}
                label={
                  <span className="flex items-center gap-2">
                    {p.name}
                    {p.blocked && <Badge tone="mute">{t("a_blocked")}</Badge>}
                  </span>
                }
                sub={`${p.phone ? phoneDisplay(p.phone) : p.username ? "@" + p.username : "—"} · ${t(`mode_${p.role === "owner" ? "admin" : p.role}`)} · ${p.orders}`}
                onClick={() => nav.push("a_person", { id: p.id })}
              />
            ))}
          </RowGroup>
        )}
      </Section>
      <InviteSheet open={invite} onClose={() => setInvite(false)} />
    </Page>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const [cities, setCities] = useState<number[]>([]);
  const [services, setServices] = useState<SvcCode[]>(["trash"]);
  const [link, setLink] = useState<string | null>(null);
  async function create() {
    try {
      const r = await api.post<{ link: string }>("/admin/invites", { cityIds: cities, services });
      setLink(r.link);
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    }
  }
  return (
    <BottomSheet open={open} onClose={() => { onClose(); setLink(null); }} title={t("a_invite")}>
      <p className="mb-2 text-hint">{t("a_cities")}</p>
      <div className="flex flex-wrap gap-2">
        {s.catalog.cities.map((c) => (
          <Chip key={c.id} selected={cities.includes(c.id)} onClick={() => setCities((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
            {t.name(c)}
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-4 text-hint">{t("a_services")}</p>
      <ServiceChips value={services} onChange={setServices} />
      {link ? (
        <Card className="mt-4 bg-accent-soft">
          <p className="break-all font-mono text-[14px]">{link}</p>
          <p className="mt-1 text-[14px] text-hint">{t("a_invite_link")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(link); toast(t("copied")); }}>{t("copy")}</Button>
            <Button onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`)}>{t("open")}</Button>
          </div>
        </Card>
      ) : (
        <Button block className="mt-4" disabled={!cities.length || !services.length} onClick={create}>{t("a_invite_create")}</Button>
      )}
    </BottomSheet>
  );
}

interface PersonDetail extends PersonRow {
  services: SvcCode[];
  language: string;
  blockedReason: string | null;
  botBlocked: boolean;
  createdAt: string;
  orders: never;
  completedAsCourier: number;
  subscriptions: { id: number; plan: Plan; status: string; left: number; periodEnd: string | null }[];
}

export function AdminPerson({ id }: { id: number }) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const s = useSession();
  const q = useQuery<Omit<PersonDetail, "orders"> & { orders: { id: string; number: number; status: OrderStatus; priceTotal: number; createdAt: string }[] }>(`admin:person:${id}`, () => api.get(`/admin/people/${id}`));
  const [sheet, setSheet] = useState<"courier" | "sub" | null>(null);
  const [cities, setCities] = useState<number[]>([]);
  const [services, setServices] = useState<SvcCode[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const p = q.data;
  if (q.loading) return <Page><Skeleton className="h-80" /></Page>;
  if (!p) return <Page><ErrorState text={errorText(t, q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;
  const isOwner = s.me.role === "owner";

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      toast(t("saved"));
      setSheet(null);
      invalidate("admin:");
      void q.refetch();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    }
  }

  return (
    <Page title={p.name}>
      <Card>
        <p className="text-hint">{p.phone ? phoneDisplay(p.phone) : "—"}{p.username ? ` · @${p.username}` : ""}</p>
        <p className="mt-1">
          {t("a_role")}: <b>{t(`mode_${p.role === "owner" ? "admin" : p.role}`)}{p.role === "owner" ? " ★" : ""}</b>
        </p>
        {p.cityIds.length > 0 && <p className="text-[15px] text-hint">{p.cityIds.map((c) => s.catalog.cities.find((x) => x.id === c)).filter(Boolean).map((c) => t.name(c!)).join(", ")}</p>}
        {p.role === "courier" && p.services.length > 0 && <p className="text-[15px] text-hint">{p.services.map((x) => t(SVC_LABEL[x])).join(", ")}</p>}
        {p.blocked && <p className="mt-1 font-semibold text-danger">{t("a_blocked")}{p.blockedReason ? `: ${p.blockedReason}` : ""}</p>}
        {p.completedAsCourier > 0 && <p className="text-[15px] text-hint">🚚 {p.completedAsCourier} {t("a_pickups")}</p>}
      </Card>

      {p.role !== "owner" && (
        <Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="truck" onClick={() => { setCities(p.cityIds); setServices(p.services.length ? p.services : ["trash"]); setSheet("courier"); }}>{p.role === "courier" ? t("a_cities") : t("a_make_courier")}</Button>
            {p.role !== "customer" && (p.role !== "admin" || isOwner) && (
              <Button variant="outline" onClick={() => act(() => api.post(`/admin/people/${id}/role`, { role: "customer", cityIds: [] }))}>{t("a_make_customer")}</Button>
            )}
            {isOwner && p.role !== "admin" && <Button variant="outline" icon="shield" onClick={() => act(() => api.post(`/admin/people/${id}/role`, { role: "admin" }))}>{t("a_make_admin")}</Button>}
            <Button variant="outline" icon="crown" onClick={() => setSheet("sub")}>{t("a_paid_manual")}</Button>
            {(p.role !== "admin" || isOwner) && (
              <Button variant={p.blocked ? "secondary" : "danger"} icon="ban" onClick={() => act(() => api.post(`/admin/people/${id}/block`, { blocked: !p.blocked }))}>
                {p.blocked ? t("a_unblock") : t("a_block")}
              </Button>
            )}
          </div>
          {p.deletionRequested && (
            <Button
              block
              variant="danger"
              className="mt-3"
              icon="trash"
              onClick={async () => {
                if (await confirmDialog(`${t("a_confirm_delete")}: ${p.name}?`)) await act(async () => { await api.post(`/admin/people/${id}/erase`); nav.back(); });
              }}
            >
              {t("a_confirm_delete")}
            </Button>
          )}
        </Section>
      )}

      {p.subscriptions.length > 0 && (
        <Section title={t("plans_title")}>
          <RowGroup>
            {p.subscriptions.map((x) => (
              <Row key={x.id} icon="crown" label={localName(x.plan, t.lang)} sub={`${x.status} · ${x.left}`} />
            ))}
          </RowGroup>
        </Section>
      )}

      <Section title={t("a_user_orders")}>
        {p.orders.length ? (
          <RowGroup>
            {p.orders.map((o) => (
              <Row key={o.id} label={`#${o.number} · ${t.som(o.priceTotal)}`} sub={dateTime(o.createdAt, t.lang)} right={<StatusBadge status={o.status} />} onClick={() => nav.push("a_order", { id: o.id })} />
            ))}
          </RowGroup>
        ) : (
          <Card className="text-center text-hint">{t("a_no_data")}</Card>
        )}
      </Section>

      <BottomSheet open={sheet === "courier"} onClose={() => setSheet(null)} title={t("mode_courier")}>
        <p className="mb-2 text-hint">{t("a_cities")}</p>
        <div className="flex flex-wrap gap-2">
          {s.catalog.cities.map((c) => (
            <Chip key={c.id} selected={cities.includes(c.id)} onClick={() => setCities((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
              {t.name(c)}
            </Chip>
          ))}
        </div>
        <p className="mb-2 mt-4 text-hint">{t("a_services")}</p>
        <ServiceChips value={services} onChange={setServices} />
        <Button
          block
          className="mt-4"
          disabled={!cities.length || !services.length}
          onClick={() =>
            act(async () => {
              await api.post(`/admin/people/${id}/role`, { role: p.role === "admin" ? "admin" : "courier", cityIds: cities });
              await api.post(`/admin/people/${id}/services`, { services });
            })
          }
        >
          {t("save")}
        </Button>
      </BottomSheet>

      <BottomSheet open={sheet === "sub"} onClose={() => setSheet(null)} title={t("a_paid_manual")}>
        <div className="flex flex-wrap gap-2">
          {s.catalog.plans.map((pl) => (
            <Chip key={pl.id} selected={planId === pl.id} onClick={() => setPlanId(pl.id)}>
              {t.name(pl)} · {t.som(pl.price)}
            </Chip>
          ))}
        </div>
        <textarea className={inputCls + " mt-3 min-h-[70px]"} placeholder={t("a_reason_ph")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button block className="mt-3" disabled={!planId || note.trim().length < 2} onClick={() => act(() => api.post(`/admin/people/${id}/subscription`, { planId, note }))}>
          {t("save")}
        </Button>
      </BottomSheet>
    </Page>
  );
}

type SvcCode = "trash" | "carpet" | "curtain";
const SVC_LABEL = { trash: "svc_trash", carpet: "svc_carpet", curtain: "svc_curtain" } as const;

/** Which services a courier handles. */
function ServiceChips({ value, onChange }: { value: SvcCode[]; onChange: (v: SvcCode[]) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {(["trash", "carpet", "curtain"] as const).map((c) => (
        <Chip key={c} selected={value.includes(c)} onClick={() => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])}>
          {t(SVC_LABEL[c])}
        </Chip>
      ))}
    </div>
  );
}
