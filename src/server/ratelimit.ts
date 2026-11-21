// Fixed-window rate limits stored in Postgres (serverless instances don't share memory).
import { db } from "./db";
import { tooMany } from "./errors";

/** Returns true if allowed. Atomic: one upsert-with-condition statement. */
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db().$queryRaw<{ count: number }[]>`
    INSERT INTO "RateCounter" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateCounter"."resetAt" < now() THEN 1 ELSE "RateCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "RateCounter"."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}) ELSE "RateCounter"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

export async function enforce(key: string, limit: number, windowSec: number, code = "too_many") {
  if (!(await hit(key, limit, windowSec))) throw tooMany(code);
}
