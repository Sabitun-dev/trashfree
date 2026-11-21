// My orders with status filters.
import { useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import type { OrderDTO } from "../../lib/types";
import { OrderCard } from "../../components/OrderCard";
import { Button, EmptyState, ErrorState, Segmented, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { clearDraft } from "../../lib/draft";

type F = "active" | "done" | "cancelled";

export function Orders() {
  const t = useT();
  const nav = useNav();
  const [filter, setFilter] = useState<F>("active");
  const q = useQuery<OrderDTO[]>(`orders:${filter}`, () => api.get(`/orders?filter=${filter}`), { refreshMs: filter === "active" ? 20_000 : undefined });
  return (
    <Page title={t("my_orders")} hasTabBar>
      <Segmented<F>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: t("filter_active") },
          { value: "done", label: t("filter_done") },
          { value: "cancelled", label: t("filter_cancelled") },
        ]}
      />
      <div className="mt-4">
        {q.loading ? (
          <SkeletonList n={3} h="h-32" />
        ) : q.error ? (
          <ErrorState text={t("err_network")} onRetry={q.refetch} retryLabel={t("retry")} />
        ) : !q.data?.length ? (
          <EmptyState
            icon="list"
            title={t("no_orders")}
            text={t("no_orders_hint")}
            action={
              <Button
                block
                onClick={() => {
                  clearDraft();
                  nav.push("new_order", { step: 1 });
                }}
              >
                {t("big_order")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {q.data.map((o) => (
              <OrderCard key={o.id} order={o} tracker={filter === "active"} onClick={() => nav.push("order", { id: o.id })} />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
