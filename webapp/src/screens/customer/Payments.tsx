// Payment history and the in-app receipt.
import { localName } from "@domain/types";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import type { PaymentDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Card, cx, EmptyState, ErrorState, KeyValue, Skeleton, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";

const statusTone = (s: string) => (s === "paid" ? "text-accent-ink" : s === "pending" ? "text-warn" : "text-hint");

export function PaymentsHistory() {
  const t = useT();
  const nav = useNav();
  const q = useQuery<PaymentDTO[]>("payments", () => api.get("/payments"));
  const label = (s: string) => (s === "paid" ? t("ps_paid") : s === "pending" ? t("ps_pending") : s === "cancelled" ? t("ps_cancelled") : t("ps_failed"));
  return (
    <Page title={t("payments_history")}>
      {q.loading ? (
        <SkeletonList n={3} h="h-20" />
      ) : q.error ? (
        <ErrorState text={t("err_network")} onRetry={q.refetch} retryLabel={t("retry")} />
      ) : !q.data?.length ? (
        <EmptyState icon="receipt" title={t("payments_history")} text={t("a_no_data")} />
      ) : (
        <div className="space-y-2">
          {q.data.map((p) => (
            <Card key={p.id} onClick={p.status === "paid" ? () => nav.push("receipt", { paymentId: p.id }) : undefined} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line/60">
                <Icon name={p.method === "card" ? "card" : "wallet"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.orderNumber ? t("order_n", { n: p.orderNumber }) : p.planName ? `${t("pm_subscription")}: ${localName(p.planName, t.lang)}` : "—"}</span>
                <span className="block text-[14px] text-hint">
                  {t(`pm_${p.method}`)} · {dateTime(p.paidAt ?? p.createdAt, t.lang)}
                </span>
              </span>
              <span className="text-right">
                <span className="money block font-bold">{t.som(p.amount)}</span>
                <span className={cx("block text-[14px] font-semibold", statusTone(p.status))}>{label(p.status)}</span>
              </span>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

interface Receipt {
  receiptNo: string | null;
  paidAt: string | null;
  method: string;
  provider: string;
  total: number;
  orderNumber: number | null;
  items: { title: string; count: number; price: number; ikpu: string | null }[];
}

export function ReceiptScreen({ orderId, paymentId }: { orderId?: string; paymentId?: string }) {
  const t = useT();
  const qs = paymentId ? `paymentId=${paymentId}` : `orderId=${orderId}`;
  const q = useQuery<Receipt>(`receipt:${qs}`, () => api.get(`/receipt?${qs}`));
  const r = q.data;
  return (
    <Page title={t("receipt")}>
      {q.loading ? (
        <Skeleton className="h-80" />
      ) : !r ? (
        <ErrorState text={t("err_not_found")} onRetry={q.refetch} retryLabel={t("retry")} />
      ) : (
        <Card className="relative overflow-hidden">
          <div className="flex flex-col items-center border-b border-dashed border-line pb-4 text-center">
            <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent">
              <Icon name="check" size={30} strokeWidth={3} />
            </span>
            <p className="text-[15px] text-hint">Trashfree</p>
            <p className="money text-[30px] font-extrabold">{t.som(r.total)}</p>
            <p className="text-[15px] font-semibold text-accent-ink">{t("ps_paid")}</p>
          </div>
          <div className="pt-3 text-[16px]">
            <KeyValue k={t("receipt_no")} v={<span className="font-mono">{r.receiptNo}</span>} />
            {r.paidAt && <KeyValue k={t("date")} v={dateTime(r.paidAt, t.lang)} />}
            {r.orderNumber && <KeyValue k={t("summary")} v={`#${r.orderNumber}`} />}
            <KeyValue k={t("method")} v={t(`pm_${r.method}` as "pm_cash")} />
          </div>
          <div className="mt-3 border-t border-dashed border-line pt-3">
            <p className="mb-1 text-[14px] font-semibold uppercase text-hint">{t("items")}</p>
            {r.items.map((i, k) => (
              <div key={k} className="py-1">
                <div className="flex justify-between gap-3">
                  <span>{i.title}</span>
                  <span className="money">{t.som(i.price)}</span>
                </div>
                {i.ikpu && <p className="text-[13px] text-hint">IKPU {i.ikpu}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <KeyValue k={t("total")} v={<span className="money text-[20px]">{t.som(r.total)}</span>} strong />
          </div>
        </Card>
      )}
    </Page>
  );
}
