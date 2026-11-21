// Map components. MapPicker: the pin sits in the middle and you move the map under it (easy with one thumb).
// MapView: markers (orders, courier position).
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, Marker } from "leaflet";
import { loadLeaflet, OSM_ATTR, OSM_TILES, pinHtml } from "../lib/leaflet";
import { haptic } from "../lib/tg";
import { cx } from "../ui/kit";

export function MapPicker({
  center,
  onMove,
  className = "h-[42vh] min-h-[240px]",
  flyTo,
}: {
  center: { lat: number; lng: number };
  onMove: (p: { lat: number; lng: number }) => void;
  className?: string;
  flyTo?: { lat: number; lng: number; at: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadLeaflet().then((L) => {
      if (!alive || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], 16);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTR }).addTo(m);
      m.on("movestart", () => setDragging(true));
      m.on("moveend", () => {
        setDragging(false);
        haptic.tick();
        const c = m.getCenter();
        onMoveRef.current({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) });
      });
      map.current = m;
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (flyTo && map.current) map.current.setView([flyTo.lat, flyTo.lng], Math.max(map.current.getZoom(), 16));
  }, [flyTo]);

  return (
    <div className={cx("card-hc relative overflow-hidden rounded-card bg-line", className)}>
      <div ref={el} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500]" aria-hidden>
        <div className={cx("transition-transform duration-150", dragging && "-translate-y-2")} dangerouslySetInnerHTML={{ __html: pinHtml("#15803d") }} />
        <div className="absolute -left-1.5 -top-1 h-2 w-3 rounded-full bg-black/30" />
      </div>
    </div>
  );
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
}

export function MapView({
  markers,
  me,
  className = "h-48",
  onMarker,
  route,
}: {
  markers: MapMarker[];
  me?: { lat: number; lng: number } | null;
  className?: string;
  onMarker?: (id: string) => void;
  route?: { lat: number; lng: number }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<Marker[]>([]);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const onMarkerRef = useRef(onMarker);
  onMarkerRef.current = onMarker;

  useEffect(() => {
    let alive = true;
    void loadLeaflet().then((lib) => {
      if (!alive || !el.current) return;
      const m = lib.map(el.current, { zoomControl: false }).setView([41.3111, 69.2797], 12);
      lib.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTR }).addTo(m);
      map.current = m;
      setL(lib);
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const key = JSON.stringify([markers.map((m) => [m.id, m.lat, m.lng, m.color, m.label]), me, route]);
  useEffect(() => {
    const m = map.current;
    if (!m || !L) return;
    layer.current.forEach((x) => x.remove());
    layer.current = [];
    const pts: [number, number][] = [];
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: L.divIcon({ html: pinHtml(mk.color, mk.label), className: "", iconSize: [0, 0] }) }).addTo(m);
      marker.on("click", () => {
        haptic.tick();
        onMarkerRef.current?.(mk.id);
      });
      layer.current.push(marker);
      pts.push([mk.lat, mk.lng]);
    }
    if (me) {
      const dot = L.marker([me.lat, me.lng], {
        icon: L.divIcon({ html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25);transform:translate(-9px,-9px)"></div>', className: "", iconSize: [0, 0] }),
      }).addTo(m);
      layer.current.push(dot);
      pts.push([me.lat, me.lng]);
    }
    if (route && route.length > 1) {
      const line = L.polyline(
        route.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#15803d", weight: 4, dashArray: "6 8" },
      ).addTo(m);
      layer.current.push(line as unknown as Marker);
    }
    m.invalidateSize();
    if (pts.length === 1) m.setView(pts[0], 15, { animate: false });
    else if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 16, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, key]);

  return <div ref={el} className={cx("card-hc relative z-0 overflow-hidden rounded-card bg-line", className)} />;
}
