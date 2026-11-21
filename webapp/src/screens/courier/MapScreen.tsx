// Courier map: open orders (blue) + mine (green). "Marshrut" orders my pickups by nearest neighbour.
import { useMemo, useState } from "react";
import { nearestNeighbourRoute } from "@domain/geo";
import { formatSlot } from "@domain/time";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { km } from "../../lib/format";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useToast } from "../../ui/overlays";
import type { OrderDTO } from "../../lib/types";
import { MapView, type MapMarker } from "../../components/Maps";
import { Button } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet } from "../../ui/overlays";
import { MoneyLine, distanceFrom, refreshMyLocation, useCourierActions, useMyLocation } from "./shared";

export function CourierMap() {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const me = useMyLocation();
  const open = useQuery<OrderDTO[]>("courier:new", () => api.get("/courier/orders?tab=new"), { refreshMs: 20_000 });
  const mine = useQuery<OrderDTO[]>("courier:mine", () => api.get("/courier/orders?tab=mine"), { refreshMs: 20_000 });
  const [route, setRoute] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const actions = useCourierActions();

  const mineList = (mine.data ?? []).filter((o) => o.lat != null && o.lng != null);
  const ordered = useMemo(
    () => (route && me ? nearestNeighbourRoute(me, mineList.map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng! }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, me, mine.data],
  );

  const markers: MapMarker[] = [
    ...(open.data ?? []).filter((o) => o.lat != null).map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, color: "#2563eb" })),
    ...mineList.map((o) => {
      const idx = ordered.findIndex((p) => p.id === o.id);
      return { id: o.id, lat: o.lat!, lng: o.lng!, color: "#15803d", label: idx >= 0 ? String(idx + 1) : "" };
    }),
  ];
  const all = [...(open.data ?? []), ...(mine.data ?? [])];
  const sel = all.find((o) => o.id === picked);

  return (
    <Page hasTabBar title={t("tab_map")}>
      <div className="relative">
        <MapView className="h-[62vh] min-h-[320px]" markers={markers} me={me} onMarker={setPicked} route={route && me ? [me, ...ordered] : undefined} />
        <div className="absolute inset-x-3 bottom-3 z-[500] flex gap-2">
          <Button
            size="xl"
            className="flex-1 shadow-lg"
            icon="route"
            variant={route ? "secondary" : "primary"}
            onClick={async () => {
              const p = me ?? (await refreshMyLocation());
              if (!p) return toast(t("c_no_location"), "error");
              setRoute(!route);
            }}
          >
            {t("c_route")}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[15px] text-hint">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#2563eb]" /> {t("tab_new")} · {open.data?.length ?? 0}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#15803d]" /> {t("tab_mine")} · {mine.data?.length ?? 0}</span>
        {route && <span>· {t("c_route_hint")}</span>}
      </div>

      <BottomSheet open={!!sel} onClose={() => setPicked(null)} title={sel ? `#${sel.number} · ${sel.address}` : ""}>
        {sel && (
          <div className="space-y-3">
            <p className="text-[17px] text-hint">
              {formatSlot(sel.slotStart, sel.slotEnd)}
              {distanceFrom(me, sel) != null && ` · ${km(distanceFrom(me, sel)!)}`}
            </p>
            <MoneyLine order={sel} big />
            <div className="flex gap-2">
              <Button size="xl" variant="outline" className="flex-1" onClick={() => { setPicked(null); nav.push("c_order", { id: sel.id }); }}>
                {t("open")}
              </Button>
              {sel.status === "open" && (
                <Button size="xl" className="flex-1" icon="hand" loading={actions.busy === sel.id + "accept"} onClick={() => actions.accept(sel.id).then(() => setPicked(null))}>
                  {t("c_take")}
                </Button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}
