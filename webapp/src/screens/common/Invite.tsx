// Courier invite (startapp=inv_<token>) and the "support" deep link.
import { useEffect, useState } from "react";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { openTelegramLink } from "../../lib/tg";
import { CenterScreen } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { supportLink } from "./Profile";

export function Invite({ token }: { token: string }) {
  const t = useT();
  const s = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setBusy(true);
    try {
      await api.post("/invite/accept", { token });
      toast(t("invite_done"));
      await s.refresh();
      s.setMode("courier");
    } catch (e) {
      setError(errorText(t, e instanceof ApiError ? e.code : undefined));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CenterScreen icon="truck" title={t("invite_title")} text={error ?? t("invite_text")} tone={error ? "warn" : "accent"}>
      {!error && <MainButton text={t("invite_accept")} loading={busy} onClick={accept} />}
    </CenterScreen>
  );
}

export function Support() {
  const t = useT();
  const s = useSession();
  const nav = useNav();
  useEffect(() => {
    openTelegramLink(supportLink(s.bot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <CenterScreen icon="help" title={t("help")} text={t("write_support")}>
      <MainButton text={t("write_support")} onClick={() => openTelegramLink(supportLink(s.bot))} secondary={{ text: t("back"), onClick: () => nav.reset("home") }} />
    </CenterScreen>
  );
}
