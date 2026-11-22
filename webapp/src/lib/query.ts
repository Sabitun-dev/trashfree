// Tiny data-fetching hook with a shared cache (stale-while-revalidate). No extra library needed.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError } from "./api";

type Entry = { data?: unknown; error?: ApiError; at: number; promise?: Promise<unknown> };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
  emit();
}

/** Load data into the cache in the background (no re-render until someone reads it). */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>) {
  if (cache.has(key)) return;
  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      emit();
    })
    .catch(() => {
      cache.delete(key);
      emit();
    });
  cache.set(key, { at: 0, promise });
}

export function setQueryData<T>(key: string, data: T) {
  cache.set(key, { data, at: Date.now() });
  emit();
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts: { refreshMs?: number; staleMs?: number } = {}) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [, force] = useState(0);

  const load = useCallback(
    async (silent = false) => {
      if (!key) return;
      const e = cache.get(key) ?? { at: 0 };
      if (e.promise) return e.promise;
      const promise = fetcherRef
        .current()
        .then((data) => cache.set(key, { data, at: Date.now() }))
        .catch((err: unknown) => {
          const error = err instanceof ApiError ? err : new ApiError("server", 0);
          cache.set(key, { ...cache.get(key), error, at: Date.now(), promise: undefined });
        })
        .finally(() => {
          const cur = cache.get(key);
          if (cur) delete cur.promise;
          emit();
        });
      cache.set(key, { ...e, promise, error: silent ? e.error : undefined });
      if (!silent) force((n) => n + 1);
      return promise;
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    const stale = !e || Date.now() - e.at > (opts.staleMs ?? 15_000);
    if (stale) void load(!!e?.data);
    if (!opts.refreshMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, opts.refreshMs);
    return () => clearInterval(id);
  }, [key, load, opts.refreshMs, opts.staleMs]);

  const e = key ? cache.get(key) : undefined;
  return {
    data: e?.data as T | undefined,
    error: e?.data ? undefined : e?.error,
    loading: !!key && !e?.data && !e?.error,
    refreshing: !!e?.promise,
    refetch: () => load(true),
  };
}
