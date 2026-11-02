/** Manager approval mutations report failures in `error` instead of throwing. */
export function requireApprovalPayload<T extends { error?: string | null }>(payload: T | null | undefined): T {
  if (!payload) throw new Error("Approval service returned no result");
  if (payload.error) throw new Error(payload.error);
  return payload;
}
