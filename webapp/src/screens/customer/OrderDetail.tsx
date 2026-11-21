// Order detail: tracker, payment state, courier + call, photos, map, details, timeline, cancel, rating, repeat.
import { CallButton } from "../../components/CallButton";
import { useEffect, useRef, useState } from "react";
import { ONLINE_METHODS } from "@domain/types";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dateTime, friendlyDate, phoneDisplay, timeOnly } from "../../lib/format";
import { runPayment } from "../../lib/pay";
import { invalidate, setQueryData, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { confirmDialog, openLink, openTelegramLink } from "../../lib/tg";
import type { CreateOrderResult, OrderDTO } from "../../lib/types";
import { MapView } from "../../components/Maps";
import { PrivatePhoto } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, cx, ErrorState, inputCls, KeyValue, Section, Skeleton, Stars } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { Celebration, useToast } from "../../ui/overlays";
import { PaymentBadge, StatusBadge, StatusTracker } from "../../ui/status";
import { supportLink } from "../common/Profile";
import { prefillFromOrder, withCodes } from "./prefill";
import { updateDraft } from "../../lib/draft";

const seenKey = (id: string) => `tf_celebrated_${id}`;

export function OrderDetail({ id }: { id: string }) {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const s = useSession();
  const q = useQuery<OrderDTO>(`order:${id}`, () => api.get(`/orders/${id}`), { refreshMs: 10_000 });
  const o = q.data;
  const [celebrate, setCelebrate] = useState(false);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!o) return;
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey(o.id)) === "1";
    } catch {
      seen = true;
    }
    if (o.status === "completed" && !seen && (prev.current === null || prev.current !== "completed")) {
      setCelebrate(true);
      try {
        localStorage.setItem(seenKey(o.id), "1");
      } catch {
        /* ignore */
      }
    }
    if (prev.current && prev.current !== o.status) invalidate("orders");
    prev.current = o.status;
  }, [o?.status, o?.id]);

  if (q.loading) {
    return (
      <Page>
        <Skeleton className="h-40" />
        <Skeleton className="mt-3 h-64" />
      </Page>
    );
  }
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;

  const type = s.catalog.trashTypes.find((x) => x.id === o.trashTypeId);
  const size = s.catalog.packageSizes.find((x) => x.id === o.packageSizeId);
  const online = ONLINE_METHODS.includes(o.paymentMethod);
  const update = (next: OrderDTO) => setQueryData(`order:${id}`, next);

  async function cancel() {
    if (!(await confirmDialog(t("cancel_confirm")))) return;
    try {
      update(await api.post<OrderDTO>(`/orders/${id}/cancel`));
      invalidate("orders");
      if (o!.paymentMethod === "subscription") void s.refresh();
      toast(t("cancelled_toast"));
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
      void q.refetch();
    }
  }

  async function payAgain() {
    try {
      const { payment } = await api.post<{ payment: CreateOrderResult["payment"] }>(`/orders/${id}/pay`);
      const r = await runPayment(payment);
      if (r === "paid") toast(t("order_created"));
      void q.refetch();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    }
  }

  /** Retry or switch method: a fresh order with the same details, starting at the payment step. */
  async function restartAtPayment(keepMethod: boolean) {
    if (o!.status === "awaiting_payment") {
      try {
        await api.post(`/orders/${id}/cancel`);
      } catch {
        /* already expired or cancelled */
      }
    }
    const withC = withCodes(o!, s.catalog);
    prefillFromOrder(withC, true);
    if (!keepMethod) {
      updateDraft({ method: "cash" });
    }
    invalidate("orders");
    nav.replace("new_order", { step: 4 });
  }

  const timeline: { label: string; at: string | null }[] = [
    { label: t("t_created"), at: o.createdAt },
    ...(online ? [{ label: t("t_paid"), at: o.paidAt }] : []),
    { label: t("t_accepted"), at: o.acceptedAt },
    { label: t("t_on_the_way"), at: o.onTheWayAt },
    { label: o.status === "cancelled" || o.status === "expired" ? t("t_cancelled") : t("t_completed"), at: o.status === "cancelled" || o.status === "expired" ? o.cancelledAt ?? o.expiresAt : o.completedAt },
  ];

  const customerPhotos = o.photos.filter((p) => p.kind === "customer");
  const completionPhotos = o.photos.filter((p) => p.kind === "completion");

  return (
    <Page title={t("order_n", { n: o.number })}>
      {celebrate && <Celebration text={t("celebrate")} onDone={() => setCelebrate(false)} />}

      <Card>
        <StatusBadge status={o.status} />
        <StatusTracker status={o.status} online={online} />
      </Card>

      {o.status === "awaiting_payment" && (
        <Card className="mt-3 border-2 border-warn/40">
          <p className="flex items-center gap-2 font-semibold text-warn">
            <Icon name="hourglass" size={20} /> {t("paying")}
          </p>
          <p className="mt-1 text-[15px] text-hint">{t("pay_return_hint")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => restartAtPayment(false)}>{t("other_method")}</Button>
            <Button onClick={payAgain}>{t("pay_now", { total: t.som(o.priceTotal) })}</Button>
          </div>
        </Card>
      )}

      {o.status === "expired" && (
        <Card className="mt-3 border-2 border-warn/40">
          <p className="flex items-center gap-2 text-[18px] font-bold">
            <Icon name="alert" className="text-warn" /> {t("pay_failed_title")}
          </p>
          <p className="mt-1 text-hint">{t("pay_failed_text")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => restartAtPayment(false)}>{t("other_method")}</Button>
            <Button icon="refresh" onClick={() => restartAtPayment(true)}>{t("retry")}</Button>
          </div>
        </Card>
      )}

      {o.courier && (o.status === "accepted" || o.status === "on_the_way" || o.status === "completed") && (
        <Card className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet">
            <Icon name="truck" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-hint">{t("courier")}</p>
            <p className="line-clamp-2 break-words font-semibold leading-5">{o.courier.name}</p>
          </div>
          {o.courier.phone && o.status !== "completed" && (
            <CallButton phone={o.courier.phone} label={t("call")} size="md" className="shrink-0" />
          )}
        </Card>
      )}

      {o.status === "completed" && <RatingCard order={o} onRated={update} />}

      {completionPhotos.length > 0 && (
        <Section title={t("completion_photo")}>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {completionPhotos.map((p) => (
              <PrivatePhoto key={p.id} id={p.id} className="h-40 w-40 shrink-0 rounded-card" />
            ))}
          </div>
        </Section>
      )}

      <Section title={t("details")}>
        <Card>
          <p className="text-[17px] font-semibold leading-6">{o.address}</p>
          {o.notes && <p className="mt-1 text-[15px] text-hint">{o.notes}</p>}
          {o.lat != null && o.lng != null && <MapView className="mt-3 h-40" markers={[{ id: o.id, lat: o.lat, lng: o.lng, color: "#15803d" }]} />}
          {customerPhotos.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {customerPhotos.map((p) => (
                <PrivatePhoto key={p.id} id={p.id} className="h-24 w-24 shrink-0 rounded-2xl" />
              ))}
            </div>
          )}
          <div className="mt-3 text-[16px]">
            <KeyValue k={t("type")} v={type ? t.name(type) : ""} />
            <KeyValue k={t("size")} v={`${size ? t.name(size) : ""} × ${o.quantity}`} />
            <KeyValue k={t("slot")} v={`${friendlyDate(o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, ${formatSlot(o.slotStart, o.slotEnd)}`} />
            <KeyValue k={t("method")} v={t(`pm_${o.paymentMethod}`)} />
            <KeyValue k={t("payment")} v={<PaymentBadge status={o.paymentStatus} />} />
            <div className="my-2 border-t border-line" />
            <KeyValue k={t("total")} v={<span className="money">{o.paymentMethod === "subscription" ? t("pm_subscription") : t.som(o.priceTotal)}</span>} strong />
          </div>
          {o.receiptNo && (
            <Button variant="ghost" icon="receipt" className="mt-1 -ml-2" onClick={() => nav.push("receipt", { orderId: o.id })}>
              {t("receipt")} № {o.receiptNo}
            </Button>
          )}
        </Card>
      </Section>

      <Section title={t("timeline")}>
        <Card>
          <ol>
            {timeline.map((x, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <span className={cx("h-3 w-3 rounded-full", x.at ? "bg-accent" : "bg-line")} />
                <span className={cx("flex-1", !x.at && "text-hint")}>{x.label}</span>
                <span className="text-[15px] text-hint">{x.at ? (new Date(x.at).toDateString() === new Date().toDateString() ? timeOnly(x.at) : dateTime(x.at, t.lang)) : "—"}</span>
              </li>
            ))}
          </ol>
          {o.cancelReason && <p className="mt-2 text-[15px] text-hint">{o.cancelReason}</p>}
        </Card>
      </Section>

      <div className="mt-5 space-y-2">
        {o.canCancel && (
          <Button block variant="danger" icon="x" onClick={cancel}>
            {t("cancel_order")}
          </Button>
        )}
        {(o.status === "accepted" || o.status === "on_the_way") && (
          <Button block variant="outline" icon="help" onClick={() => openTelegramLink(supportLink(s.bot))}>
            {t("contact_support")}
          </Button>
        )}
        {(o.status === "completed" || o.status === "cancelled") && (
          <Button
            block
            variant="secondary"
            icon="repeat"
            onClick={() => {
              prefillFromOrder(withCodes(o, s.catalog));
              nav.push("new_order", { step: 3 });
            }}
          >
            {t("repeat_order")}
          </Button>
        )}
      </div>
    </Page>
  );
}

function RatingCard({ order, onRated }: { order: OrderDTO; onRated: (o: OrderDTO) => void }) {
  const t = useT();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (order.rating) {
    return (
      <Card className="mt-3 text-center">
        <p className="text-[15px] text-hint">{t("your_rating")}</p>
        <Stars value={order.rating} size={32} />
        {order.ratingComment && <p className="mt-1 text-hint">“{order.ratingComment}”</p>}
      </Card>
    );
  }
  async function send() {
    setBusy(true);
    try {
      onRated(await api.post<OrderDTO>(`/orders/${order.id}/rate`, { rating: stars, comment: comment.trim() || null }));
      toast(t("rate_thanks"));
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mt-3 text-center">
      <p className="text-[19px] font-bold">{t("rate_title")}</p>
      <div className="mt-2">
        <Stars value={stars} onChange={setStars} />
      </div>
      {stars > 0 && (
        <div className="mt-3 animate-fade space-y-2">
          <textarea className={inputCls + " min-h-[80px]"} maxLength={500} placeholder={t("rate_comment_ph")} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button block loading={busy} onClick={send}>
            {t("rate_send")}
          </Button>
        </div>
      )}
    </Card>
  );
}
