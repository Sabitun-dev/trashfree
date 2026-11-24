// The bell: the same messages the bot sends, with read state. Tapping opens the exact screen.
import { useEffect } from "react";
import { useT } from "../../i18n";
import type { DictKey } from "../../i18n/uz";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import type { NotificationDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Button, cx, EmptyState, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";

const ICON: Record<string, string> = {
  order_placed: "clipboard",
  order_accepted: "hand",
  order_on_the_way: "truck",
  order_completed: "sparkle",
  order_cancelled: "x",
  order_expired: "alert",
  order_assigned: "hand",
  order_unassigned: "x",
  payment_paid: "receipt",
  payment_failed: "alert",
  sub_activated: "crown",
  sub_expiring: "crown",
  sub_expires_today: "crown",
  sub_expired: "crown",
  rate_ask: "star",
  new_order: "bell",
  cash_handover: "cash",
  broadcast: "megaphone",
  wash_placed: "clipboard",
  wash_new: "bell",
  wash_assigned: "hand",
  wash_quote: "receipt",
  wash_courier_confirmed: "check",
  wash_courier_declined: "x",
  wash_picked: "truck",
  wash_cancelled: "x",
  wash_status: "sparkle",
  wash_courier_washed: "truck",
  admin_alert: "alert",
};

export function Notifications() {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const q = useQuery<NotificationDTO[]>("notifications", () => api.get("/notifications"));

  // Opening the bell marks everything as read (after a moment, so unread dots are still visible).
  useEffect(() => {
    if (!q.data?.some((n) => !n.readAt)) return;
    const id = setTimeout(() => {
      api.post<{ unread: number }>("/notifications/read").then((r) => s.setUnread(r.unread)).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  function text(n: NotificationDTO) {
    const key = (n.type === "order_placed" ? "n_order_accepted" : `n_${n.type}`) as DictKey;
    if (n.type === "order_placed") return t("order_n", { n: n.payload.n }) + " ✅";
    if (n.type === "sub_expires_today") return t("n_sub_expiring", { days: 0 });
    if (n.type === "wash_status" && t.has(`ws_${n.payload.status}`)) return t("n_wash_status", { num: n.payload.num, status: t(`ws_${n.payload.status}` as DictKey) });
    return t.has(key) ? t(key, n.payload) : n.type;
  }

  function open(n: NotificationDTO) {
    const id = n.payload.id as string | undefined;
    switch (n.payload.screen) {
      case "order":
        return id && nav.push("order", { id });
      case "courier_order":
        return id && nav.push("c_order", { id });
      case "wash_order":
        return id && nav.push(s.mode === "courier" ? "c_wash" : s.mode === "washer" ? "w_order" : "wash_order", { id });
      case "admin":
        return nav.push("a_dash");
      case "plans":
        return nav.push("plans");
      case "courier":
        return nav.push("c_list");
    }
  }

  return (
    <Page
      title={t("bell_title")}
      actions={
        q.data?.some((n) => !n.readAt) ? (
          <Button
            size="md"
            variant="ghost"
            onClick={async () => {
              const r = await api.post<{ unread: number }>("/notifications/read");
              s.setUnread(r.unread);
              invalidate("notifications");
            }}
          >
            {t("mark_all_read")}
          </Button>
        ) : null
      }
    >
      {q.loading ? (
        <SkeletonList n={4} h="h-16" />
      ) : !q.data?.length ? (
        <EmptyState icon="bell" title={t("bell_empty")} />
      ) : (
        <ul className="card-hc divide-y divide-line overflow-hidden rounded-card bg-card">
          {q.data.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-line/40">
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-line/60 text-hint" : "bg-accent-soft text-accent-ink")}>
                  <Icon name={ICON[n.type] ?? "bell"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block", !n.readAt && "font-semibold")}>{text(n)}</span>
                  {n.type === "broadcast" && n.payload.text && <span className="line-clamp-2 block text-[15px] text-hint">{String(n.payload.text)}</span>}
                  <span className="block text-[13px] text-hint">{dateTime(n.createdAt, t.lang)}</span>
                </span>
                {!n.readAt && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
