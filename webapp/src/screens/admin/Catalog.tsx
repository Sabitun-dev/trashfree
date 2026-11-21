// Catalog: prices, package sizes, time slots, cities (centre + radius on a map), trash types (3 names + IKPU), plans.
import { useEffect, useState } from "react";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import type { DictKey } from "../../i18n/uz";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import type { Bootstrap } from "../../lib/types";
import { MapPicker } from "../../components/Maps";
import { Badge, Button, Card, Chip, Field, inputCls, Row, RowGroup, Section, SkeletonList, Toggle } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet, useToast } from "../../ui/overlays";

type Catalog = Bootstrap["catalog"];
type EntityKey = "trash-types" | "package-sizes" | "slots" | "cities" | "plans";
type FieldDef = { key: string; label: DictKey | string; kind: "text" | "number" | "bool" | "time" | "map" | "icon" | "nullableNumber"; createOnly?: boolean };

const names: FieldDef[] = [
  { key: "nameUz", label: "a_name_uz", kind: "text" },
  { key: "nameRu", label: "a_name_ru", kind: "text" },
  { key: "nameEn", label: "a_name_en", kind: "text" },
];
const code: FieldDef = { key: "code", label: "a_code", kind: "text", createOnly: true };
const common: FieldDef[] = [
  { key: "sort", label: "#", kind: "number" },
  { key: "active", label: "a_active", kind: "bool" },
];

const ENTITIES: Record<EntityKey, { title: DictKey; list: keyof Catalog; fields: FieldDef[]; blank: Record<string, unknown> }> = {
  "trash-types": {
    title: "a_types",
    list: "trashTypes",
    fields: [code, ...names, { key: "icon", label: "Icon", kind: "icon" }, { key: "ikpu", label: "a_ikpu", kind: "text" }, { key: "packageCode", label: "a_package_code", kind: "text" }, { key: "vatPercent", label: "VAT %", kind: "number" }, ...common],
    blank: { code: "", nameUz: "", nameRu: "", nameEn: "", icon: "other", ikpu: "", packageCode: "", vatPercent: 0, sort: 0, active: true },
  },
  "package-sizes": {
    title: "a_sizes",
    list: "packageSizes",
    fields: [code, ...names, { key: "liters", label: "L", kind: "number" }, ...common],
    blank: { code: "", nameUz: "", nameRu: "", nameEn: "", liters: 60, sort: 0, active: true },
  },
  slots: {
    title: "a_slots",
    list: "slots",
    fields: [
      { key: "startMinute", label: "a_from", kind: "time" },
      { key: "endMinute", label: "a_to", kind: "time" },
      { key: "capacity", label: "a_capacity", kind: "nullableNumber" },
      { key: "priority", label: "a_priority", kind: "bool" },
      { key: "active", label: "a_active", kind: "bool" },
    ],
    blank: { startMinute: 540, endMinute: 660, capacity: null, priority: false, active: true },
  },
  cities: {
    title: "a_cities",
    list: "cities",
    fields: [code, ...names, { key: "center", label: "a_center_hint", kind: "map" }, { key: "radiusKm", label: "a_radius", kind: "number" }, ...common],
    blank: { code: "", nameUz: "", nameRu: "", nameEn: "", centerLat: 41.3111, centerLng: 69.2797, radiusKm: 20, sort: 0, active: true },
  },
  plans: {
    title: "a_plans",
    list: "plans",
    fields: [code, ...names, { key: "pickups", label: "a_pickups_n", kind: "number" }, { key: "price", label: "a_plan_price", kind: "number" }, { key: "durationDays", label: "days", kind: "number" }, ...common],
    blank: { code: "", nameUz: "", nameRu: "", nameEn: "", pickups: 4, price: 0, durationDays: 30, sort: 0, active: true },
  },
};

const useAdminCatalog = () => useQuery<Catalog>("admin:catalog", () => api.get("/admin/catalog"));

