// API client. Every request carries the Telegram initData; the server checks it.
import { wa } from "./tg";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

type Transport = (method: string, path: string, body?: unknown, isForm?: boolean) => Promise<unknown>;

let initDataOverride: string | null = null;
export function setInitData(s: string) {
  initDataOverride = s;
}

const httpTransport: Transport = async (method, path, body, isForm) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("offline", 0);
  const headers: Record<string, string> = { authorization: `tma ${initDataOverride ?? wa()?.initData ?? ""}` };
  if (body !== undefined && !isForm) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...rest } = data as { error?: string };
    throw new ApiError(error ?? "server", res.status, rest);
  }
  return data;
};

let transport: Transport = httpTransport;
export function setTransport(t: Transport) {
  transport = t;
}

export const api = {
  get: <T>(path: string) => transport("GET", path) as Promise<T>,
  post: <T>(path: string, body: unknown = {}) => transport("POST", path, body) as Promise<T>,
  put: <T>(path: string, body: unknown = {}) => transport("PUT", path, body) as Promise<T>,
  del: <T>(path: string) => transport("DELETE", path) as Promise<T>,
  upload: <T>(path: string, form: FormData) => transport("POST", path, form, true) as Promise<T>,
};

/** Private photos are loaded with auth headers and shown from an object URL. */
const photoCache = new Map<string, string>();
export async function photoUrl(id: string): Promise<string> {
  const hit = photoCache.get(id);
  if (hit) return hit;
  if (id.startsWith("mock:") || id.startsWith("data:")) return id.replace(/^mock:/, "");
  const res = await fetch(`/api/photos/${id}`, { headers: { authorization: `tma ${initDataOverride ?? wa()?.initData ?? ""}` } });
  if (!res.ok) throw new ApiError("photo", res.status);
  const url = URL.createObjectURL(await res.blob());
  photoCache.set(id, url);
  return url;
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
