// Hono app type, auth middleware and error handling for /api/*.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { ZodError, type ZodType } from "zod";
import { can, type Action } from "../../domain/permissions";
import { validateInitData } from "../auth/initData";
import { env } from "../env";
import { ApiError, forbidden, safeLog } from "../errors";
import { upsertTelegramUser, type AuthUser } from "../users";

export type Env = { Variables: { user: AuthUser; startParam?: string } };
export type Ctx = Context<Env>;

export function createApp() {
  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, ...(err.data ?? {}) }, err.status as 400);
    if (err instanceof ZodError) return c.json({ error: "invalid", issues: err.issues.slice(0, 5).map((i) => i.path.join(".")) }, 400);
    safeLog(`API ${c.req.method} ${c.req.path} failed`, err);
    return c.json({ error: "server" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}

/** Validates initData on every request. Never trusts a user id from the client. */
export const auth: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const raw = header.startsWith("tma ") ? header.slice(4) : null;
  const res = validateInitData(raw, env.botToken);
  if (!res.ok) throw new ApiError(401, res.reason === "expired" ? "session_expired" : "unauthorized");
  const user = await upsertTelegramUser(res.data.user);
  if (user.blocked) throw new ApiError(403, "blocked");
  c.set("user", user);
  c.set("startParam", res.data.startParam);
  await next();
};

export const requireAction =
  (action: Action): MiddlewareHandler<Env> =>
  async (c, next) => {
    if (!can(c.get("user").role, action)) throw forbidden();
    await next();
  };

export async function body<T>(c: Ctx, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}

export function query<T>(c: Ctx, schema: ZodType<T>): T {
  return schema.parse(c.req.query());
}

/** JSON that survives BigInt values. */
export function json(c: Ctx, data: unknown, status = 200) {
  return c.body(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), status as 200, {
    "content-type": "application/json; charset=utf-8",
  });
}
