// A small stack router that matches Telegram's BackButton. One screen = one question.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useBackButton } from "./buttons";

export type Route = { name: string; params?: Record<string, unknown> };

interface Nav {
  current: Route;
  depth: number;
  push: (name: string, params?: Record<string, unknown>) => void;
  replace: (name: string, params?: Record<string, unknown>) => void;
  back: () => void;
  reset: (name: string, params?: Record<string, unknown>) => void;
}

const Ctx = createContext<Nav | null>(null);

export function RouterProvider({ initial, children }: { initial: Route[]; children: (r: Route) => ReactNode }) {
  const [stack, setStack] = useState<Route[]>(initial.length ? initial : [{ name: "home" }]);
  const push = useCallback((name: string, params?: Record<string, unknown>) => {
    setStack((s) => [...s, { name, params }]);
    window.scrollTo(0, 0);
  }, []);
  const replace = useCallback((name: string, params?: Record<string, unknown>) => setStack((s) => [...s.slice(0, -1), { name, params }]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((name: string, params?: Record<string, unknown>) => {
    setStack([{ name, params }]);
    window.scrollTo(0, 0);
  }, []);
  const current = stack[stack.length - 1];
  const nav = useMemo(() => ({ current, depth: stack.length, push, replace, back, reset }), [current, stack.length, push, replace, back, reset]);
  useBackButton(stack.length > 1 ? back : null);
  return (
    <Ctx.Provider value={nav}>
      <div key={`${stack.length}:${current.name}`} className="animate-fade">
        {children(current)}
      </div>
    </Ctx.Provider>
  );
}

export function useNav(): Nav {
  const n = useContext(Ctx);
  if (!n) throw new Error("useNav outside RouterProvider");
  return n;
}
