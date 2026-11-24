// Courier map: open orders (blue) + mine (green) — trash pickups and carpet/curtain pickups alike.
// "Marshrut" orders my pickups by nearest neighbour.
import { useMemo, useState } from "react";
import { distanceKm, nearestNeighbourRoute } from "@domain/geo";
import { formatSlot } from "@domain/time";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { km } from "../../lib/format";
import { invalidate, useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useToast } from "../../ui/overlays";
import type { OrderDTO, WashDTO } from "../../lib/types";
import { MapView, type MapMarker } from "../../components/Maps";
import { Icon } from "../../ui/Icon";
import { Button } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { BottomSheet } from "../../ui/overlays";
import { svcLabel } from "../wash/parts";
import { MoneyLine, refreshMyLocation, useCourierActions, useMyLocation } from "./shared";

/** One pin on the map: a trash order or a carpet/curtain order. */
type Pin = { kind: "trash"; o: OrderDTO; open: boolean } | { kind: "wash"; o: WashDTO; open: boolean };

const hasPoint = (p: Pin) => p.o.lat != null && p.o.lng != null;

export function CourierMap() {
  const t = useT();
  const nav = useNav();
  const toast = useToast();
  const me = useMyLocation();
  const open = useQuery<OrderDTO[]>("courier:new", () => api.get("/courier/orders?tab=new"), { refreshMs: 20_000 });
  const mine = useQuery<OrderDTO[]>("courier:mine", () => api.get("/courier/orders?tab=mine"), { refreshMs: 20_000 });
  const washOpen = useQuery<WashDTO[]>("courier:wash:new", () => api.get("/wash/courier?tab=new"), { refreshMs: 20_000 });
  const washMine = useQuery<WashDTO[]>("courier:wash:mine", () => api.get("/wash/courier?tab=mine"), { refreshMs: 20_000 });
  const [route, setRoute] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = useCourierActions();

  const pins: Pin[] = [
    ...(open.data ?? []).map((o) => ({ kind: "trash" as const, o, open: true })),
    ...(washOpen.data ?? []).map((o) => ({ kind: "wash" as const, o, open: true })),
    ...(mine.data ?? []).map((o) => ({ kind: "trash" as const, o, open: false })),
    ...(washMine.data ?? []).map((o) => ({ kind: "wash" as const, o, open: false })),
  ].filter(hasPoint);
  const minePins = pins.filter((p) => !p.open);

  const ordered = useMemo(
    () => (route && me ? nearestNeighbourRoute(me, minePins.map((p) => ({ id: p.o.id, lat: p.o.lat!, lng: p.o.lng! }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, me, mine.data, washMine.data],
  );

  const markers: MapMarker[] = pins.map((p) => {
    const idx = ordered.findIndex((x) => x.id === p.o.id);
    // Carpet/curtain pins carry a letter (G / P) so they're easy to tell apart from trash pins.
    const letter = p.kind === "wash" ? (p.o.service === "carpet" ? "G" : "P") : "";
    return { id: p.o.id, lat: p.o.lat!, lng: p.o.lng!, color: p.open ? "#2563eb" : "#15803d", label: idx >= 0 ? String(idx + 1) : letter };
  });
  const sel = pins.find((p) => p.o.id === picked);
  const dist = (p: Pin) => (me && p.o.lat != null && p.o.lng != null ? distanceKm(me.lat, me.lng, p.o.lat, p.o.lng) : null);

  async function takeWash(id: string) {
    setBusy(true);
    try {
      await api.post(`/wash/orders/${id}/take`);
      toast(t("c_taken_toast"));
      setPicked(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      toast(code === "taken" ? t("c_taken_other") : errorText(t, code), "error");
    } finally {
      setBusy(false);
      invalidate("courier");
    }
  }

  const openCount = (open.data?.length ?? 0) + (washOpen.data?.length ?? 0);
  const mineCount = (mine.data?.length ?? 0) + (washMine.data?.length ?? 0);

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
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-hint">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#2563eb]" /> {t("tab_new")} · {openCount}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#15803d]" /> {t("tab_mine")} · {mineCount}</span>
        {route && <span>· {t("c_route_hint")}</span>}
      </div>

      <BottomSheet
        open={!!sel}
        onClose={() => setPicked(null)}
        title={sel ? (sel.kind === "wash" ? `${sel.o.displayNumber} · ${sel.o.address ?? ""}` : `#${sel.o.number} · ${sel.o.address}`) : ""}
      >
        {sel && (
          <div className="space-y-3">
            {sel.kind === "wash" && (
              <p className="inline-flex items-center gap-1.5 font-semibold text-accent-ink">
                <Icon name={sel.o.service} size={18} /> {t(svcLabel(sel.o.service))}
              </p>
            )}
            <p className="text-[17px] text-hint">
              {formatSlot(sel.o.slotStart, sel.o.slotEnd)}
              {dist(sel) != null && ` · ${km(dist(sel)!)}`}
            </p>
            {sel.kind === "trash" && <MoneyLine order={sel.o} big />}
            <div className="flex gap-2">
              <Button
                size="xl"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPicked(null);
                  nav.push(sel.kind === "wash" ? "c_wash" : "c_order", { id: sel.o.id });
                }}
              >
                {t("open")}
              </Button>
              {sel.kind === "trash" && sel.o.status === "open" && (
                <Button size="xl" className="flex-1" icon="hand" loading={actions.busy === sel.o.id + "accept"} onClick={() => actions.accept(sel.o.id).then(() => setPicked(null))}>
                  {t("c_take")}
                </Button>
              )}
              {sel.kind === "wash" && sel.o.status === "created" && (
                <Button size="xl" className="flex-1" icon="hand" loading={busy} onClick={() => takeWash(sel.o.id)}>
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
