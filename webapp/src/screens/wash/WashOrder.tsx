// A carpet / curtain order for the client (and admins): tracker, quote with Confirm / Decline, items with labels.
import { useState } from "react";
import { isAdmin } from "@domain/permissions";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dateTime, friendlyDate } from "../../lib/format";
import { invalidate, setQueryData, useQuery } from "../../lib/query";
import { useSession } from "../../lib/session";
import { confirmDialog } from "../../lib/tg";
import type { WashDTO } from "../../lib/types";
import { CallButton } from "../../components/CallButton";
import { PrivatePhoto } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, ErrorState, inputCls, KeyValue, Section, Skeleton } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet, useToast } from "../../ui/overlays";
import { svcLabel, WashItemsList, WashQuoteCard, WashStatusBadge, WashTracker } from "./parts";

export function WashOrderScreen({ id }: { id: string }) {
  const t = useT();
  const toast = useToast();
  const s = useSession();
  const key = `wash:${id}`;
  const q = useQuery<WashDTO>(key, () => api.get(`/wash/orders/${id}`), { refreshMs: 10_000 });
  const [busy, setBusy] = useState(false);
  const [adminAction, setAdminAction] = useState<null | "reopen" | "admin-cancel" | "waive-delivery">(null);
  const [reason, setReason] = useState("");
  const o = q.data;
  if (q.loading) return <Page><Skeleton className="h-72" /></Page>;
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;

  const admin = isAdmin(s.me.role) && s.mode === "admin";
  const mine = o.customer === null && !admin; // the server only omits the customer for the owner

  async function run(fn: () => Promise<WashDTO>, ok: string) {
    setBusy(true);
    try {
      setQueryData(key, await fn());
      invalidate("wash");
      toast(ok);
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
      void q.refetch();
    } finally {
      setBusy(false);
    }
  }

  const answer = async (accept: boolean) => {
    if (!accept && !(await confirmDialog(t("wash_decline_q")))) return;
    await run(() => api.post(`/wash/orders/${id}/quote`, { version: o.quoteVersion, accept }), accept ? t("wash_confirmed_toast") : t("cancelled_toast"));
  };

  return (
    <Page title={`${t(svcLabel(o.service))} · ${o.displayNumber}`}>
      <Card>
        <WashStatusBadge status={o.status} onHold={o.onHold} />
        <WashTracker status={o.status} />
      </Card>

      {mine && (o.status === "created" || o.status === "courier_assigned" || o.status === "measured") && (
        <Card className="mt-3 flex items-start gap-3 bg-info-soft">
          <Icon name="edit" className="mt-0.5 shrink-0 text-info" />
          <p className="text-[15px]">{t("wash_wait_quote")}</p>
        </Card>
      )}

      {o.money?.total ? (
        <div className="mt-3">
          <WashQuoteCard order={o}>
            {mine && o.status === "quote_sent" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" loading={busy} onClick={() => answer(false)}>
                  {t("wash_decline")}
                </Button>
                <Button loading={busy} icon="check" onClick={() => answer(true)}>
                  {t("wash_confirm")}
                </Button>
              </div>
            )}
          </WashQuoteCard>
        </div>
      ) : o.items.length > 0 ? (
        <Section title={t("wash_items")}>
          <Card>
            <WashItemsList order={o} showWasher={admin} />
          </Card>
        </Section>
      ) : null}

      {o.courier && o.status !== "created" && o.status !== "cancelled" && (
        <Card className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet">
            <Icon name="truck" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-hint">{t("courier")}</p>
            <p className="font-semibold">{o.courier.name}</p>
          </div>
          {o.courier.phone && !["delivered_paid", "closed"].includes(o.status) && <CallButton phone={o.courier.phone} label={t("call")} size="md" className="shrink-0" />}
        </Card>
      )}

      <Section title={t("details")}>
        <Card>
          {o.address && <p className="text-[17px] font-semibold leading-6">{o.address}</p>}
          {o.notes && <p className="mt-1 text-[15px] text-hint">{o.notes}</p>}
          <div className="mt-2 text-[16px]">
            <KeyValue k={t("slot")} v={`${friendlyDate(o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, ${formatSlot(o.slotStart, o.slotEnd)}`} />
            {o.paymentMethod && <KeyValue k={t("method")} v={t(`pm_${o.paymentMethod}` as "pm_cash")} />}
            {admin && o.customer && <KeyValue k={t("a_customer")} v={o.customer.name} />}
          </div>
          {o.photos.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {o.photos.map((p) => (
                <PrivatePhoto key={p.id} id={p.id} className="h-24 w-24 shrink-0 rounded-2xl" />
              ))}
            </div>
          )}
        </Card>
      </Section>

      {admin && o.money && (
        <Section title={t("a_revenue")}>
          <Card className="text-[16px]">
            <KeyValue k={t("total")} v={t.som(o.money.total ?? 0)} />
            <KeyValue k="Washer" v={t.som(o.money.washerPayout ?? 0)} />
            <KeyValue k={t("courier")} v={t.som(o.money.courierPay ?? 0)} />
            <KeyValue k="Margin" v={<b>{t.som(o.money.margin ?? 0)}</b>} />
            {o.money.waiveDelivery && <KeyValue k={t("aw_waive")} v={o.money.waiveReason ?? ""} />}
          </Card>
        </Section>
      )}

      <Section title={t("timeline")}>
        <Card>
          <ol>
            {o.timeline.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-1">
                <span>{t(`ws_${x.to}`)}</span>
                <span className="text-[15px] text-hint">{dateTime(x.at, t.lang)}</span>
              </li>
            ))}
          </ol>
          {o.cancelReason && <p className="mt-2 text-[15px] text-hint">{o.cancelReason === "client_declined" ? t("wash_decline") : o.cancelReason}</p>}
        </Card>
      </Section>

      <div className="mt-5 space-y-2">
        {mine && (o.status === "created" || o.status === "courier_assigned") && (
          <Button
            block
            variant="danger"
            icon="x"
            loading={busy}
            onClick={async () => {
              if (await confirmDialog(t("cancel_confirm"))) await run(() => api.post(`/wash/orders/${id}/cancel`), t("cancelled_toast"));
            }}
          >
            {t("cancel_order")}
          </Button>
        )}
        {admin && o.status === "measured" && o.needsApproval && (
          <Button block icon="check" loading={busy} onClick={() => run(() => api.post(`/wash/orders/${id}/approve`), t("saved"))}>
            {t("aw_approve")}
          </Button>
        )}
        {admin && ["client_confirmed", "quote_sent"].includes(o.status) && (
          <Button block variant="outline" onClick={() => setAdminAction("reopen")}>
            {t("aw_reopen")}
          </Button>
        )}
        {admin && ["created", "courier_assigned", "measured", "quote_sent"].includes(o.status) && !o.money?.waiveDelivery && (
          <Button block variant="outline" onClick={() => setAdminAction("waive-delivery")}>
            {t("aw_waive")}
          </Button>
        )}
        {admin && !["delivered_paid", "closed", "cancelled"].includes(o.status) && (
          <Button block variant="danger" onClick={() => setAdminAction("admin-cancel")}>
            {t("a_cancel_order")}
          </Button>
        )}
      </div>

      <BottomSheet open={!!adminAction} onClose={() => setAdminAction(null)} title={adminAction === "reopen" ? t("aw_reopen") : adminAction === "waive-delivery" ? t("aw_waive") : t("a_cancel_order")}>
        <textarea className={inputCls + " min-h-[90px]"} placeholder={t("a_reason_ph")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Button
          block
          className="mt-3"
          loading={busy}
          disabled={reason.trim().length < 2}
          onClick={async () => {
            await run(() => api.post(`/wash/orders/${id}/${adminAction}`, { reason }), t("saved"));
            setAdminAction(null);
            setReason("");
          }}
        >
          {t("save")}
        </Button>
      </BottomSheet>
    </Page>
  );
}
