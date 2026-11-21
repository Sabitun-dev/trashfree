// Phone, then name confirmation: 2 taps. The server accepts the phone only from the bot's contact message.
import { useEffect, useRef, useState } from "react";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { phoneDisplay } from "../../lib/format";
import { useSession } from "../../lib/session";
import { haptic, inTelegram, requestContact, requestWriteAccess } from "../../lib/tg";
import type { Me } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { inputCls } from "../../ui/kit";
import { CenterScreen } from "../../ui/layout";
import { useToast } from "../../ui/overlays";

/** Wraps a screen: shows the phone / name steps first when needed. */
export function RequirePhone({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  if (!me.phone) return <PhoneStep />;
  if (!me.nameConfirmed) return <NameStep />;
  return <>{children}</>;
}

function PhoneStep() {
  const t = useT();
  const { setMe } = useSession();
  const toast = useToast();
  const [waiting, setWaiting] = useState(false);
  const [denied, setDenied] = useState(false);
  const stop = useRef(false);

  useEffect(() => () => void (stop.current = true), []);

  async function poll() {
    // The contact arrives at the bot a moment later; wait for the server to store it.
    for (let i = 0; i < 20 && !stop.current; i++) {
      try {
        const me = await api.get<Me>("/me");
        if (me.phone) {
          haptic.success();
          setMe(me);
          return;
        }
      } catch {
        /* keep trying */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    setWaiting(false);
    toast(t("err_server"), "error");
  }

  async function ask() {
    setDenied(false);
    const ok = await requestContact();
    if (!ok && inTelegram()) {
      setDenied(true);
      haptic.warn();
      return;
    }
    setWaiting(true);
    void requestWriteAccess();
    await poll();
  }

  return (
    <CenterScreen icon="phone" title={t("phone_title")} text={denied ? t("phone_denied") : t("phone_text")} tone={denied ? "warn" : "accent"}>
      {waiting && (
        <p className="flex items-center justify-center gap-2 text-hint">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          {t("phone_waiting")}
        </p>
      )}
      <MainButton text={t("phone_button")} onClick={ask} loading={waiting} />
    </CenterScreen>
  );
}

function NameStep() {
  const t = useT();
  const { me, setMe } = useSession();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      setMe(await api.post<Me>("/me", { name: name.trim(), nameConfirmed: true }));
    } catch (e) {
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <CenterScreen icon="user" title={t("name_title")} text={t("name_text")}>
      <input className={inputCls + " text-center text-[20px] font-semibold"} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label={t("name_title")} />
      <p className="mt-3 flex items-center justify-center gap-1.5 text-hint">
        <Icon name="phone" size={16} /> {phoneDisplay(me.phone)}
      </p>
      <MainButton text={t("name_ok")} onClick={confirm} loading={busy} disabled={!name.trim()} />
    </CenterScreen>
  );
}
