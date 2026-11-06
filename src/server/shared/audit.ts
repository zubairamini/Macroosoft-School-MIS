// Audit trail writer. Always called inside the same transaction as the
// mutation it describes. Passwords, tokens, and hashes are never included
// in before/after payloads (callers pass DTO-shaped values only).

import type { Prisma } from "@prisma/client";

export interface AuditInput {
  actorId: string | null;
  actorName: string;
  action: string; // e.g. "application.enroll"
  entity: string; // e.g. "Application"
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string | null;
}

type Tx = Prisma.TransactionClient;

export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  });
}

// Transactional outbox: committed transactions reliably trigger background
// work. A worker (apps/worker in the production layout) drains these.
export async function writeOutbox(
  tx: Tx,
  type: string,
  payload: unknown,
): Promise<void> {
  await tx.outboxEvent.create({
    data: { type, payload: JSON.stringify(payload) },
  });
}

// Atomic, monotonic document numbering. Called inside transactions so
// concurrent creates cannot produce duplicate numbers.
export async function nextDocNumber(
  tx: Tx,
  kind: string,
  scopeKey: string,
): Promise<number> {
  const key = `${kind}:${scopeKey}`;
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}
