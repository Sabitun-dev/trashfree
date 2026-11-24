// Profile & settings: language, mode, notification categories, sunlight mode, privacy.
import { useState } from "react";
import { MUTABLE_CATEGORIES, type MutableCategory } from "@domain/types";
import { errorText, useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { phoneDisplay } from "../../lib/format";
import { useNav } from "../../lib/router";
import { useSession, type Mode } from "../../lib/session";
import { confirmDialog, openTelegramLink, wa } from "../../lib/tg";
import type { Me } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { Button, Card, Chip, Row, RowGroup, Section, Toggle } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { useToast } from "../../ui/overlays";

const LANGS = [
  { code: "uz", label: "O'zbekcha" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

/**
 * "Yordam": the bot first writes "ask your question here", then the app closes so the person lands in the bot chat.
 * (Opening a link to the same bot from inside its own app does nothing visible on most phones.)
 */
export async function openSupport(bot: { username: string | null }, prompt = true) {
  if (prompt) await api.post("/support/start").catch(() => {});
  if (bot.username) openTelegramLink(`https://t.me/${bot.username}`);
  const w = wa();
  if (w) setTimeout(() => w.close(), 400);
}

export function supportLink(bot: { username: string | null }) {
  return bot.username ? `https://t.me/${bot.username}` : "";
}

export function Profile() {
  const t = useT();
  const s = useSession();
  const nav = useNav();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const me = s.me;

  async function patch(body: Record<string, unknown>, optimistic?: Partial<Me>) {
    const prev = me;
    if (optimistic) s.setMe({ ...me, ...optimistic });
    try {
      s.setMe(await api.post<Me>("/me", body));
    } catch (e) {
      s.setMe(prev);
      toast(errorText(t, e instanceof ApiError ? e.code : undefined), "error");
    }
  }

  const visibleCats = MUTABLE_CATEGORIES.filter((c) => c !== "new_orders" || s.modes.includes("courier"));
  const catLabel: Record<MutableCategory, string> = { new_orders: t("mute_new_orders"), reminders: t("mute_reminders"), news: t("mute_news") };

  async function requestDeletion() {
    if (!(await confirmDialog(t("delete_my_data_text")))) return;
    setBusy(true);
    try {
      await api.post("/me/delete-request");
      s.setMe({ ...me, deletionRequested: true });
      toast(t("delete_requested"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t("profile")} hasTabBar>
      <Card className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[22px] font-bold text-accent-ink">{me.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate text-[19px] font-semibold">{me.name}</p>
          <p className="text-hint">{me.phone ? phoneDisplay(me.phone) : "—"}</p>
        </div>
      </Card>

      {s.modes.length > 1 && (
        <Section title={t("mode")}>
          <div className="flex gap-2">
            {s.modes.map((m: Mode) => (
              <Chip
                key={m}
                selected={s.mode === m}
                className="flex-1"
                onClick={() => {
                  s.setMode(m);
                  nav.reset(m === "courier" ? "c_list" : m === "admin" ? "a_dash" : m === "washer" ? "w_list" : "home");
                }}
              >
                {t(`mode_${m}`)}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title={t("language")}>
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <Chip key={l.code} selected={me.language === l.code} className="flex-1" onClick={() => patch({ language: l.code }, { language: l.code })}>
              {l.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t("notifications")}>
        <RowGroup>
          {visibleCats.map((c) => {
            const on = !me.mutedCategories.includes(c);
            const next = on ? [...me.mutedCategories, c] : me.mutedCategories.filter((x) => x !== c);
            return <Row key={c} label={catLabel[c]} right={<Toggle checked={on} label={catLabel[c]} onChange={() => patch({ mutedCategories: next }, { mutedCategories: next })} />} />;
          })}
        </RowGroup>
        <p className="mt-2 px-1 text-[14px] text-hint">{t("mute_hint")}</p>
      </Section>

      {s.modes.includes("courier") && (
        <Section>
          <RowGroup>
            <Row icon="sun" label={t("high_contrast")} right={<Toggle checked={s.highContrast} label={t("high_contrast")} onChange={s.setHighContrast} />} />
          </RowGroup>
        </Section>
      )}

      <Section>
        <RowGroup>
          <Row icon="pin" label={t("my_addresses")} onClick={() => nav.push("addresses")} />
          <Row icon="receipt" label={t("payments_history")} onClick={() => nav.push("payments")} />
          <Row icon="help" label={t("help")} onClick={() => openSupport(s.bot)} />
        </RowGroup>
      </Section>

      <Section>
        {me.deletionRequested ? (
          <Card className="text-center">
            <p className="text-hint">{t("delete_requested")}</p>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={async () => {
                await api.post("/me/delete-request/cancel");
                s.setMe({ ...me, deletionRequested: false });
              }}
            >
              {t("delete_cancel")}
            </Button>
          </Card>
        ) : (
          <RowGroup>
            <Row icon="trash" danger label={t("delete_my_data")} onClick={busy ? undefined : requestDeletion} right={<Icon name="right" size={18} />} />
          </RowGroup>
        )}
      </Section>
      <p className="mt-6 text-center text-[13px] text-hint">Trashfree · v1.0</p>
    </Page>
  );
}
