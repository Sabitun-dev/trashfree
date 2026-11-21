import type { Config } from "@netlify/functions";
import { keyMatches, renderSetup, runSetup } from "../../src/server/setup";

export default async (req: Request) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!keyMatches(key)) return new Response("Not found", { status: 404 });
  const checks = await runSetup();
  return new Response(renderSetup(checks), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};

export const config: Config = { path: "/setup" };
