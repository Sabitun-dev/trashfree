// Courier building blocks: my location, money line, order card, directions sheet, complete sheet, actions.
import { useEffect, useState, useSyncExternalStore } from "react";
import { distanceKm } from "@domain/geo";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { friendlyDate, km } from "../../lib/format";
import { invalidate } from "../../lib/query";
import { useSession } from "../../lib/session";
import { getLocation, haptic, openLink, openTelegramLink } from "../../lib/tg";
import type { OrderDTO } from "../../lib/types";
import { PhotoPicker } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, cx } from "../../ui/kit";
import { BottomSheet, useToast } from "../../ui/overlays";
import { StatusBadge } from "../../ui/status";

// ---- My location (asked once, refreshed on demand) ----
let myPos: { lat: number; lng: number } | null = null;
let asked = false;
const subs = new Set<() => void>();
export async function refreshMyLocation() {
  const p = await getLocation();
  if (p) {
    myPos = p;
    subs.forEach((s) => s());
  }
  return p;
}
export function useMyLocation() {
  useEffect(() => {
    if (!asked) {
      asked = true;
      void refreshMyLocation();
    }
  }, []);
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => myPos,
  );
}

export function distanceFrom(me: { lat: number; lng: number } | null, o: OrderDTO) {
  return me && o.lat != null && o.lng != null ? distanceKm(me.lat, me.lng, o.lat, o.lng) : null;
}

