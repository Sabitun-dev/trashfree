// Today panel: pickups done, cash to hand over (separate from money already paid online).
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { Icon } from "../../ui/Icon";
import { Card, ErrorState, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";

interface Today {
  doneToday: number;
  cashToday: number;
  onlineToday: number;
  onlineCount: number;
  cashToHandOver: number;
  cashOrders: number;
}

export function CourierToday() {
  const t = useT();
  const q = useQuery<Today>("courier:today", () => api.get("/courier/today"), { refreshMs: 30_000 });
  const d = q.data;
  return (
    <Page hasTabBar title={t("c_today_title")}>
      {q.loading ? (
        <SkeletonList n={3} h="h-28" />
      ) : !d ? (
        <ErrorState text={t("err_network")} onRetry={q.refetch} retryLabel={t("retry")} />
      ) : (
        <div className="space-y-3">
          <Card className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <Icon name="check" size={30} />
            </span>
            <div>
              <p className="text-[15px] text-hint">{t("c_today_done")}</p>
              <p className="text-[34px] font-extrabold leading-9">{d.doneToday}</p>
            </div>
          </Card>
          <Card className="border-2 border-warn/50 bg-warn-soft">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-warn">
              <Icon name="cash" /> {t("c_today_cash")}
            </p>
            <p className="money mt-1 text-[34px] font-extrabold leading-10 text-warn">{t.som(d.cashToHandOver)}</p>
            <p className="mt-1 text-[15px] text-ink/80">{t("c_handover_hint")}</p>
          </Card>
          <Card>
            <p className="flex items-center gap-2 text-[16px] font-semibold text-accent-ink">
              <Icon name="card" /> {t("c_today_online")}
            </p>
            <p className="money mt-1 text-[26px] font-bold">{t.som(d.onlineToday)}</p>
            <p className="text-[15px] text-hint">{d.onlineCount} {t("pcs")}</p>
          </Card>
        </div>
      )}
    </Page>
  );
}
