// Admin → Xizmatlar: switch trash pickup, carpet washing and curtain washing on/off (audit-logged).
import { useEffect, useState } from "react";
import { addDays, tashkentDate, tashkentInstant } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useSession } from "../../lib/session";
import { Icon } from "../../ui/Icon";
import { Button, Card, Chip, cx, Field, inputCls, SkeletonList, Toggle } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";

type Code = "trash" | "carpet" | "curtain";
interface Svc {
  code: Code;
  enabled: boolean;
  showWhenOff: boolean;
  offMessage: string | null;
  offUntil: string | null;
}

const LABEL = { trash: "svc_trash", carpet: "svc_carpet", curtain: "svc_curtain" } as const;
const ICON = { trash: "trash", carpet: "carpet", curtain: "curtain" } as const;

export function AdminServices() {
  const t = useT();
  const q = useQuery<Svc[]>("admin:services", () => api.get("/admin/services"));
  return (
    <Page title={t("a_services")}>
      <p className="mb-3 px-1 text-[15px] text-hint">{t("a_svc_in_progress")}</p>
      {q.loading || !q.data ? <SkeletonList n={3} h="h-40" /> : <div className="space-y-3">{q.data.map((s) => <ServiceCard key={s.code} s={s} />)}</div>}
    </Page>
  );
}

function ServiceCard({ s }: { s: Svc }) {
  const t = useT();
  const toast = useToast();
  const session = useSession();
  const [v, setV] = useState(s);
  const [until, setUntil] = useState(s.offUntil ? tashkentDate(new Date(s.offUntil)) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setV(s);
    setUntil(s.offUntil ? tashkentDate(new Date(s.offUntil)) : "");
  }, [s]);
  const dirty = v.enabled !== s.enabled || v.showWhenOff !== s.showWhenOff || (v.offMessage ?? "") !== (s.offMessage ?? "") || until !== (s.offUntil ? tashkentDate(new Date(s.offUntil)) : "");

  async function save() {
    setBusy(true);
    try {
      await api.post(`/admin/services/${s.code}`, {
        enabled: v.enabled,
        showWhenOff: v.showWhenOff,
        offMessage: v.offMessage?.trim() || null,
        // "Off until" the chosen day, 00:00 Tashkent time.
        offUntil: !v.enabled && until ? tashkentInstant(until, 0).toISOString() : null,
      });
      toast(t("saved"));
      invalidate("admin:services");
      void session.refresh();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }

  const state = s.enabled ? t("a_svc_on_now") : s.offUntil ? t("a_svc_off_until", { date: dateTime(s.offUntil, t.lang) }) : t("a_svc_off_now");
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", v.enabled ? "bg-accent-soft text-accent-ink" : "bg-mute-soft text-mute")}>
          <Icon name={ICON[s.code]} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(LABEL[s.code])}</p>
          <p className={cx("text-[14px] font-medium", s.enabled ? "text-accent-ink" : "text-mute")}>{state}</p>
        </div>
        <Toggle checked={v.enabled} label={t("a_svc_enabled")} onChange={(enabled) => setV({ ...v, enabled })} />
      </div>
      {!v.enabled && (
        <div className="mt-4 space-y-3 animate-fade">
          <Field label={t("a_svc_when_off")}>
            <div className="flex gap-2">
              <Chip className="flex-1" selected={!v.showWhenOff} onClick={() => setV({ ...v, showWhenOff: false })}>
                {t("a_svc_hide")}
              </Chip>
              <Chip className="flex-1" selected={v.showWhenOff} onClick={() => setV({ ...v, showWhenOff: true })}>
                {t("a_svc_show")}
              </Chip>
            </div>
          </Field>
          {v.showWhenOff && (
            <Field label={t("a_svc_message")}>
              <textarea className={inputCls + " min-h-[70px]"} maxLength={300} placeholder={t("a_svc_message_ph")} value={v.offMessage ?? ""} onChange={(e) => setV({ ...v, offMessage: e.target.value })} />
            </Field>
          )}
          <Field label={t("a_svc_until")}>
            <input type="date" className={inputCls} min={addDays(tashkentDate(new Date()), 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      )}
      {dirty && (
        <Button block className="mt-4" loading={busy} onClick={save}>
          {t("save")}
        </Button>
      )}
    </Card>
  );
}
