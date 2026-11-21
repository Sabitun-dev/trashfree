// Thin, typed wrapper around Telegram.WebApp (Bot API 8.0+). Everything degrades gracefully outside Telegram.

type Haptic = {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
};

type BottomButton = {
  // position applies to SecondaryButton only
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean; has_shine_effect?: boolean; position?: "left" | "right" | "top" | "bottom" }): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  show(): void;
  hide(): void;
};

type CloudStorage = {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void;
};

export interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; language_code?: string; allows_write_to_pm?: boolean }; start_param?: string };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  onEvent(e: string, cb: (...a: unknown[]) => void): void;
  offEvent(e: string, cb: (...a: unknown[]) => void): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, cb?: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  requestContact(cb?: (ok: boolean, res?: unknown) => void): void;
  requestWriteAccess(cb?: (ok: boolean) => void): void;
  showConfirm(msg: string, cb?: (ok: boolean) => void): void;
  showAlert(msg: string, cb?: () => void): void;
  MainButton: BottomButton;
  SecondaryButton?: BottomButton;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: Haptic;
  CloudStorage: CloudStorage;
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted: boolean;
    init(cb?: () => void): void;
    getLocation(cb: (data: { latitude: number; longitude: number } | null) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export function wa(): WebApp | undefined {
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : undefined;
}

export const inTelegram = () => !!wa();
export const atLeast = (v: string) => !!wa()?.isVersionAtLeast(v);

// ---- Haptics: a tick on every action ----
export const haptic = {
  tick: () => wa()?.HapticFeedback.selectionChanged(),
  tap: () => wa()?.HapticFeedback.impactOccurred("light"),
  press: () => wa()?.HapticFeedback.impactOccurred("medium"),
  success: () => wa()?.HapticFeedback.notificationOccurred("success"),
  error: () => wa()?.HapticFeedback.notificationOccurred("error"),
  warn: () => wa()?.HapticFeedback.notificationOccurred("warning"),
};

// ---- CloudStorage (drafts). Falls back to localStorage. ----
export const cloud = {
  get(key: string): Promise<string | null> {
    const w = wa();
    if (w && atLeast("6.9")) {
      return new Promise((res) => w.CloudStorage.getItem(key, (err, v) => res(err ? null : v || null)));
    }
    try {
      return Promise.resolve(localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  },
  set(key: string, value: string): Promise<void> {
    const w = wa();
    if (w && atLeast("6.9")) return new Promise((res) => w.CloudStorage.setItem(key, value.slice(0, 4096), () => res()));
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked */
    }
    return Promise.resolve();
  },
  remove(key: string): Promise<void> {
    const w = wa();
    if (w && atLeast("6.9")) return new Promise((res) => w.CloudStorage.removeItem(key, () => res()));
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
    return Promise.resolve();
  },
};

export function requestContact(): Promise<boolean> {
  const w = wa();
  if (!w) return Promise.resolve(false);
  return new Promise((res) => w.requestContact((ok) => res(ok)));
}

export function requestWriteAccess(): Promise<boolean> {
  const w = wa();
  if (!w) return Promise.resolve(true);
  if (w.initDataUnsafe.user?.allows_write_to_pm) return Promise.resolve(true);
  return new Promise((res) => w.requestWriteAccess((ok) => res(ok)));
}

export function openInvoice(url: string): Promise<"paid" | "cancelled" | "failed" | "pending"> {
  const w = wa();
  if (!w) {
    window.open(url, "_blank");
    return Promise.resolve("pending");
  }
  return new Promise((res) => w.openInvoice(url, (s) => res(s)));
}

export function openLink(url: string) {
  const w = wa();
  if (w) w.openLink(url);
  else window.open(url, "_blank");
}

export function openTelegramLink(url: string) {
  const w = wa();
  if (w) w.openTelegramLink(url);
  else window.open(url, "_blank");
}

export function confirmDialog(msg: string): Promise<boolean> {
  const w = wa();
  if (w && atLeast("6.2")) return new Promise((res) => w.showConfirm(msg, (ok) => res(ok)));
  return Promise.resolve(window.confirm(msg));
}

/**
 * Current position. Inside Telegram (8.0+) only Telegram's LocationManager is used: it shows Telegram's own
 * permission prompt. The browser's geolocation inside Telegram's webview can hang without ever asking,
 * so it is used only outside Telegram or on old clients — always with a time limit.
 */
export function getLocation(): Promise<{ lat: number; lng: number } | null> {
  const w = wa();
  const withLimit = <T,>(p: Promise<T | null>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  const browser = () =>
    new Promise<{ lat: number; lng: number } | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    });
  const lm = w?.LocationManager;
  if (w && lm && atLeast("8.0")) {
    const viaTelegram = new Promise<{ lat: number; lng: number } | null>((res) => {
      const go = () => {
        if (!lm.isLocationAvailable) return res(null);
        lm.getLocation((d) => res(d ? { lat: d.latitude, lng: d.longitude } : null));
      };
      if (lm.isInited) go();
      else lm.init(go);
    });
    // Generous limit: the person may still be reading Telegram's permission prompt.
    return withLimit(viaTelegram, 20000);
  }
  return withLimit(browser(), 9000);
}

/** Has this user allowed the bot to message them? (From Telegram's launch data.) */
export const writeAccessKnown = () => !!wa()?.initDataUnsafe.user?.allows_write_to_pm;
