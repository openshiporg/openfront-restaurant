import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { canonicalIdempotencyParams, idempotencyFingerprint } from "./idempotency";

export type ManagerApprovalAction = "void_item" | "comp_item" | "void_order" | "refund_payment";

export type ManagerApprovalRequest = {
  actionType: ManagerApprovalAction;
  targetId: string;
  reason: string;
  amount?: number | null;
};

function normalizedRequest(input: ManagerApprovalRequest) {
  return canonicalIdempotencyParams({
    actionType: input.actionType,
    targetId: input.targetId,
    reason: input.reason.trim(),
    amount: input.amount ?? null,
  });
}

function canApproveAction(context: Context, actionType: ManagerApprovalAction) {
  return actionType === "refund_payment"
    ? permissions.canManagePayments({ session: context.session })
    : permissions.canManageOrders({ session: context.session });
}

export async function requestManagerApproval(
  _root: unknown,
  input: ManagerApprovalRequest,
  context: Context
) {
  const requesterId = context.session?.itemId;
  if (!requesterId || !canApproveAction(context, input.actionType)) {
    throw new Error("Not authorized to request this manager approval");
  }
  if (!input.targetId?.trim()) throw new Error("Approval target is required");
  if (!input.reason?.trim()) throw new Error("Approval reason is required");

  const requestPayload = normalizedRequest(input);
  return (context.prisma as any).managerApproval.create({
    data: {
      actionType: input.actionType,
      targetId: input.targetId.trim(),
      reason: input.reason.trim(),
      amount: input.amount ?? null,
      requestPayload,
      requestFingerprint: idempotencyFingerprint(requestPayload),
      status: "pending",
      requestedById: requesterId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
}

export async function approveManagerApproval(
  _root: unknown,
  { approvalId }: { approvalId: string },
  context: Context
) {
  const approverId = context.session?.itemId;
  if (!approverId) throw new Error("Not authorized to approve manager actions");
  const prisma = context.prisma as any;

  const outcome = await prisma.$transaction(async (tx: any) => {
    const approval = await tx.managerApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error("Manager approval request not found");
    if (!canApproveAction(context, approval.actionType)) {
      throw new Error("Not authorized to approve this manager action");
    }
    if (approval.requestedById === approverId) {
      throw new Error("A manager cannot approve their own correction request");
    }
    if (approval.status !== "pending") throw new Error(`Manager approval is already ${approval.status}`);
    if (new Date(approval.expiresAt) <= new Date()) {
      const expired = await tx.managerApproval.update({ where: { id: approval.id }, data: { status: "expired" } });
      return { expired };
    }
    const updated = await tx.managerApproval.updateMany({
      where: { id: approval.id, status: "pending", requestedById: { not: approverId } },
      data: { status: "approved", approvedById: approverId, approvedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("Manager approval changed concurrently");
    return { approval: await tx.managerApproval.findUnique({ where: { id: approval.id } }) };
  }, { isolationLevel: "Serializable" });
  if (outcome.expired) throw new Error("Manager approval request has expired");
  return outcome.approval;
}

export async function consumeManagerApproval(
  tx: any,
  input: ManagerApprovalRequest & {
    approvalId: string | null | undefined;
    actorId: string | null | undefined;
    entityType: string;
    entityId: string;
  }
) {
  if (!input.approvalId) throw new Error("Independent manager approval is required");
  if (!input.actorId) throw new Error("Authenticated correction actor is required");
  const approval = await tx.managerApproval.findUnique({ where: { id: input.approvalId } });
  if (!approval) throw new Error("Manager approval request not found");
  const requestPayload = normalizedRequest(input);
  if (
    approval.requestFingerprint !== idempotencyFingerprint(approval.requestPayload || {}) ||
    approval.requestFingerprint !== idempotencyFingerprint(requestPayload) ||
    approval.requestedById !== input.actorId
  ) {
    throw new Error("Manager approval does not match this correction request");
  }
  if (!approval.approvedById || approval.approvedById === input.actorId) {
    throw new Error("Correction requires approval by a different manager");
  }
  if (approval.status !== "approved") throw new Error(`Manager approval is ${approval.status}`);
  if (new Date(approval.expiresAt) <= new Date()) throw new Error("Manager approval has expired");

  const consumed = await tx.managerApproval.updateMany({
    where: {
      id: approval.id,
      status: "approved",
      requestedById: input.actorId,
      approvedById: { not: input.actorId },
      expiresAt: { gt: new Date() },
    },
    data: {
      status: "consumed",
      consumedAt: new Date(),
      consumedEntityType: input.entityType,
      consumedEntityId: input.entityId,
    },
  });
  if (consumed.count !== 1) throw new Error("Manager approval was already consumed or expired");
  return approval;
}
