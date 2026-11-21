// Call button that opens the phone's own Phone app.
// Telegram's in-app browser ignores tel: links on many phones, so inside Telegram we open /call.html in the
// phone's real browser (Chrome/Safari), which hands the number to the Phone app. The number travels in the
// #hash, so it never reaches any server. Outside Telegram a plain tel: link is enough.
import { phoneDisplay } from "../lib/format";
import { haptic, inTelegram, openLink } from "../lib/tg";
import { Icon } from "../ui/Icon";
import { cx } from "../ui/kit";

export function CallButton({ phone, label, size = "xl", className }: { phone: string; label: string; size?: "md" | "xl"; className?: string }) {
  const digits = phone.replace(/[^\d+]/g, "");
  return (
    <a
      href={`tel:${digits}`}
      onClick={(e) => {
        haptic.press();
        if (inTelegram()) {
          e.preventDefault();
          openLink(`${location.origin}/call.html#${encodeURIComponent(digits)}`);
        }
      }}
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
