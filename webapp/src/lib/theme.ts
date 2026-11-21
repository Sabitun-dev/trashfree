// Maps Telegram theme colours onto our tokens and keeps text contrast at WCAG AA in light and dark.
import { wa } from "./tg";

type RGB = [number, number, number];

function hex(h?: string): RGB | null {
  if (!h) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lum = ([r, g, b]: RGB) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

/** Move `fg` towards `toward` until it reaches the target contrast on `bg`. */
export function ensureContrast(fg: RGB, bg: RGB, toward: RGB, target = 4.5): RGB {
  let c = fg;
  for (let t = 0; t <= 1 && contrast(c, bg) < target; t += 0.1) c = mix(fg, toward, t);
  return c;
}

const str = (c: RGB) => c.join(" ");

export function applyTheme(opts: { highContrast: boolean }) {
  const root = document.documentElement;
  const w = wa();
  const dark = w ? w.colorScheme === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", !!dark && !opts.highContrast);
  root.classList.toggle("hc", opts.highContrast);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) root.classList.add("reduce-motion");

  const tp = w?.themeParams ?? {};
  const card = hex(tp.section_bg_color) ?? hex(tp.bg_color);
  const page = hex(tp.secondary_bg_color);
  const ink = hex(tp.text_color);
  const hint = hex(tp.hint_color) ?? hex(tp.subtitle_text_color);
  if (!opts.highContrast && card && ink && contrast(ink, card) >= 4.5) {
    root.style.setProperty("--c-card", str(card));
    root.style.setProperty("--c-ink", str(ink));
    if (page) root.style.setProperty("--c-page", str(page));
    if (hint) root.style.setProperty("--c-hint", str(ensureContrast(hint, card, ink)));
    root.style.setProperty("--c-line", str(mix(card, ink, 0.12)));
  } else {
    for (const k of ["card", "ink", "page", "hint", "line"]) root.style.removeProperty(`--c-${k}`);
  }

  if (w) {
    const css = getComputedStyle(root);
    const toHex = (v: string) =>
      "#" +
      v
        .trim()
        .split(/\s+/)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
    try {
      w.setHeaderColor(toHex(css.getPropertyValue("--c-page")));
      w.setBackgroundColor(toHex(css.getPropertyValue("--c-page")));
      w.setBottomBarColor?.(toHex(css.getPropertyValue("--c-card")));
    } catch {
      /* older clients */
    }
  }
}

/** Accent colours for the Telegram MainButton. */
export function accentColors() {
  const css = getComputedStyle(document.documentElement);
  const toHex = (name: string) =>
    "#" +
    css
      .getPropertyValue(name)
      .trim()
      .split(/\s+/)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
  return { color: toHex("--c-accent"), text: toHex("--c-on-accent") };
}
