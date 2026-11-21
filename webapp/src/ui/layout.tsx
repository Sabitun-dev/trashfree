// Page layout and the bottom tab bar.
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { fallbackBottomPad } from "../lib/buttons";
import { haptic } from "../lib/tg";
import { Icon } from "./Icon";
import { cx } from "./kit";

export function Page({
  title,
  subtitle,
  actions,
  children,
  hasMainButton,
  hasTabBar,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  hasMainButton?: boolean;
  hasTabBar?: boolean;
  className?: string;
}) {
  return (
    <main className={cx("mx-auto min-h-full max-w-[560px] px-4 pt-3", hasTabBar ? "pb-28" : hasMainButton ? fallbackBottomPad() : "pb-safe", className)}>
      {(title || actions) && (
        <header className="mb-3 flex min-h-[48px] items-center gap-3">
          <div className="min-w-0 flex-1">
            {title && <h1 className="text-title font-bold tracking-tight">{title}</h1>}
            {subtitle && <p className="text-[15px] text-hint">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </main>
  );
}

export interface Tab {
  name: string;
  label: string;
  icon: string;
  badge?: number;
}

export function TabBar({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (name: string) => void }) {
  return (
    <nav className="card-hc fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur pb-[var(--safe-bottom)]">
      <ul className="mx-auto flex max-w-[560px]">
        {tabs.map((t) => {
          const on = t.name === active;
          return (
            <li key={t.name} className="flex-1">
              <button
                onClick={() => {
                  haptic.tick();
                  onChange(t.name);
                }}
                aria-current={on ? "page" : undefined}
                className={cx("relative flex h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold", on ? "text-accent-ink" : "text-hint")}
              >
                <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition", on && "bg-accent-soft")}>
                  <Icon name={t.icon} size={22} strokeWidth={on ? 2.4 : 2} />
                </span>
                {t.label}
                {t.badge ? <span className="absolute right-[calc(50%-22px)] top-1.5 h-2.5 w-2.5 rounded-full bg-danger" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function OfflineBanner() {
  const t = useT();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center gap-2 bg-ink px-4 py-2.5 text-[15px] font-medium text-card">
      <Icon name="wifi" size={18} />
      {t("offline_banner")}
    </div>
  );
}

export function CenterScreen({ icon, title, text, children, tone = "accent" }: { icon: string; title: string; text?: string; children?: ReactNode; tone?: "accent" | "warn" | "mute" }) {
  const toneCls = { accent: "bg-accent-soft text-accent-ink", warn: "bg-warn-soft text-warn", mute: "bg-mute-soft text-mute" }[tone];
  return (
    <main className="mx-auto flex min-h-full max-w-[480px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className={cx("mb-5 flex h-24 w-24 items-center justify-center rounded-full", toneCls)}>
        <Icon name={icon} size={44} />
      </div>
      <h1 className="text-title font-bold">{title}</h1>
      {text && <p className="mt-2 text-hint">{text}</p>}
      {children && <div className="mt-6 w-full">{children}</div>}
    </main>
  );
}
