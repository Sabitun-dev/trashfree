import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localName, type Lang, type Named } from "@domain/types";
import { formatNumber } from "@domain/money";
import { en } from "./en";
import { ru } from "./ru";
import { uz, type DictKey } from "./uz";

const DICTS = { uz, ru, en };

export type T = ((key: DictKey, params?: Record<string, string | number>) => string) & {
  lang: Lang;
  name: (item: Named) => string;
  som: (n: number) => string;
  has: (key: string) => key is DictKey;
};

function make(lang: Lang): T {
  const dict = DICTS[lang];
  const fn = ((key: DictKey, params?: Record<string, string | number>) => {
    const s = dict[key] ?? uz[key] ?? key;
    return params ? s.replace(/\{(\w+)\}/g, (_m, k) => (params[k] !== undefined ? String(params[k]) : "")) : s;
  }) as T;
  fn.lang = lang;
  // Functions have a read-only built-in `name`; redefine it (it is configurable).
  Object.defineProperty(fn, "name", { value: (item: Named) => localName(item, lang) });
  fn.som = (n) => `${formatNumber(n)} ${dict.som}`;
  fn.has = (key: string): key is DictKey => key in dict;
  return fn;
}

const Ctx = createContext<T>(make("uz"));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = useMemo(() => make(lang), [lang]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);

/** Friendly text for an API error code. */
export function errorText(t: T, code: string | undefined, params?: Record<string, string | number>): string {
  const key = `err_${code ?? "server"}`;
  return t.has(key) ? t(key, params) : t("err_server");
}
