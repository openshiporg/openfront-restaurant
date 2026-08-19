import type { Context } from ".keystone/types";
import {
  approveManagerApproval as approveApproval,
  requestManagerApproval as requestApproval,
  type ManagerApprovalAction,
} from "../utils/managerApproval";

const ACTIONS = new Set<ManagerApprovalAction>([
  "void_item",
  "comp_item",
  "void_order",
  "refund_payment",
]);

function result(approval: any) {
  return {
    id: approval.id,
    status: approval.status,
    actionType: approval.actionType,
    targetId: approval.targetId,
    expiresAt: approval.expiresAt instanceof Date
      ? approval.expiresAt.toISOString()
      : String(approval.expiresAt),
    error: null,
  };
}

export async function requestManagerApproval(
  _root: unknown,
  args: { actionType: string; targetId: string; reason: string; amount?: number | null },
  context: Context
) {
  try {
    if (!ACTIONS.has(args.actionType as ManagerApprovalAction)) {
      throw new Error("Unsupported manager approval action");
    }
    return result(await requestApproval(_root, {
      ...args,
      actionType: args.actionType as ManagerApprovalAction,
    }, context));
  } catch (error) {
    return { id: null, status: null, actionType: args.actionType, targetId: args.targetId, expiresAt: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function approveManagerApproval(
  _root: unknown,
  args: { approvalId: string },
  context: Context
) {
  try {
    return result(await approveApproval(_root, args, context));
  } catch (error) {
    return { id: args.approvalId, status: null, actionType: null, targetId: null, expiresAt: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
