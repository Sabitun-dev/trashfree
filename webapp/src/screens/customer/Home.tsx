// Customer home, built for people rather than developers:
// a friendly greeting, ONE live card for the order that matters now, the services, and two shortcuts.
import { useEffect } from "react";
import { trackerIndex, trackerSteps } from "@domain/status";
import { formatSlot } from "@domain/time";
import { ONLINE_METHODS, localName } from "@domain/types";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { loadDraft } from "../../lib/draft";
import { friendlyDate } from "../../lib/format";
import { loadLeaflet } from "../../lib/leaflet";
import { prefetchQuery, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { haptic } from "../../lib/tg";
import type { OrderDTO, WashDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { cx, IconButton, Skeleton } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { STATUS_STYLE } from "../../ui/status";
import { openSupport } from "../common/Profile";
import { svcLabel, washProgress } from "../wash/parts";
import { prefillFromOrder } from "./prefill";
import { ServiceMenu } from "./ServiceMenu";

type Live = { kind: "trash"; o: OrderDTO } | { kind: "wash"; o: WashDTO };

export function Home() {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const active = useQuery<OrderDTO[]>("orders:active", () => api.get("/orders?filter=active"), { refreshMs: 20_000 });
  const washActive = useQuery<WashDTO[]>("wash:active", () => api.get("/wash/orders?filter=active"), { refreshMs: 20_000 });
  const last = useQuery<(OrderDTO & { trashTypeCode: string; packageSizeCode: string }) | null>("orders:last", () => api.get("/orders/last"));
  const sub = s.subscription;
  const firstName = s.me.name.split(" ")[0];
  const trashOpen = s.services.find((x) => x.code === "trash")?.visibility === "open";

  // While the customer looks at the home screen, quietly prepare everything the order map needs.
  useEffect(() => {
    const id = setTimeout(() => {
      void loadLeaflet();
      void loadDraft();
      prefetchQuery("addresses", () => api.get("/addresses"));
    }, 800);
    return () => clearTimeout(id);
  }, []);

  // Orders that need the customer first (a price to confirm, a payment to finish), then the newest.
  const live: Live[] = [...(washActive.data ?? []).map((o) => ({ kind: "wash" as const, o })), ...(active.data ?? []).map((o) => ({ kind: "trash" as const, o }))].sort(
    (a, b) => Number(needsAction(b)) - Number(needsAction(a)) || b.o.createdAt.localeCompare(a.o.createdAt),
  );
  const loading = active.loading || washActive.loading;

  return (
    <Page hasTabBar>
      <header className="mb-4 flex items-start gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-8 tracking-tight">{t("hello", { name: firstName })} 👋</h1>
          <p className="mt-0.5 text-[16px] text-hint">{t("home_sub")}</p>
        </div>
        <IconButton icon="bell" label={t("bell_title")} badge={s.unread} onClick={() => nav.push("notifications")} />
      </header>

      {sub && (
        <button
          onClick={() => {
            haptic.tick();
            nav.reset("plans");
          }}
          className="mb-4 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[15px] font-semibold text-accent-ink"
        >
          <Icon name="crown" size={16} />
          {t("sub_badge", { plan: localName(sub.plan, t.lang), left: sub.left })}
        </button>
      )}

      {loading ? (
        <Skeleton className="mb-5 h-[112px] rounded-[22px]" />
      ) : live.length > 0 ? (
        <div className="mb-5">
          <LiveCard item={live[0]} onOpen={() => nav.push(live[0].kind === "wash" ? "wash_order" : "order", { id: live[0].o.id })} />
          {live.length > 1 && (
            <button onClick={() => nav.reset("orders")} className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1 text-[15px] font-semibold text-accent-ink">
              {t("home_more_active", { n: live.length - 1 })} <Icon name="right" size={16} />
            </button>
          )}
        </div>
      ) : null}

      <ServiceMenu />

      <div className="mt-5 grid grid-cols-2 gap-3">
        {last.data && trashOpen && (
          <Shortcut
            icon="repeat"
            title={t("repeat_order")}
            sub={last.data.address}
            onClick={() => {
              prefillFromOrder(last.data!);
              nav.push("new_order", { step: 3 });
            }}
          />
        )}
        <Shortcut icon="help" title={t("help")} sub={t("write_support")} onClick={() => openSupport(s.bot)} wide={!(last.data && trashOpen)} />
      </div>
    </Page>
  );
}

function needsAction(l: Live) {
  return l.kind === "wash" ? l.o.status === "quote_sent" : l.o.status === "awaiting_payment";
}

/** The one order that matters now: a plain sentence, what and when, and a slim progress bar. */
function LiveCard({ item, onOpen }: { item: Live; onOpen: () => void }) {
  const t = useT();
  const { catalog } = useSession();
  const action = needsAction(item);
  const when = `${friendlyDate(item.o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, ${formatSlot(item.o.slotStart, item.o.slotEnd)}`;

  let title: string;
  let what: string;
  let icon: string;
  let progress: number;
  if (item.kind === "trash") {
    const o = item.o;
    const online = ONLINE_METHODS.includes(o.paymentMethod);
    const type = catalog.trashTypes.find((x) => x.id === o.trashTypeId);
    title = action ? t("home_pay_cta") : t(`st_${o.status}`);
    what = `${t("svc_trash")} · #${o.number}${type ? ` · ${t.name(type)}` : ""}`;
    icon = STATUS_STYLE[o.status].icon;
    progress = (trackerIndex(o.status, online) + 1) / trackerSteps(online).length;
  } else {
    const o = item.o;
    title = action ? t("home_quote_cta") : t(`ws_${o.status}`);
    what = `${t(svcLabel(o.service))} · ${o.displayNumber}`;
    icon = action ? "receipt" : o.status === "out_for_delivery" || o.status === "picked_up" ? "truck" : "sparkle";
    progress = washProgress(o.status);
  }

  return (
    <button
      onClick={() => {
        haptic.tick();
        onOpen();
      }}
      className={cx(
        "card-hc relative block w-full overflow-hidden rounded-[22px] p-4 text-left shadow-[0_6px_20px_-8px_rgba(0,0,0,.25)] transition active:scale-[.98]",
        // In dark mode "warn" is a bright amber, so the text turns dark there (contrast stays readable).
        action ? "bg-warn text-white dark:text-[#1c1300]" : "bg-ink text-card",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
          <span className="absolute inset-0 rounded-2xl" style={{ backgroundColor: "currentColor", opacity: 0.15 }} />
          <Icon name={icon} size={26} />
          {action && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full" style={{ backgroundColor: "currentColor" }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[19px] font-extrabold leading-6">{title}</span>
          <span className="mt-0.5 block truncate text-[14px] opacity-80">{what}</span>
        </span>
        <Icon name="right" size={22} className="shrink-0 opacity-80" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        {/* Track and fill use the text colour, so they read well on every card colour and theme. */}
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full">
          <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "currentColor", opacity: 0.25 }} />
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ backgroundColor: "currentColor", width: `${Math.max(8, progress * 100)}%` }} />
        </div>
        <span className="shrink-0 text-[13px] font-medium opacity-80">{when}</span>
      </div>
    </button>
  );
}

function Shortcut({ icon, title, sub, onClick, wide }: { icon: string; title: string; sub: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      onClick={() => {
        haptic.tick();
        onClick();
      }}
      className={cx("card-hc flex min-h-[96px] flex-col justify-between rounded-[20px] bg-card p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] transition active:scale-[.98]", wide && "col-span-2")}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
        <Icon name={icon} size={22} />
      </span>
      <span className="mt-2 min-w-0">
        <span className="block font-bold leading-5">{title}</span>
        <span className="block truncate text-[13px] text-hint">{sub}</span>
      </span>
    </button>
  );
}
