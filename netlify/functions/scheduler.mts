// Runs every 15 minutes: expire unpaid orders, reminders, cleanup (daily jobs run once a day).
import type { Config } from "@netlify/functions";
import { runScheduler } from "../../src/server/scheduler";

export default async () => {
  const results = await runScheduler();
  return new Response(JSON.stringify(results), { headers: { "content-type": "application/json" } });
};

export const config: Config = { schedule: "*/15 * * * *" };
