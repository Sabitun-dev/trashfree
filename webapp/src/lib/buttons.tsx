// Telegram MainButton / SecondaryButton / BackButton as React components.
// Outside Telegram (browser preview, screenshots) the same component renders a normal bottom button.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { accentColors } from "./theme";
import { atLeast, haptic, wa } from "./tg";
import { cx } from "../ui/kit";

interface MainButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Second button next to the main one (Bot API 7.10+). */
  secondary?: { text: string; onClick: () => void };
  tone?: "accent" | "warn";
}

export function MainButton({ text, onClick, disabled, loading, secondary, tone = "accent" }: MainButtonProps) {
  const w = wa();
  const cb = useRef(onClick);
  cb.current = onClick;
  const cb2 = useRef(secondary?.onClick);
  cb2.current = secondary?.onClick;

  useEffect(() => {
    if (!w) return;
    const handler = () => {
      haptic.press();
      cb.current();
    };
    w.MainButton.onClick(handler);
    return () => {
      w.MainButton.offClick(handler);
      w.MainButton.hide();
    };
  }, [w]);

  useEffect(() => {
    if (!w) return;
    const c = accentColors();
    const color = tone === "warn" ? "#b45309" : c.color;
    w.MainButton.setParams({ text, color, text_color: tone === "warn" ? "#ffffff" : c.text, is_active: !disabled && !loading, is_visible: true });
    if (loading) w.MainButton.showProgress(false);
    else w.MainButton.hideProgress();
  }, [w, text, disabled, loading, tone]);

  const hasSecondary = !!secondary;
  const secondaryText = secondary?.text;
  useEffect(() => {
    const sb = w?.SecondaryButton;
    if (!w || !sb || !atLeast("7.10")) return;
    if (!hasSecondary) {
      sb.hide();
      return;
    }
    const handler = () => {
      haptic.tap();
      cb2.current?.();
    };
    sb.onClick(handler);
    sb.setParams({ text: secondaryText, is_visible: true, is_active: true, position: "left" });
    return () => {
      sb.offClick(handler);
      sb.hide();
    };
  }, [w, hasSecondary, secondaryText]);

  if (w) {
    // Old clients without SecondaryButton: show it in the page instead.
    if (secondary && !(w.SecondaryButton && atLeast("7.10"))) return <InlineSecondary {...secondary} />;
    return null;
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-line bg-card px-4 pt-3 pb-safe">
      {secondary && (
        <button onClick={secondary.onClick} className="min-h-tap flex-1 rounded-2xl bg-accent-soft px-4 text-[17px] font-semibold text-accent-ink">
          {secondary.text}
        </button>
      )}
      <button
        onClick={() => {
          haptic.press();
          onClick();
        }}
        disabled={disabled || loading}
        className={cx("min-h-tap flex-[2] rounded-2xl px-4 text-[17px] font-semibold disabled:opacity-50", tone === "warn" ? "bg-warn text-white" : "bg-accent text-on-accent")}
      >
        {loading ? "…" : text}
      </button>
    </div>,
    document.body,
  );
}

function InlineSecondary({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-4 min-h-tap w-full rounded-2xl bg-accent-soft px-4 text-[17px] font-semibold text-accent-ink">
      {text}
    </button>
  );
}

/** Whether a page needs bottom padding for our fallback button (outside Telegram). */
export const fallbackBottomPad = () => (wa() ? "pb-6" : "pb-28");

export function useBackButton(handler: (() => void) | null) {
  const ref = useRef(handler);
  ref.current = handler;
  const active = !!handler;
  useEffect(() => {
    const w = wa();
    if (!w || !active) return;
    const h = () => {
      haptic.tick();
      ref.current?.();
    };
    w.BackButton.onClick(h);
    w.BackButton.show();
    return () => {
      w.BackButton.offClick(h);
      w.BackButton.hide();
    };
  }, [active]);
}
