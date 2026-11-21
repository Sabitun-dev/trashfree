// Session: the signed-in user, catalog and settings from /api/bootstrap, plus the current mode.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isAdmin } from "@domain/permissions";
import { api } from "./api";
import { applyTheme } from "./theme";
import type { Bootstrap, Me } from "./types";

export type Mode = "customer" | "courier" | "admin";

interface Session extends Bootstrap {
  mode: Mode;
  modes: Mode[];
  setMode: (m: Mode) => void;
  refresh: () => Promise<void>;
  setMe: (m: Me) => void;
  setUnread: (n: number) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
}

const Ctx = createContext<Session | null>(null);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* blocked */
  }
};

export function availableModes(me: Me): Mode[] {
  const m: Mode[] = [];
  if (isAdmin(me.role)) m.push("admin");
  if (me.role === "courier" || (isAdmin(me.role) && me.cityIds.length > 0)) m.push("courier");
  m.push("customer");
  return m;
}

export function SessionProvider({ data, children }: { data: Bootstrap; children: ReactNode }) {
  const [boot, setBoot] = useState(data);
  const modes = availableModes(boot.me);
  const saved = read("tf_mode") as Mode | null;
  const [mode, setModeState] = useState<Mode>(saved && modes.includes(saved) ? saved : modes[0]);
  const [highContrast, setHC] = useState(read("tf_hc") === "1");

  useEffect(() => {
    applyTheme({ highContrast: highContrast && mode === "courier" });
  }, [highContrast, mode]);

  const refresh = useCallback(async () => {
    setBoot(await api.get<Bootstrap>("/bootstrap"));
  }, []);

  const value = useMemo<Session>(
    () => ({
      ...boot,
      mode: modes.includes(mode) ? mode : modes[0],
      modes,
      setMode: (m) => {
        write("tf_mode", m);
        setModeState(m);
      },
      refresh,
      setMe: (me) => setBoot((b) => ({ ...b, me })),
      setUnread: (unread) => setBoot((b) => ({ ...b, unread })),
      highContrast,
      setHighContrast: (v) => {
        write("tf_hc", v ? "1" : "0");
        setHC(v);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boot, mode, highContrast, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
