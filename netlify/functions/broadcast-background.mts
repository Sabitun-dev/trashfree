// Background function (runs up to 15 minutes): sends one broadcast, throttled.
import { timingSafeEqual } from "node:crypto";
import { backgroundSig, processBroadcast } from "../../src/server/admin/broadcast";
import { safeLog } from "../../src/server/errors";

export default async (req: Request) => {
  let id = 0;
  try {
    id = Number(((await req.json()) as { id?: number }).id);
  } catch {
    return;
  }
  const given = Buffer.from(req.headers.get("x-signature") ?? "");
  const expected = Buffer.from(backgroundSig(id));
  if (!id || given.length !== expected.length || !timingSafeEqual(given, expected)) return;
  try {
    await processBroadcast(id);
  } catch (e) {
    safeLog(`broadcast ${id} failed`, e);
  }
};
