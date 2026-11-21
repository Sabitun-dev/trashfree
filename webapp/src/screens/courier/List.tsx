// Courier tabs: Yangi · Meniki · Bajarilgan. Big buttons for one hand, batch mode in "Meniki".
import { useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import type { OrderDTO } from "../../lib/types";
import { Button, EmptyState, ErrorState, IconButton, Segmented, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { Celebration } from "../../ui/overlays";
import { CompleteSheet, CourierOrderCard, useCourierActions, useMyLocation, distanceFrom } from "./shared";

type TabName = "new" | "mine" | "done";

export function CourierList() {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const me = useMyLocation();
  const [tab, setTab] = useState<TabName>("new");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<OrderDTO[] | null>(null);
  const [party, setParty] = useState(false);
  const q = useQuery<OrderDTO[]>(`courier:${tab}`, () => api.get(`/courier/orders?tab=${tab}`), { refreshMs: tab === "done" ? undefined : 15_000 });
  const counts = useQuery<{ new: number; mine: number }>("courier:counts", () => api.get("/courier/counts"), { refreshMs: 15_000 });
  const actions = useCourierActions();

  const list = [...(q.data ?? [])];
  if (tab === "new" && me) list.sort((a, b) => (distanceFrom(me, a) ?? 1e9) - (distanceFrom(me, b) ?? 1e9) || b.createdAt.localeCompare(a.createdAt));
  const toggle = (id: string) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const selectedOrders = list.filter((o) => selected.includes(o.id));

  if (!s.me.cityIds.length && s.me.role === "courier") {
    return (
      <Page hasTabBar>
        <EmptyState icon="pin" title={t("c_no_cities")} />
      </Page>
    );
  }

  return (
    <Page
      hasTabBar={!selecting}
      hasMainButton={selecting}
      title={t("tab_orders")}
      actions={<IconButton icon="bell" label={t("bell_title")} badge={s.unread} onClick={() => nav.push("notifications")} />}
    >
      {party && <Celebration text={t("celebrate")} onDone={() => setParty(false)} />}
      <Segmented<TabName>
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSelecting(false);
          setSelected([]);
        }}
        options={[
          { value: "new", label: t("tab_new"), badge: counts.data?.new },
          { value: "mine", label: t("tab_mine"), badge: counts.data?.mine },
          { value: "done", label: t("tab_done") },
        ]}
      />

      {tab === "mine" && list.length > 1 && (
        <div className="mt-3 flex justify-end">
          <Button
            size="md"
            variant={selecting ? "secondary" : "ghost"}
            icon="select"
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
            }}
          >
            {selecting ? t("c_selected", { n: selected.length }) : t("c_select")}
          </Button>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {q.loading ? (
          <SkeletonList n={3} h="h-44" />
        ) : q.error ? (
          <ErrorState text={t("err_network")} onRetry={q.refetch} retryLabel={t("retry")} />
        ) : !list.length ? (
          <EmptyState icon={tab === "new" ? "truck" : tab === "mine" ? "hand" : "sparkle"} title={t(tab === "new" ? "c_new_empty" : tab === "mine" ? "c_mine_empty" : "c_done_empty")} text={tab === "new" ? t("c_new_empty_hint") : undefined} />
        ) : (
          list.map((o) => (
            <CourierOrderCard
              key={o.id}
              order={o}
              me={me}
              onOpen={() => nav.push("c_order", { id: o.id })}
              selectable={selecting}
              selected={selected.includes(o.id)}
              onSelect={() => toggle(o.id)}
              onLongPress={tab === "mine" && !selecting ? () => {
                setSelecting(true);
                setSelected([o.id]);
              } : undefined}
            >
              {!selecting && tab === "new" && (
                <Button block size="xl" icon="hand" loading={actions.busy === o.id + "accept"} onClick={() => actions.accept(o.id)}>
                  {t("c_take")}
                </Button>
              )}
              {!selecting && tab === "mine" && (
                <div className="flex gap-2">
                  {o.status === "accepted" && (
                    <Button size="xl" variant="secondary" icon="truck" className="flex-1" loading={actions.busy === o.id + "on-the-way"} onClick={() => actions.onTheWay(o.id)}>
                      {t("c_on_way")}
                    </Button>
                  )}
                  <Button size="xl" icon="check" className="flex-1" onClick={() => setSheet([o])}>
                    {t("c_done")}
                  </Button>
                </div>
              )}
            </CourierOrderCard>
          ))
        )}
      </div>

      {selecting && <MainButton text={`${t("c_batch_done")} · ${selected.length}`} disabled={!selected.length} onClick={() => setSheet(selectedOrders)} />}

      <CompleteSheet
        open={!!sheet}
        orders={sheet ?? []}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          setSelecting(false);
          setSelected([]);
          setParty(true);
        }}
      />
    </Page>
  );
}
