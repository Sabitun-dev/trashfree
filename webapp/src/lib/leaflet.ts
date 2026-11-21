// Leaflet loads only when a map is first shown (keeps the first screen fast on 3G).
type L = typeof import("leaflet");
let p: Promise<L> | null = null;

export function loadLeaflet(): Promise<L> {
  return (p ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([m]) => ((m as unknown as { default?: L }).default ?? m) as L));
}

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** A coloured pin as a div icon (no image files needed). */
export function pinHtml(color: string, label = "") {
  return `<div style="position:relative;width:36px;height:46px;transform:translate(-18px,-46px)">
<svg width="36" height="46" viewBox="0 0 36 46"><path d="M18 45s15-14.2 15-27A15 15 0 0 0 3 18c0 12.8 15 27 15 27z" fill="${color}" stroke="white" stroke-width="3"/></svg>
<span style="position:absolute;top:8px;left:0;width:36px;text-align:center;color:white;font:700 13px/18px system-ui">${label}</span></div>`;
}
