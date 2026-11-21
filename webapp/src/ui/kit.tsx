// The UI kit: Button, Tile, Chip, Card, Section, Row, Stepper, Badge, EmptyState, Skeleton, ErrorState, ProgressBar.
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { haptic } from "../lib/tg";
import { Icon } from "./Icon";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "warn" | "outline";
type BtnSize = "md" | "lg" | "xl";

export function Button({
  variant = "primary",
  size = "lg",
  loading,
  icon,
  block,
  className,
  children,
  onClick,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: string; block?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-accent text-on-accent",
    secondary: "bg-accent-soft text-accent-ink",
    ghost: "bg-transparent text-accent-ink",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn text-white",
    outline: "bg-card text-ink border border-line",
  };
  const s: Record<BtnSize, string> = {
    md: "min-h-[44px] px-4 text-[16px] rounded-xl",
    lg: "min-h-tap px-5 text-[17px] rounded-2xl",
    xl: "min-h-tap-lg px-6 text-[18px] rounded-2xl",
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      onClick={(e) => {
        haptic.tap();
        onClick?.(e);
      }}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-50 select-none",
        v[variant],
        s[size],
        block && "w-full",
        className,
      )}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "md" ? 18 : 20} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={cx("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function IconButton({ icon, label, onClick, badge, className }: { icon: string; label: string; onClick?: () => void; badge?: number; className?: string }) {
  return (
    <button
      aria-label={label}
      onClick={() => {
        haptic.tick();
        onClick?.();
      }}
      className={cx("relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-card text-ink active:scale-95 transition", className)}
    >
      <Icon name={icon} />
      {badge ? <Badge className="absolute -right-0.5 -top-0.5">{badge > 99 ? "99+" : badge}</Badge> : null}
    </button>
  );
}

export function Badge({ children, tone = "danger", className }: { children: ReactNode; tone?: "danger" | "accent" | "mute"; className?: string }) {
  const t = { danger: "bg-danger text-white", accent: "bg-accent text-on-accent", mute: "bg-mute-soft text-mute" }[tone];
  return <span className={cx("inline-flex min-w-[20px] h-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold leading-none", t, className)}>{children}</span>;
}

export function Card({ children, className, onClick, padded = true }: { children: ReactNode; className?: string; onClick?: () => void; padded?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={
        onClick
          ? () => {
              haptic.tick();
              onClick();
            }
          : undefined
      }
      className={cx("card-hc block w-full rounded-card bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,.05)]", padded && "p-4", onClick && "active:scale-[.99] transition", className)}
    >
      {children}
    </Tag>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-5", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          {title && <h2 className="text-[15px] font-semibold uppercase tracking-wide text-hint">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({ icon, label, value, onClick, right, danger, sub }: { icon?: string; label: ReactNode; value?: ReactNode; onClick?: () => void; right?: ReactNode; danger?: boolean; sub?: ReactNode }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={
        onClick
          ? () => {
              haptic.tick();
              onClick();
            }
          : undefined
      }
      className={cx("flex min-h-tap w-full items-center gap-3 px-4 py-2.5 text-left", onClick && "active:bg-line/40", danger ? "text-danger" : "text-ink")}
    >
      {icon && <Icon name={icon} className={danger ? "text-danger" : "text-hint"} />}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[14px] leading-5 text-hint">{sub}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-hint">{value}</span>}
      {right ?? (onClick ? <Icon name="right" size={18} className="text-hint" /> : null)}
    </Tag>
  );
}

export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="card-hc overflow-hidden rounded-card bg-card divide-y divide-line">{children}</div>;
}

/** A big picture tile for one-tap choices. */
export function Tile({ selected, onClick, picture, title, sub, disabled, className }: { selected?: boolean; onClick: () => void; picture?: ReactNode; title: ReactNode; sub?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      disabled={disabled}
      aria-pressed={!!selected}
      onClick={() => {
        haptic.tick();
        onClick();
      }}
      className={cx(
        "card-hc relative flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-card border-2 bg-card p-3 text-center transition active:scale-[.97] disabled:opacity-40",
        selected ? "border-accent bg-accent-soft" : "border-transparent",
        className,
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent animate-pop">
          <Icon name="check" size={16} strokeWidth={3} />
        </span>
      )}
      {picture}
      <span className={cx("text-[16px] font-semibold leading-5", selected ? "text-accent-ink" : "text-ink")}>{title}</span>
      {sub && <span className="text-[14px] leading-4 text-hint">{sub}</span>}
    </button>
  );
}

