import { db, type Tx } from "./db";

export interface AuditEntry {
  actorId: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

const json = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))));

export async function audit(e: AuditEntry, tx?: Tx) {
  await (tx ?? db()).auditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId == null ? null : String(e.entityId),
      before: json(e.before),
      after: json(e.after),
      reason: e.reason ?? null,
    },
  });
}