export function AdminCatalog() {
  const t = useT();
  const nav = useNav();
  return (
    <Page hasTabBar title={t("tab_catalog")}>
      <RowGroup>
        <Row icon="wallet" label={t("a_prices")} onClick={() => nav.push("a_prices")} />
        <Row icon="trash" label={t("a_types")} onClick={() => nav.push("a_entities", { entity: "trash-types" })} />
        <Row icon="bag" label={t("a_sizes")} onClick={() => nav.push("a_entities", { entity: "package-sizes" })} />
        <Row icon="clock" label={t("a_slots")} onClick={() => nav.push("a_entities", { entity: "slots" })} />
        <Row icon="map" label={t("a_cities")} onClick={() => nav.push("a_entities", { entity: "cities" })} />
        <Row icon="crown" label={t("a_plans")} onClick={() => nav.push("a_entities", { entity: "plans" })} />
      </RowGroup>
      <Section>
        <RowGroup>
          <Row icon="settings" label={t("a_settings")} onClick={() => nav.push("a_settings")} />
        </RowGroup>
      </Section>
    </Page>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function AdminEntities({ entity }: { entity: EntityKey }) {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const cfg = ENTITIES[entity];
  const q = useAdminCatalog();
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (l: string) => (t.has(l) ? t(l) : l);
  const items = (q.data?.[cfg.list] ?? []) as unknown as Record<string, unknown>[];

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const { id, ...data } = edit;
      for (const k of ["prices", "couriers", "orders", "subscriptions"]) delete (data as Record<string, unknown>)[k];
      await api.post(`/admin/catalog/${entity}${id ? `/${id}` : ""}`, data);
      toast(t("saved"));
      setEdit(null);
      invalidate("admin:catalog");
      void s.refresh();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  const title = (x: Record<string, unknown>) => (entity === "slots" ? formatSlot(x.startMinute as number, x.endMinute as number) : t.name(x as never));
  const sub = (x: Record<string, unknown>) =>
    entity === "slots" ? `${t("a_capacity")}: ${x.capacity ?? t("a_unlimited")}${x.priority ? ` · ${t("a_priority")}` : ""}` : entity === "plans" ? `${x.pickups} · ${t.som(x.price as number)}` : entity === "cities" ? `${x.radiusKm} km` : entity === "trash-types" ? `${x.code}${x.ikpu ? ` · IKPU ${x.ikpu}` : ""}` : String(x.code ?? "");

  return (
    <Page title={t(cfg.title)} actions={<Button size="md" icon="plus" variant="secondary" onClick={() => setEdit({ ...cfg.blank })}>{t("add")}</Button>}>
      {q.loading ? (
        <SkeletonList n={4} h="h-14" />
      ) : (
        <RowGroup>
          {items.map((x) => (
            <Row key={x.id as number} label={<span className="flex items-center gap-2">{title(x)}{!x.active && <Badge tone="mute">off</Badge>}</span>} sub={sub(x)} onClick={() => setEdit({ ...x })} />
          ))}
        </RowGroup>
      )}

      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("edit") : t("add")}>
        {edit && (
          <div className="space-y-3">
            {cfg.fields.map((f) => {
              const v = edit[f.key];
              const set = (val: unknown) => setEdit({ ...edit, [f.key]: val });
              if (f.kind === "bool") return <Row key={f.key} label={label(f.label)} right={<Toggle checked={!!v} onChange={set} label={label(f.label)} />} />;
              if (f.kind === "time") return <Field key={f.key} label={label(f.label)}><input type="time" step={1800} className={inputCls} value={hhmm(Number(v ?? 0))} onChange={(e) => set(toMin(e.target.value))} /></Field>;
              if (f.kind === "icon") {
                return (
                  <Field key={f.key} label="Icon">
                    <div className="flex flex-wrap gap-2">
                      {["household", "non_residential", "construction", "other"].map((i) => <Chip key={i} selected={v === i} onClick={() => set(i)}>{i}</Chip>)}
                    </div>
                  </Field>
                );
              }
              if (f.kind === "map") {
                return (
                  <Field key={f.key} label={label(f.label)}>
                    <MapPicker className="h-56" center={{ lat: Number(edit.centerLat), lng: Number(edit.centerLng) }} onMove={(p) => setEdit((e) => ({ ...e!, centerLat: p.lat, centerLng: p.lng }))} />
                  </Field>
                );
              }
              const disabled = f.createOnly && !!edit.id;
              return (
                <Field key={f.key} label={label(f.label)}>
                  <input
                    className={inputCls + (disabled ? " opacity-60" : "")}
                    disabled={disabled}
                    inputMode={f.kind === "text" ? undefined : "numeric"}
                    value={v == null ? "" : String(v)}
                    placeholder={f.kind === "nullableNumber" ? t("a_unlimited") : undefined}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (f.kind === "text") set(raw);
                      else if (f.kind === "nullableNumber") set(raw === "" ? null : Number(raw.replace(/\D/g, "")));
                      else set(Number(raw.replace(/[^\d.]/g, "")) || 0);
                    }}
                  />
                </Field>
              );
            })}
            <Button block size="xl" loading={busy} onClick={save}>{t("save")}</Button>
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}

export function AdminPrices() {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const q = useAdminCatalog();
  const [rows, setRows] = useState<Record<string, { firstPrice: number; extraPrice: number }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    const m: Record<string, { firstPrice: number; extraPrice: number }> = {};
    for (const p of q.data.prices) m[`${p.trashTypeId}:${p.packageSizeId}`] = { firstPrice: p.firstPrice, extraPrice: p.extraPrice };
    setRows(m);
  }, [q.data]);
  if (!q.data) return <Page><SkeletonList n={4} /></Page>;
  const cat = q.data;

  async function save() {
    setBusy(true);
    try {
      const list = Object.entries(rows).map(([k, v]) => {
        const [trashTypeId, packageSizeId] = k.split(":").map(Number);
        return { trashTypeId, packageSizeId, ...v };
      });
      await api.put("/admin/prices", list);
      toast(t("saved"));
      invalidate("admin:catalog");
      void s.refresh();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t("a_prices")} hasMainButton>
      {cat.trashTypes.map((tt) => (
        <Section key={tt.id} title={t.name(tt)}>
          <Card className="space-y-3">
            {cat.packageSizes.map((ps) => {
              const k = `${tt.id}:${ps.id}`;
              const r = rows[k] ?? { firstPrice: 0, extraPrice: 0 };
              const set = (field: "firstPrice" | "extraPrice", v: string) => setRows({ ...rows, [k]: { ...r, [field]: Number(v.replace(/\D/g, "")) || 0 } });
              return (
                <div key={ps.id}>
                  <p className="mb-1 font-semibold">{t.name(ps)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[13px] text-hint">{t("a_first_price")}<input inputMode="numeric" className={inputCls} value={r.firstPrice} onChange={(e) => set("firstPrice", e.target.value)} /></label>
                    <label className="text-[13px] text-hint">{t("a_extra_price")}<input inputMode="numeric" className={inputCls} value={r.extraPrice} onChange={(e) => set("extraPrice", e.target.value)} /></label>
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      ))}
      <MainButton text={t("save")} loading={busy} onClick={save} />
    </Page>
  );
}
