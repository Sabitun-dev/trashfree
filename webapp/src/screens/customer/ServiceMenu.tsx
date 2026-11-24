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

/** The carpet/curtain ordering screens ship in a later commit; until then their buttons stay hidden. */
export const WASH_FLOW_READY = false;

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
    <div className="space-y-3">
      {list.map((s, i) => {
        const m = META[s.code];
        const open = s.visibility === "open";
        // The first open service is the big green button; others are white cards (one main action per screen).
        const primary = open && list.findIndex((x) => x.visibility === "open") === i;
        return (
          <button
            key={s.code}
            onClick={() => start(s)}
            aria-disabled={!open}
            className={cx(
              "card-hc relative flex w-full items-center gap-4 overflow-hidden text-left transition active:scale-[.98]",
              primary ? "rounded-[24px] bg-accent p-5 text-on-accent shadow-lg shadow-accent/25" : "rounded-card bg-card p-4 text-ink shadow-[0_1px_2px_rgba(0,0,0,.05)]",
              !open && "opacity-70",
            )}
          >
            <span
              className={cx(
                "flex shrink-0 items-center justify-center rounded-2xl",
                primary ? "h-16 w-16 bg-white/20" : "h-12 w-12",
                !primary && (open ? "bg-accent-soft text-accent-ink" : "bg-mute-soft text-mute"),
              )}
            >
              <Icon name={m.icon} size={primary ? 34 : 26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx("block font-extrabold", primary ? "text-[22px] leading-7" : "text-[18px] leading-6")}>{t(m.label)}</span>
              <span className={cx("mt-0.5 block text-[15px] leading-5", primary ? "opacity-90" : "text-hint")}>
                {open ? t(m.sub) : s.message?.trim() || t("svc_unavailable")}
              </span>
              {!open && <span className="mt-1 inline-block rounded-full bg-mute-soft px-2 py-0.5 text-[13px] font-semibold text-mute">{t("svc_unavailable")}</span>}
            </span>
            {open && <Icon name="right" size={primary ? 26 : 22} className={primary ? "" : "text-hint"} />}
          </button>
        );
      })}
      {openCount === 0 && list.length === 0 && (
        <div className="card-hc rounded-card bg-card p-5 text-center text-hint">{t("svc_unavailable")}</div>
      )}
    </div>
  );
}
