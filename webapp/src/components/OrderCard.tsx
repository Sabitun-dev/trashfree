// A live order card for the customer: status, tracker, where and when.
import { ONLINE_METHODS } from "@domain/types";
import { formatSlot } from "@domain/time";
import { useT } from "../i18n";
import { friendlyDate } from "../lib/format";
import { useSession } from "../lib/session";
import type { OrderDTO } from "../lib/types";
import { Icon } from "../ui/Icon";
import { Card } from "../ui/kit";
import { StatusBadge, StatusTracker } from "../ui/status";

export function OrderCard({ order, onClick, tracker = true }: { order: OrderDTO; onClick?: () => void; tracker?: boolean }) {
  const t = useT();
  const { catalog } = useSession();
  const type = catalog.trashTypes.find((x) => x.id === order.trashTypeId);
  const size = catalog.packageSizes.find((x) => x.id === order.packageSizeId);
  const online = ONLINE_METHODS.includes(order.paymentMethod);
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-hint">#{order.number}</span>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-[17px] font-semibold leading-6">{order.address}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-hint">
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar" size={16} />
          {friendlyDate(order.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(order.slotStart, order.slotEnd)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="bag" size={16} />
          {type ? t.name(type) : ""} · {size ? t.name(size) : ""} × {order.quantity}
        </span>
      </p>
      {tracker && <StatusTracker status={order.status} online={online} />}
    </Card>
  );
}
