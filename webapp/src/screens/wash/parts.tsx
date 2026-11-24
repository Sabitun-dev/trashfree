// Shared pieces for carpet & curtain orders: status badge, tracker, order card, items, quote.
import { formatSlot } from "@domain/time";
import { useT } from "../../i18n";
import type { DictKey } from "../../i18n/uz";
import { friendlyDate } from "../../lib/format";
import type { WashDTO, WashItemDTO, WashStatus } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Card, cx, KeyValue } from "../../ui/kit";

const STYLE: Record<WashStatus, { icon: string; cls: string }> = {
  created: { icon: "clipboard", cls: "bg-info-soft text-info" },
  courier_assigned: { icon: "hand", cls: "bg-violet-soft text-violet" },
  measured: { icon: "edit", cls: "bg-violet-soft text-violet" },
  quote_sent: { icon: "receipt", cls: "bg-warn-soft text-warn" },
  client_confirmed: { icon: "check", cls: "bg-accent-soft text-accent-ink" },
  picked_up: { icon: "truck", cls: "bg-warn-soft text-warn" },
  at_washer: { icon: "sparkle", cls: "bg-info-soft text-info" },
  washed: { icon: "sparkle", cls: "bg-accent-soft text-accent-ink" },
  out_for_delivery: { icon: "truck", cls: "bg-warn-soft text-warn" },
  delivered_paid: { icon: "check", cls: "bg-accent-soft text-accent-ink" },
  closed: { icon: "check", cls: "bg-mute-soft text-mute" },
  cancelled: { icon: "x", cls: "bg-mute-soft text-mute" },
};

export const svcLabel = (s: string): DictKey => (s === "carpet" ? "svc_carpet" : "svc_curtain");
export const m = (cm: number | null) => (cm == null ? "—" : (cm / 100).toFixed(2));
export const m2 = (t: number | null) => (t == null ? "—" : (t / 10).toFixed(1));

export function WashStatusBadge({ status, onHold }: { status: WashStatus; onHold?: boolean }) {
  const t = useT();
  const s = onHold ? { icon: "alert", cls: "bg-danger-soft text-danger" } : STYLE[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] font-semibold leading-4", s.cls)}>
      <Icon name={s.icon} size={16} strokeWidth={2.4} />
      {onHold ? t("wash_on_hold") : t(`ws_${status}`)}
    </span>
  );
}

/** A compact 5-step tracker for the client. */
const STEPS: { key: DictKey; from: WashStatus[] }[] = [
  { key: "ws_created", from: ["created", "courier_assigned"] },
  { key: "wash_quote_title", from: ["measured", "quote_sent"] },
  { key: "ws_picked_up", from: ["client_confirmed", "picked_up"] },
  { key: "ws_at_washer", from: ["at_washer", "washed"] },
  { key: "ws_delivered_paid", from: ["out_for_delivery", "delivered_paid", "closed"] },
];

export function WashTracker({ status }: { status: WashStatus }) {
  const t = useT();
  if (status === "cancelled") return null;
  const idx = STEPS.findIndex((s) => s.from.includes(status));
  return (
    <ol className="mt-3 flex gap-1" aria-label={t(`ws_${status}`)}>
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex-1">
          <div className={cx("h-1.5 rounded-full transition-all duration-500", i <= idx ? "bg-accent" : "bg-line")} />
          <p className={cx("mt-1 text-[11px] leading-[13px]", i === idx ? "font-bold text-ink" : "text-hint")}>{t(s.key)}</p>
        </li>
      ))}
    </ol>
  );
}

export function WashOrderCard({ order, onClick, tracker = true }: { order: WashDTO; onClick?: () => void; tracker?: boolean }) {
  const t = useT();
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-hint">
          <Icon name={order.service} size={16} /> {t(svcLabel(order.service))} · {order.displayNumber}
        </span>
        <WashStatusBadge status={order.status} onHold={order.onHold} />
      </div>
      {order.address && <p className="mt-2 line-clamp-2 text-[17px] font-semibold leading-6">{order.address}</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 text-[15px] text-hint">
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar" size={16} />
          {friendlyDate(order.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(order.slotStart, order.slotEnd)}
        </span>
        {order.items.length > 0 && <span>{order.items.length} {t("pcs")}</span>}
      </p>
      {tracker && <WashTracker status={order.status} />}
    </Card>
  );
}

/** Items with sizes and labels. `showPrice` only for the client and admins (the server sends no prices to others). */
export function WashItemsList({ order, showWasher }: { order: WashDTO; showWasher?: boolean }) {
  const t = useT();
  const lines = order.money?.lines;
  return (
    <ul className="divide-y divide-line">
      {order.items.map((i: WashItemDTO, k) => (
        <li key={i.id} className="flex items-start justify-between gap-3 py-2">
          <span>
            <span className="block font-mono text-[14px] font-semibold text-accent-ink">{i.label}</span>
            {i.lengthCm != null && (
              <span className="block text-[16px]">
                {m(i.lengthCm)} × {m(i.widthCm)} m = <b>{m2(i.areaTenths)} m²</b>
              </span>
            )}
            {showWasher && i.washerAreaTenths != null && (
              <span className="block text-[14px] text-hint">
                ↺ {m(i.washerLengthCm)} × {m(i.washerWidthCm)} m = {m2(i.washerAreaTenths)} m²
              </span>
            )}
          </span>
          {lines?.[k] && <span className="money shrink-0 font-semibold">{t.som(lines[k].amount)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The client's quote: lines, minimum, delivery, total. */
export function WashQuoteCard({ order, children }: { order: WashDTO; children?: React.ReactNode }) {
  const t = useT();
  const money = order.money;
  if (!money?.total) return null;
  return (
    <Card>
      <p className="text-[15px] font-semibold uppercase text-hint">{t("wash_quote_title")}</p>
      <WashItemsList order={order} />
      <div className="mt-2 border-t border-line pt-2 text-[16px]">
        {money.minimumApplied && <KeyValue k={t("wash_min_applied")} v={<span className="money">{t.som((money.total ?? 0) - (money.deliveryFee ?? 0))}</span>} />}
        <KeyValue k={t("wash_delivery")} v={money.deliveryFee ? <span className="money">{t.som(money.deliveryFee)}</span> : t("wash_free")} />
        <KeyValue k={t("total")} v={<span className="money text-[20px]">{t.som(money.total)}</span>} strong />
      </div>
      {children}
    </Card>
  );
}
