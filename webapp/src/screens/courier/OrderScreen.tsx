// Courier order card: big address, distance, slot, details, photo, money, call, directions, actions.
import { CallButton } from "../../components/CallButton";
import { useState } from "react";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api } from "../../lib/api";
import { friendlyDate, km, phoneDisplay } from "../../lib/format";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { confirmDialog, openLink } from "../../lib/tg";
import type { OrderDTO } from "../../lib/types";
import { MapView } from "../../components/Maps";
import { PrivatePhoto } from "../../components/Photos";
import { Icon } from "../../ui/Icon";
import { Button, Card, ErrorState, KeyValue, Skeleton } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { Celebration } from "../../ui/overlays";
import { StatusBadge } from "../../ui/status";
import { CompleteSheet, DirectionsButton, MoneyLine, distanceFrom, useCourierActions, useMyLocation } from "./shared";

export function CourierOrderScreen({ id }: { id: string }) {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const me = useMyLocation();
  const q = useQuery<OrderDTO>(`corder:${id}`, () => api.get(`/orders/${id}`), { refreshMs: 15_000 });
  const [sheet, setSheet] = useState(false);
  const [party, setParty] = useState(false);
  const actions = useCourierActions((o) => {
    if (!o) nav.back();
  });
  const o = q.data;
  if (q.loading) return <Page><Skeleton className="h-72" /></Page>;
  if (!o) return <Page><ErrorState text={errorText(t, q.error?.code === "not_found" ? "taken" : q.error?.code)} onRetry={q.refetch} retryLabel={t("retry")} /></Page>;

  const type = s.catalog.trashTypes.find((x) => x.id === o.trashTypeId);
  const size = s.catalog.packageSizes.find((x) => x.id === o.packageSizeId);
  const d = distanceFrom(me, o);
  const mine = o.courier?.id === s.me.id;

  return (
    <Page hasMainButton>
      {party && <Celebration text={t("celebrate")} onDone={() => { setParty(false); nav.back(); }} />}
      <div className="flex items-center gap-2">
        <span className="text-[16px] font-semibold text-hint">#{o.number}</span>
        {d != null && <span className="text-[16px] font-semibold text-hint">· {t("c_from_you", { d: km(d) })}</span>}
        <span className="flex-1" />
        <StatusBadge status={o.status} />
      </div>
      <h1 className="mt-2 text-[26px] font-extrabold leading-8">{o.address}</h1>
      {o.notes && <p className="mt-2 rounded-2xl bg-info-soft px-3 py-2 text-[17px] font-medium text-info">{o.notes}</p>}

      <div className="mt-4">
        <MoneyLine order={o} big />
      </div>

      <Card className="mt-4 text-[17px]">
        <KeyValue k={t("slot")} v={<b>{friendlyDate(o.pickupDate, t.lang, { today: t("today"), tomorrow: t("tomorrow") })}, {formatSlot(o.slotStart, o.slotEnd)}</b>} />
        <KeyValue k={t("type")} v={type ? t.name(type) : ""} />
        <KeyValue k={t("size")} v={<b>{size ? t.name(size) : ""} × {o.quantity}</b>} />
        {o.customer && <KeyValue k={t("a_customer")} v={o.customer.name} />}
      </Card>

      {o.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {o.photos.map((p) => (
            <PrivatePhoto key={p.id} id={p.id} className="h-36 w-36 shrink-0 rounded-card" />
          ))}
        </div>
      )}

      {o.lat != null && o.lng != null && <MapView className="mt-3 h-44" markers={[{ id: o.id, lat: o.lat, lng: o.lng, color: "#15803d" }]} me={me} />}

      <div className="mt-4 flex items-stretch gap-2">
        {o.customer?.phone ? (
          <CallButton phone={o.customer.phone} label={t("call")} className="flex-1" />
        ) : (
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-line/50 px-3 text-[14px] leading-5 text-hint">
            <Icon name="phone" size={18} /> {t("c_phone_after")}
          </div>
        )}
        <DirectionsButton order={o} />
      </div>

      <div className="mt-4 space-y-2">
        {o.status === "open" && (
          <Button block size="xl" icon="hand" loading={actions.busy === o.id + "accept"} onClick={() => actions.accept(o.id).then(() => q.refetch())}>
            {t("c_take")}
          </Button>
        )}
        {mine && o.status === "accepted" && (
          <Button block size="xl" variant="secondary" icon="truck" loading={actions.busy === o.id + "on-the-way"} onClick={() => actions.onTheWay(o.id).then(() => q.refetch())}>
            {t("c_on_way")}
          </Button>
        )}
        {mine && (o.status === "accepted" || o.status === "on_the_way") && (
          <Button block size="xl" icon="check" onClick={() => setSheet(true)}>
            {t("c_done")}
          </Button>
        )}
        {mine && o.status === "accepted" && (
          <Button
            block
            variant="ghost"
            onClick={async () => {
              if (await confirmDialog(`${t("c_give_back")}?`)) await actions.giveBack(o.id).then(() => nav.back());
            }}
          >
            {t("c_give_back")}
          </Button>
        )}
      </div>

      <CompleteSheet
        open={sheet}
        orders={[o]}
        onClose={() => setSheet(false)}
        onDone={() => {
          setSheet(false);
          setParty(true);
          void q.refetch();
        }}
      />
    </Page>
  );
}
