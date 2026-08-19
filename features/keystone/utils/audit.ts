import crypto from "node:crypto";
import type { Context } from ".keystone/types";

export type AuditEventInput = {
  eventKey?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  approverId?: string | null;
};

export async function appendAuditEventWithClient(
  prisma: any,
  actorId: string | null | undefined,
  input: AuditEventInput
) {
  const eventKey = input.eventKey || crypto.randomUUID();
  return prisma.auditEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      eventKey,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason || "",
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      metadata: input.metadata ?? undefined,
      actorId: actorId || null,
      approverId: input.approverId || null,
    },
  });
}

export async function appendAuditEvent(context: Context, input: AuditEventInput) {
  return appendAuditEventWithClient(context.prisma as any, context.session?.itemId, input);
}
