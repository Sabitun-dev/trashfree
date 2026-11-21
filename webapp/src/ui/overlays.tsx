// BottomSheet, Toast and the completion celebration.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { haptic } from "../lib/tg";
import { Icon } from "./Icon";
import { cx } from "./kit";

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button aria-label="close" className="absolute inset-0 bg-black/40 animate-fade" onClick={onClose} />
      <div className="card-hc relative max-h-[88vh] overflow-y-auto rounded-t-[24px] bg-card px-4 pt-2 pb-safe animate-up">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h3 className="mb-3 text-[20px] font-bold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; text: string; kind: ToastKind };
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: ToastKind = "success") => {
    if (kind === "success") haptic.success();
    else if (kind === "error") haptic.error();
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-[16px] font-medium shadow-lg animate-pop",
              t.kind === "error" ? "bg-danger text-white" : t.kind === "info" ? "bg-ink text-card" : "bg-accent text-on-accent",
            )}
          >
            <Icon name={t.kind === "error" ? "alert" : t.kind === "info" ? "bell" : "check"} size={20} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** A small celebration: confetti + big "Toza! ✨". Respects reduced motion via CSS. */
export function Celebration({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    haptic.success();
    const id = setTimeout(onDone, 2200);
    return () => clearTimeout(id);
  }, [onDone]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.2 + Math.random() * 0.9,
        color: ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#a78bfa"][i % 5],
        size: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" aria-live="assertive">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color, animation: `fall ${p.dur}s ${p.delay}s ease-in forwards` }}
        />
      ))}
      <div className="rounded-3xl bg-card px-8 py-6 text-[32px] font-extrabold text-accent-ink shadow-2xl animate-pop">{text}</div>
    </div>
  );
}
