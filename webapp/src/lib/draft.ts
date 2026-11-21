// The order draft lives in Telegram CloudStorage, so closing the app loses nothing.
import { useEffect, useSyncExternalStore } from "react";
import type { PaymentMethod } from "@domain/types";
import { newIdempotencyKey } from "./api";
import { cloud } from "./tg";

export interface Draft {
  v: 1;
  lat: number | null;
  lng: number | null;
  address: string;
  notes: string;
  addressId: number | null;
  saveLabel: string | null;
  trashType: string | null;
  packageSize: string | null;
  quantity: number;
  date: string | null;
  slotId: number | null;
  method: PaymentMethod | null;
  photoIds: string[];
  idem: string;
  repeat?: boolean;
}

const KEY = "order_draft";

export const emptyDraft = (): Draft => ({
  v: 1,
  lat: null,
  lng: null,
  address: "",
  notes: "",
  addressId: null,
  saveLabel: null,
  trashType: null,
  packageSize: null,
  quantity: 1,
  date: null,
  slotId: null,
  method: null,
  photoIds: [],
  idem: newIdempotencyKey(),
});

let draft: Draft = emptyDraft();
let loaded = false;
let restored = false;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  subs.forEach((s) => s());
}

export function loadDraft(): Promise<void> {
  if (loaded) return Promise.resolve();
  return (loading ??= cloud.get(KEY).then((raw) => {
    if (raw) {
      try {
        const d = JSON.parse(raw) as Draft;
        if (d.v === 1) {
          draft = { ...emptyDraft(), ...d };
          restored = !!(d.lat || d.trashType);
        }
      } catch {
        /* ignore broken drafts */
      }
    }
    loaded = true;
    emit();
  }));
}

export function updateDraft(patch: Partial<Draft>) {
  draft = { ...draft, ...patch };
  emit();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void cloud.set(KEY, JSON.stringify(draft)), 400);
}

export function replaceDraft(d: Draft) {
  draft = d;
  restored = false;
  emit();
  void cloud.set(KEY, JSON.stringify(draft));
}

export function clearDraft() {
  draft = emptyDraft();
  restored = false;
  emit();
  clearTimeout(saveTimer);
  void cloud.remove(KEY);
}

/** True once, when a saved draft was found on load (shows a small toast). */
export function takeRestored() {
  const r = restored;
  restored = false;
  return r;
}

export function useDraft(): { draft: Draft; ready: boolean } {
  useEffect(() => {
    void loadDraft();
  }, []);
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => draft,
  );
  return { draft, ready: loaded };
}
