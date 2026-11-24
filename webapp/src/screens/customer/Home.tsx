// Customer home: service menu (trash / carpet / curtain), live order cards, subscription badge, repeat, bell.
import { localName } from "@domain/types";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { prefetchQuery, useQuery } from "../../lib/query";
import { useEffect } from "react";
import { loadLeaflet } from "../../lib/leaflet";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { haptic, openTelegramLink } from "../../lib/tg";
import type { OrderDTO } from "../../lib/types";
import { OrderCard } from "../../components/OrderCard";
import { Icon } from "../../ui/Icon";
import { Card, ErrorState, IconButton, Section, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { openSupport } from "../common/Profile";
import { prefillFromOrder } from "./prefill";
import { loadDraft } from "../../lib/draft";
import { ServiceMenu } from "./ServiceMenu";

export function Home() {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const active = useQuery<OrderDTO[]>("orders:active", () => api.get("/orders?filter=active"), { refreshMs: 20_000 });
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

  return (
    <Page
      hasTabBar
      title={t("hello", { name: firstName })}
      actions={<IconButton icon="bell" label={t("bell_title")} badge={s.unread} onClick={() => nav.push("notifications")} />}
    >
      {sub && (
        <button
          onClick={() => {
            haptic.tick();
            nav.reset("plans");
          }}
          className="mb-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[15px] font-semibold text-accent-ink"
        >
          <Icon name="crown" size={16} />
          {t("sub_badge", { plan: localName(sub.plan, t.lang), left: sub.left })}
        </button>
      )}

      <ServiceMenu />

      {last.data && trashOpen && (
        <Card
          className="mt-3 flex items-center gap-3"
          onClick={() => {
            prefillFromOrder(last.data!);
            nav.push("new_order", { step: 3 });
          }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <Icon name="repeat" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("repeat_order")}</span>
            <span className="block truncate text-[14px] text-hint">{last.data.address}</span>
          </span>
          <Icon name="right" className="text-hint" />
        </Card>
      )}

      <Section title={t("active_orders")}>
        {active.loading ? (
          <SkeletonList n={2} h="h-40" />
        ) : active.error ? (
          <ErrorState text={t("err_network")} onRetry={active.refetch} retryLabel={t("retry")} />
        ) : active.data?.length ? (
          <div className="space-y-3">
            {active.data.map((o) => (
              <OrderCard key={o.id} order={o} onClick={() => nav.push("order", { id: o.id })} />
            ))}
          </div>
        ) : (
          <Card className="text-center text-hint">{t("no_active")}</Card>
        )}
      </Section>

      <Section>
        <Card className="flex items-center gap-3" onClick={() => openSupport(s.bot)}>
          <Icon name="help" className="text-hint" />
          <span className="flex-1 font-medium">{t("help")}</span>
          <Icon name="right" className="text-hint" />
        </Card>
      </Section>
    </Page>
  );
}
