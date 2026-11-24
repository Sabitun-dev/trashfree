// The client's main menu: up to three services. The admin switches each one on/off;
// a service that is off is hidden, or shown as "Hozircha mavjud emas" with the admin's message.
import { useT } from "../../i18n";
import { clearDraft } from "../../lib/draft";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { haptic } from "../../lib/tg";
import type { Bootstrap } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { cx } from "../../ui/kit";

type Svc = Bootstrap["services"][number];

/** Carpet/curtain ordering is available (each service still needs to be switched on by the admin). */
export const WASH_FLOW_READY = true;

const META = {
  trash: { label: "svc_trash", sub: "svc_trash_sub", icon: "trash" },
  carpet: { label: "svc_carpet", sub: "svc_wash_sub", icon: "carpet" },
  curtain: { label: "svc_curtain", sub: "svc_wash_sub", icon: "curtain" },
} as const;

export function visibleServices(services: Svc[]): Svc[] {
  return services.filter((s) => s.visibility !== "hidden" && (s.code === "trash" || WASH_FLOW_READY));
}

export function ServiceMenu() {
  const t = useT();
  const nav = useNav();
  const { services } = useSession();
  const list = visibleServices(services);
  const openCount = list.filter((s) => s.visibility === "open").length;

  function start(s: Svc) {
    if (s.visibility !== "open") return haptic.warn();
    haptic.press();
    if (s.code === "trash") {
      clearDraft();
      nav.push("new_order", { step: 1 });
    } else {
      nav.push("wash_new", { service: s.code });
    }
  }

  return (
    <section aria-label={t("home_services")}>
      <h2 className="mb-2.5 px-1 text-[18px] font-bold tracking-tight">{t("home_services")}</h2>
      <div className="space-y-3">
        {list.map((s) => {
          const m = META[s.code];
          const open = s.visibility === "open";
          // All services carry equal weight: same size and layout, each with its own colour.
          const tone = open ? TONE[s.code] : TONE_OFF;
          return (
            <button
              key={s.code}
              onClick={() => start(s)}
              aria-disabled={!open}
              className={cx(
                "card-hc relative flex min-h-[84px] w-full items-center gap-4 overflow-hidden rounded-[22px] border-2 px-4 py-3 text-left transition active:scale-[.98]",
                tone.card,
              )}
            >
              <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tone.icon)}>
                <Icon name={m.icon} size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-[19px] font-extrabold leading-6", open ? "text-ink" : "text-mute")}>{t(m.label)}</span>
                <span className="mt-0.5 block text-[15px] leading-5 text-hint">{open ? t(m.sub) : s.message?.trim() || t("svc_unavailable")}</span>
                {!open && <span className="mt-1.5 inline-block rounded-full bg-mute-soft px-2 py-0.5 text-[13px] font-semibold text-mute">{t("svc_unavailable")}</span>}
              </span>
              {open && (
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone.arrow)}>
                  <Icon name="right" size={22} strokeWidth={2.6} />
                </span>
              )}
            </button>
          );
        })}
        {openCount === 0 && list.length === 0 && <div className="card-hc rounded-card bg-card p-5 text-center text-hint">{t("svc_unavailable")}</div>}
      </div>
    </section>
  );
}

/** One colour family per service (theme tokens, so light and dark both stay readable). */
const TONE = {
  trash: { card: "border-accent/25 bg-accent-soft/60", icon: "bg-accent text-on-accent", arrow: "bg-accent text-on-accent" },
  carpet: { card: "border-violet/25 bg-violet-soft/60", icon: "bg-violet text-card", arrow: "bg-violet text-card" },
  curtain: { card: "border-info/25 bg-info-soft/60", icon: "bg-info text-card", arrow: "bg-info text-card" },
} as const;
const TONE_OFF = { card: "border-line bg-card opacity-80", icon: "bg-mute-soft text-mute", arrow: "" };