/** "Naqd: 35 000 so'm olish kerak" in amber, or "To'langan" in green. */
export function MoneyLine({ order, big }: { order: OrderDTO; big?: boolean }) {
  const t = useT();
  const cash = order.paymentMethod === "cash";
  return (
    <div className={cx("flex items-center gap-2 rounded-2xl px-3 py-2 font-bold", big ? "text-[19px]" : "text-[16px]", cash ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-ink")}>
      <Icon name={cash ? "cash" : "check"} size={big ? 24 : 20} />
      <span className="money">{cash ? t("c_cash_collect", { total: t.som(order.priceTotal) }) : order.paymentMethod === "subscription" ? t("c_sub_paid") : t("c_paid")}</span>
    </div>
  );
}

export function CourierOrderCard({
  order,
  me,
  onOpen,
  selectable,
  selected,
  onSelect,
  onLongPress,
  children,
}: {
  order: OrderDTO;
  me: { lat: number; lng: number } | null;
  onOpen: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onLongPress?: () => void;
  children?: React.ReactNode;
}) {
  const t = useT();
  const { catalog } = useSession();
  const type = catalog.trashTypes.find((x) => x.id === order.trashTypeId);
  const size = catalog.packageSizes.find((x) => x.id === order.packageSizeId);
  const d = distanceFrom(me, order);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (
    <Card padded={false} className={cx("overflow-hidden", selected && "ring-4 ring-accent")}>
      <button
        className="block w-full p-4 text-left active:bg-line/30"
        onClick={() => {
          haptic.tick();
          if (selectable) onSelect?.();
          else onOpen();
        }}
        onTouchStart={() => {
          if (!onLongPress) return;
          timer = setTimeout(() => {
            haptic.press();
            onLongPress();
          }, 550);
        }}
        onTouchEnd={() => clearTimeout(timer)}
        onTouchMove={() => clearTimeout(timer)}
        onContextMenu={(e) => {
          if (onLongPress) {
            e.preventDefault();
            onLongPress();
          }
        }}
      >
        <div className="flex items-center gap-2">
          {selectable && (
            <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2", selected ? "border-accent bg-accent text-on-accent" : "border-line")}>
              {selected && <Icon name="check" size={18} strokeWidth={3} />}
            </span>
          )}
          <span className="text-[15px] font-semibold text-hint">#{order.number}</span>
          {d != null && <span className="text-[15px] font-semibold text-hint">· {km(d)}</span>}
          <span className="flex-1" />
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 text-[20px] font-bold leading-6">{order.address}</p>
        <p className="mt-1.5 text-[16px] text-hint">
          {friendlyDate(order.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(order.slotStart, order.slotEnd)} · {type ? t.name(type) : ""} · {size ? t.name(size) : ""} × {order.quantity}
        </p>
        <div className="mt-3">
          <MoneyLine order={order} />
        </div>
      </button>
      {children && <div className="border-t border-line p-3">{children}</div>}
    </Card>
  );
}

// ---- Directions: remember the courier's choice ----
type NavApp = "yandex" | "google" | "telegram";
const NAV_KEY = "tf_nav_app";

export function openDirections(app: NavApp, o: OrderDTO, botUsername: string | null) {
  if (o.lat == null || o.lng == null) return;
  if (app === "yandex") openLink(`https://yandex.uz/maps/?rtext=~${o.lat},${o.lng}&rtt=auto`);
  else if (app === "google") openLink(`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`);
  else {
    void api.post(`/courier/orders/${o.id}/send-location`).then(() => botUsername && openTelegramLink(`https://t.me/${botUsername}`));
  }
}

export function DirectionsButton({ order }: { order: OrderDTO }) {
  const t = useT();
  const { bot } = useSession();
  const [open, setOpen] = useState(false);
  let saved: NavApp | null = null;
  try {
    saved = localStorage.getItem(NAV_KEY) as NavApp | null;
  } catch {
    saved = null;
  }
  const choose = (app: NavApp) => {
    try {
      localStorage.setItem(NAV_KEY, app);
    } catch {
      /* ignore */
    }
    setOpen(false);
    openDirections(app, order, bot.username);
  };
  return (
    <>
      <Button
        size="xl"
        variant="outline"
        icon="nav"
        onClick={() => (saved ? openDirections(saved, order, bot.username) : setOpen(true))}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="flex-1"
      >
        {t("c_directions")}
      </Button>
      {saved && (
        <button aria-label={t("c_choose_nav")} onClick={() => setOpen(true)} className="flex h-14 w-10 items-center justify-center text-hint">
          <Icon name="down" />
        </button>
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("c_choose_nav")}>
        <div className="space-y-2">
          {(["yandex", "google", "telegram"] as NavApp[]).map((a) => (
            <Button key={a} block size="xl" variant={saved === a ? "secondary" : "outline"} onClick={() => choose(a)}>
              {t(`c_nav_${a}`)}
            </Button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

// ---- Actions ----
export function useCourierActions(onChanged?: (o?: OrderDTO) => void) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    invalidate("courier");
    invalidate("corder");
  };
  async function run(id: string, path: string, ok: string) {
    setBusy(id + path);
    try {
      const o = await api.post<OrderDTO>(`/courier/orders/${id}/${path}`);
      toast(ok);
      onChanged?.(o);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      toast(code === "taken" ? t("c_taken_other") : errorText(t, code), "error");
      onChanged?.();
    } finally {
      setBusy(null);
      refresh();
    }
  }
  return {
    busy,
    accept: (id: string) => run(id, "accept", t("c_taken_toast")),
    onTheWay: (id: string) => run(id, "on-the-way", t("c_on_way_toast")),
    giveBack: (id: string) => run(id, "give-back", t("done")),
  };
}

/** One sheet for single and batch completion. Shows the total cash to confirm. */
export function CompleteSheet({ orders, open, onClose, onDone }: { orders: OrderDTO[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [photo, setPhoto] = useState<string[]>([]);
  const [cashOk, setCashOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const cash = orders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.priceTotal, 0);
  useEffect(() => {
    if (open) {
      setPhoto([]);
      setCashOk(false);
    }
  }, [open]);
  async function confirm() {
    setBusy(true);
    try {
      await api.post("/courier/complete", { orderIds: orders.map((o) => o.id), cashConfirmed: cash > 0 ? cash : null, photoId: photo[0] ?? null });
      haptic.success();
      invalidate("courier");
      invalidate("corder");
      onDone();
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title={orders.length > 1 ? t("c_batch_confirm", { n: orders.length, total: t.som(cash) }) : t("c_done_title")}>
      {orders.length === 1 && (
        <div className="mb-4">
          <PhotoPicker ids={photo} onChange={setPhoto} max={1} kind="completion" label={t("c_proof_photo")} hint={t("optional")} />
        </div>
      )}
      {cash > 0 && (
        <button
          role="checkbox"
          aria-checked={cashOk}
          onClick={() => {
            haptic.tick();
            setCashOk(!cashOk);
          }}
          className={cx("mb-4 flex min-h-[64px] w-full items-center gap-3 rounded-card border-2 px-4 text-left text-[19px] font-bold", cashOk ? "border-accent bg-accent-soft text-accent-ink" : "border-warn bg-warn-soft text-warn")}
        >
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2", cashOk ? "border-accent bg-accent text-on-accent" : "border-warn")}>
            {cashOk && <Icon name="check" size={20} strokeWidth={3} />}
          </span>
          <span className="money">{t("c_cash_confirm", { total: t.som(cash) })}</span>
        </button>
      )}
      <Button block size="xl" icon="check" loading={busy} disabled={cash > 0 && !cashOk} onClick={confirm}>
        {orders.length > 1 ? t("c_batch_done") : t("c_complete")}
      </Button>
    </BottomSheet>
  );
}