/** A quick chip. Disabled chips can show why ("Full", "Passed"). */
export function Chip({ selected, onClick, children, disabled, reason, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean; reason?: string; className?: string }) {
  return (
    <button
      disabled={disabled}
      aria-pressed={!!selected}
      onClick={() => {
        haptic.tick();
        onClick?.();
      }}
      className={cx(
        "card-hc inline-flex min-h-tap shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-4 py-1.5 text-[16px] font-semibold leading-5 transition active:scale-[.97]",
        selected ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-ink",
        disabled && "border-dashed bg-transparent text-hint opacity-70",
        className,
      )}
    >
      <span className={disabled ? "line-through decoration-1" : ""}>{children}</span>
      {reason && <span className="text-[12px] font-medium leading-4">{reason}</span>}
    </button>
  );
}

/** Big − / + buttons. */
export function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (v: number) => void; label: string }) {
  const set = (v: number) => {
    if (v < min || v > max) return haptic.warn();
    haptic.tick();
    onChange(v);
  };
  return (
    <div className="card-hc flex items-center justify-between rounded-card bg-card p-2" role="group" aria-label={label}>
      <button aria-label="−" onClick={() => set(value - 1)} disabled={value <= min} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink active:scale-95 disabled:opacity-40">
        <Icon name="minus" size={28} strokeWidth={2.5} />
      </button>
      <span className="text-[32px] font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button aria-label="+" onClick={() => set(value + 1)} disabled={value >= max} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent active:scale-95 disabled:opacity-40">
        <Icon name="plus" size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function EmptyState({ icon = "box", title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-fade">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
        <Icon name={icon} size={36} />
      </div>
      <h3 className="text-[20px] font-semibold">{title}</h3>
      {text && <p className="mt-1 text-hint">{text}</p>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </div>
  );
}

/** Errors are guided: one sentence + what to do + "Try again". */
export function ErrorState({ text, onRetry, retryLabel }: { text: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-fade">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warn-soft text-warn">
        <Icon name="alert" size={30} />
      </div>
      <p className="text-[17px]">{text}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" icon="refresh" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "h-20" }: { className?: string }) {
  return <div className={cx("skeleton animate-shimmer rounded-card", className)} />;
}

export function SkeletonList({ n = 3, h = "h-24" }: { n?: number; h?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={h} />
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="w-full" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-all duration-500 ease-out" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[15px] font-medium text-hint">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-[14px] text-hint">{hint}</span>}
    </label>
  );
}

export const inputCls = "card-hc w-full min-h-tap rounded-2xl border border-line bg-card px-4 py-3 text-[17px] text-ink placeholder:text-hint outline-none focus:border-accent";

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic.tick();
        onChange(!checked);
      }}
      className={cx("relative h-8 w-[52px] shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line")}
    >
      <span className={cx("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-[24px]" : "left-1")} />
    </button>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string; badge?: number }[]; onChange: (v: V) => void }) {
  return (
    <div className="card-hc flex rounded-2xl bg-line/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => {
            haptic.tick();
            onChange(o.value);
          }}
          className={cx("flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold transition", value === o.value ? "bg-card text-ink shadow-sm" : "text-hint")}
        >
          {o.label}
          {o.badge ? <Badge tone={value === o.value ? "accent" : "mute"}>{o.badge}</Badge> : null}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, onChange, size = 40 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex justify-center gap-1" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          aria-label={`${n}`}
          disabled={!onChange}
          onClick={() => {
            haptic.tick();
            onChange?.(n);
          }}
          className={cx("p-1 transition active:scale-90", n <= value ? "text-amber-400" : "text-line")}
        >
          <Icon name="star" size={size} fill={n <= value} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-hint">{k}</span>
      <span className={cx("text-right", strong && "font-bold")}>{v}</span>
    </div>
  );
}
