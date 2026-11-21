// Subscription plans: pickups per month, price and price per pickup. Paid each month; reminders come from the bot.
import { useState } from "react";
import { pricePerPickup } from "@domain/subscription";
import { localName, type PaymentMethod } from "@domain/types";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { dayMonth } from "../../lib/format";
import { runPayment } from "../../lib/pay";
import { invalidate, useQuery } from "../../lib/query";
import { useSession } from "../../lib/session";
import { openTelegramLink } from "../../lib/tg";
import type { CreateOrderResult, Plan, SubscriptionDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Button, Card, cx, ProgressBar, Section, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet, useToast } from "../../ui/overlays";
import { openSupport } from "../common/Profile";

interface SubsResponse {
  active: SubscriptionDTO | null;
  upcoming: SubscriptionDTO | null;
  plans: Plan[];
}

export function Plans() {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const q = useQuery<SubsResponse>("subscriptions", () => api.get("/subscriptions"), { refreshMs: 30_000 });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const online = (["click", "payme", "card"] as PaymentMethod[]).filter((m) => s.settings.methods[m]);
  const bestValue = q.data?.plans.reduce<Plan | null>((best, p) => (!best || p.price / p.pickups < best.price / best.pickups ? p : best), null);

  async function buy(method: PaymentMethod) {
    if (!plan) return;
    setBusy(method);
    try {
      const res = await api.post<{ payment: CreateOrderResult["payment"] }>("/subscriptions", { planId: plan.id, method });
      setPlan(null);
      const outcome = await runPayment(res.payment);
      if (outcome === "paid") toast(t("n_sub_activated"));
      setTimeout(() => {
        invalidate("subscriptions");
        void s.refresh();
      }, 1500);
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(null);
    }
  }

  const active = q.data?.active;
  return (
    <Page hasTabBar title={t("plans_title")} subtitle={t("plans_sub")}>
      {q.loading ? (
        <SkeletonList n={3} h="h-36" />
      ) : (
        <>
          {active && (
            <Card className="bg-accent text-on-accent">
              <p className="flex items-center gap-2 text-[15px] font-semibold opacity-90">
                <Icon name="crown" size={18} /> {t("current_plan")}
              </p>
              <p className="mt-1 text-[24px] font-extrabold">{localName(active.plan, t.lang)}</p>
              <p className="text-[16px] opacity-90">
                {t("plan_left", { left: active.left, total: active.pickupsTotal })} · {active.periodEnd ? t("plan_until", { date: dayMonth(active.periodEnd.slice(0, 10), t.lang) }) : ""}
              </p>
              <div className="mt-3 [&_.bg-line]:bg-white/30 [&_.bg-accent]:bg-white">
                <ProgressBar value={active.pickupsTotal ? active.left / active.pickupsTotal : 0} />
              </div>
            </Card>
          )}
          {q.data?.upcoming && (
            <Card className="mt-3 flex items-center gap-3">
              <Icon name="calendar" className="text-accent-ink" />
              <span>
                {localName(q.data.upcoming.plan, t.lang)} · {q.data.upcoming.periodStart ? dayMonth(q.data.upcoming.periodStart.slice(0, 10), t.lang) : ""} →
              </span>
            </Card>
          )}

          <Section title={active ? t("renew") : undefined}>
            <div className="space-y-3">
              {q.data?.plans.map((p) => (
                <Card key={p.id} className={cx("relative border-2", p.id === bestValue?.id ? "border-accent" : "border-transparent")}>
                  {p.id === bestValue?.id && <span className="absolute -top-3 right-4 rounded-full bg-accent px-3 py-0.5 text-[13px] font-bold text-on-accent">★</span>}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[20px] font-extrabold">{localName(p, t.lang)}</p>
                      <p className="text-hint">{t("per_month", { n: p.pickups })}</p>
                    </div>
                    <div className="text-right">
                      <p className="money text-[20px] font-bold">{t.som(p.price)}</p>
                      <p className="money text-[14px] font-semibold text-accent-ink">{t("per_pickup", { price: t.som(pricePerPickup(p.price, p.pickups)) })}</p>
                    </div>
                  </div>
                  <Button block className="mt-3" variant={p.id === bestValue?.id ? "primary" : "secondary"} onClick={() => setPlan(p)}>
                    {t("buy_plan", { price: t.som(p.price) })}
                  </Button>
                </Card>
              ))}
            </div>
          </Section>
        </>
      )}

      <BottomSheet open={!!plan} onClose={() => setPlan(null)} title={plan ? `${localName(plan, t.lang)} · ${t.som(plan.price)}` : ""}>
        <p className="mb-3 text-hint">{t("sub_pay_method")}</p>
        {online.length ? (
          <div className="space-y-2">
            {online.map((m) => (
              <Button key={m} block size="xl" variant="outline" icon={m === "card" ? "card" : "wallet"} loading={busy === m} onClick={() => buy(m)}>
                {t(`pm_${m}`)}
              </Button>
            ))}
          </div>
        ) : (
          <Button block variant="secondary" icon="help" onClick={() => openSupport(s.bot)}>
            {t("contact_support")}
          </Button>
        )}
      </BottomSheet>
    </Page>
  );
}
