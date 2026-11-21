// App root: bootstrap → session → intro → router with a tab bar per mode.
import { Suspense, useEffect, useState } from "react";
import { decodeStartParam } from "@domain/deeplink";
import { errorText, I18nProvider, useT } from "./i18n";
import { api, ApiError } from "./lib/api";
import { useNav, RouterProvider, type Route } from "./lib/router";
import { SessionProvider, availableModes, useSession, type Mode } from "./lib/session";
import { applyTheme } from "./lib/theme";
import { inTelegram, openTelegramLink, wa } from "./lib/tg";
import type { Bootstrap, Me } from "./lib/types";
import { Button, SkeletonList } from "./ui/kit";
import { CenterScreen, OfflineBanner, TabBar, type Tab } from "./ui/layout";
import { ToastProvider } from "./ui/overlays";
import { Intro } from "./screens/common/Intro";
import { SCREENS, TAB_ROOTS } from "./screens/registry";

export function Root() {
  const [state, setState] = useState<{ data?: Bootstrap; error?: ApiError }>({});
  const load = () => {
    setState({});
    api
      .get<Bootstrap>("/bootstrap")
      .then((data) => setState({ data }))
      .catch((e) => setState({ error: e instanceof ApiError ? e : new ApiError("server", 0) }));
  };
  useEffect(() => {
    applyTheme({ highContrast: false });
    load();
  }, []);

  const lang = (state.data?.me.language ?? langGuess()) as "uz" | "ru" | "en";
  return (
    <I18nProvider lang={lang}>
      <ToastProvider>
        <OfflineBanner />
        {state.data ? (
          <SessionProvider data={state.data}>
            <LangSync />
          </SessionProvider>
        ) : state.error ? (
          <BootError error={state.error} onRetry={load} />
        ) : (
          <div className="mx-auto max-w-[560px] p-4">
            <SkeletonList n={4} h="h-28" />
          </div>
        )}
      </ToastProvider>
    </I18nProvider>
  );
}

function langGuess() {
  const c = wa()?.initDataUnsafe.user?.language_code ?? navigator.language;
  return c?.startsWith("ru") ? "ru" : c?.startsWith("en") ? "en" : "uz";
}

/** Language switching updates every screen at once. */
function LangSync() {
  const { me } = useSession();
  return (
    <I18nProvider lang={me.language}>
      <Shell />
    </I18nProvider>
  );
}

function BootError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const t = useT();
  if (error.code === "blocked") {
    return (
      <CenterScreen icon="ban" title={t("blocked_title")} text={t("blocked_text")} tone="mute">
        <Button block variant="secondary" icon="help" onClick={() => openTelegramLink("https://t.me/")}>
          {t("write_support")}
        </Button>
      </CenterScreen>
    );
  }
  if (!inTelegram() && (error.code === "unauthorized" || error.status === 401)) {
    return <CenterScreen icon="nav" title={t("not_in_telegram_title")} text={t("not_in_telegram_text")} />;
  }
  return (
    <CenterScreen icon="alert" title={errorText(t, error.code)} tone="warn">
      <Button block variant="secondary" icon="refresh" onClick={onRetry}>
        {t("retry")}
      </Button>
    </CenterScreen>
  );
}

function initialRoutes(startParam: string | null, me: Me): { mode?: Mode; routes: Route[] } {
  // Development previews only: ?route=[["name",{params}],…] opens a screen stack directly.
  if (import.meta.env.DEV) {
    const raw = new URLSearchParams(location.search).get("route");
    if (raw) {
      const list = JSON.parse(raw) as [string, Record<string, unknown>?][];
      const mode = new URLSearchParams(location.search).get("mode") as Mode | null;
      return { mode: mode ?? undefined, routes: list.map(([name, params]) => ({ name, params })) };
    }
  }
  const s = decodeStartParam(startParam);
  const modes = availableModes(me);
  switch (s.name) {
    case "order":
      return { mode: "customer", routes: [{ name: "home" }, { name: "order", params: { id: s.id } }] };
    case "courier_order":
      return modes.includes("courier") ? { mode: "courier", routes: [{ name: "c_list" }, { name: "c_order", params: { id: s.id } }] } : { routes: [] };
    case "courier":
      return modes.includes("courier") ? { mode: "courier", routes: [{ name: "c_list" }] } : { routes: [] };
    case "plans":
      return { mode: "customer", routes: [{ name: "plans" }] };
    case "new_order":
      return { mode: "customer", routes: [{ name: "home" }, { name: "new_order" }] };
    case "notifications":
      return { routes: [{ name: TAB_ROOTS[modes[0]][0].name }, { name: "notifications" }] };
    case "invite":
      return { mode: "customer", routes: [{ name: "home" }, { name: "invite", params: { token: s.token } }] };
    case "admin":
      return modes.includes("admin") ? { mode: "admin", routes: [{ name: "a_dash" }] } : { routes: [] };
    case "admin_user":
      return modes.includes("admin") ? { mode: "admin", routes: [{ name: "a_people" }, { name: "a_person", params: { id: s.id } }] } : { routes: [] };
    case "support":
      return { routes: [{ name: "home" }, { name: "support" }] };
    default:
      return { routes: [] };
  }
}

function Shell() {
  const s = useSession();
  const [boot] = useState(() => initialRoutes(s.startParam, s.me));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (boot.mode && boot.mode !== s.mode && s.modes.includes(boot.mode)) s.setMode(boot.mode);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [introDone, setIntroDone] = useState(false);
  if (!ready) return null;

  const mode = s.mode;
  if (!introDone && !s.me.introSeen.includes(mode) && boot.routes.length === 0) {
    return (
      <Intro
        mode={mode}
        onDone={() => {
          setIntroDone(true);
          api.post<Me>("/me", { introSeen: mode }).then(s.setMe).catch(() => {});
        }}
      />
    );
  }
  const root = TAB_ROOTS[mode][0].name;
  const routes = boot.routes.length && (boot.mode ?? mode) === mode ? boot.routes : [{ name: root }];
  return (
    <RouterProvider key={mode} initial={routes}>
      {(r) => <ScreenHost route={r} mode={mode} />}
    </RouterProvider>
  );
}

function ScreenHost({ route, mode }: { route: Route; mode: Mode }) {
  const t = useT();
  const nav = useNav();
  const Comp = SCREENS[route.name] ?? SCREENS[TAB_ROOTS[mode][0].name];
  const tabs: Tab[] = TAB_ROOTS[mode].map((x) => ({ name: x.name, label: t(x.label), icon: x.icon, badge: x.name === "profile" ? 0 : undefined }));
  const isTabRoot = nav.depth === 1 && tabs.some((x) => x.name === route.name);
  return (
    <>
      <Suspense
        fallback={
          <div className="mx-auto max-w-[560px] p-4">
            <SkeletonList n={3} />
          </div>
        }
      >
        <Comp {...(route.params ?? {})} />
      </Suspense>
      {isTabRoot && <TabBar tabs={tabs} active={route.name} onChange={(n) => n !== route.name && nav.reset(n)} />}
    </>
  );
}
