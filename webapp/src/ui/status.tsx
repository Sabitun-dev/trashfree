// Status is always icon + colour + word.
import { trackerIndex, trackerSteps } from "@domain/status";
import type { OrderStatus, PaymentStatus } from "@domain/types";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { cx } from "./kit";

export const STATUS_STYLE: Record<OrderStatus, { icon: string; cls: string; dot: string }> = {
  awaiting_payment: { icon: "hourglass", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  open: { icon: "clipboard", cls: "bg-info-soft text-info", dot: "bg-info" },
  accepted: { icon: "hand", cls: "bg-violet-soft text-violet", dot: "bg-violet" },
  on_the_way: { icon: "truck", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  completed: { icon: "sparkle", cls: "bg-accent-soft text-accent-ink", dot: "bg-accent" },
  cancelled: { icon: "x", cls: "bg-mute-soft text-mute", dot: "bg-mute" },
  expired: { icon: "x", cls: "bg-mute-soft text-mute", dot: "bg-mute" },
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = useT();
  const s = STATUS_STYLE[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] font-semibold leading-4", s.cls, className)}>
      <Icon name={s.icon} size={16} strokeWidth={2.4} />
      {t(`st_${status}`)}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const t = useT();
  const cls = status === "paid" || status === "subscription" ? "text-accent-ink" : status === "cod_pending" ? "text-warn" : "text-hint";
  return <span className={cx("font-semibold", cls)}>{t(`ps_${status}`)}</span>;
}

const STEP_ICON: Record<string, string> = { payment: "wallet", placed: "clipboard", accepted: "hand", on_the_way: "truck", completed: "sparkle" };

/** The animated step tracker on order cards. */
export function StatusTracker({ status, online }: { status: OrderStatus; online: boolean }) {
  const t = useT();
  const steps = trackerSteps(online);
  const idx = trackerIndex(status, online);
  if (idx < 0) return null;
  const pct = steps.length > 1 ? idx / (steps.length - 1) : 0;
  return (
    <div className="relative mt-3" aria-label={t(`st_${status}`)}>
      <div className="absolute left-[18px] right-[18px] top-[17px] h-1 rounded-full bg-line" />
      <div className="absolute left-[18px] top-[17px] h-1 rounded-full bg-accent transition-all duration-700 ease-out" style={{ width: `calc((100% - 36px) * ${pct})` }} />
      <ol className="relative flex justify-between">
        {steps.map((s, i) => {
          const done = i < idx;
          const cur = i === idx;
          const edge = i === 0 ? "items-start text-left" : i === steps.length - 1 ? "items-end text-right" : "items-center text-center";
          return (
            <li key={s} className={cx("flex w-[36px] flex-col", edge)}>
              <span
                className={cx(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-500",
                  done && "border-accent bg-accent text-on-accent",
                  cur && "border-accent bg-card text-accent-ink scale-110 shadow",
                  !done && !cur && "border-line bg-card text-hint",
                )}
              >
                <Icon name={done ? "check" : STEP_ICON[s]} size={18} strokeWidth={2.4} />
              </span>
              <span className={cx("mt-1 w-[64px] text-[12px] leading-[14px]", i > 0 && i < steps.length - 1 && "text-center", cur ? "font-bold text-ink" : "text-hint")}>{t(`step_${s}`)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
