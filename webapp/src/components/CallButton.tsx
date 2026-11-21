// A real tel: link. Telegram's openLink() only opens web pages, so phone calls must be a plain link.
// The number is shown on the button too, so it can always be read or long-pressed to copy.
import { phoneDisplay } from "../lib/format";
import { haptic } from "../lib/tg";
import { Icon } from "../ui/Icon";
import { cx } from "../ui/kit";

export function CallButton({ phone, label, size = "xl", className }: { phone: string; label: string; size?: "md" | "xl"; className?: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      onClick={() => haptic.press()}
      aria-label={`${label} ${phoneDisplay(phone)}`}
      className={cx(
        "card-hc inline-flex select-text flex-col items-center justify-center rounded-2xl bg-accent px-3 text-on-accent no-underline transition active:scale-[.98]",
        size === "xl" ? "min-h-tap-lg" : "min-h-[44px]",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-[17px] font-semibold leading-5">
        <Icon name="phone" size={20} /> {label}
      </span>
      <span className="text-[13px] font-medium leading-4 opacity-90">{phoneDisplay(phone)}</span>
    </a>
  );
}
