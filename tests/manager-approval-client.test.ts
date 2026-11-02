import test from "node:test";
import assert from "node:assert/strict";
import { requireApprovalPayload } from "../features/platform/payments/components/approvalResult";

test("approval payload with error throws that error", () => {
  assert.throws(() => requireApprovalPayload({ id: "a", status: null, error: "Cannot approve your own request" }), /Cannot approve your own request/);
});
test("missing payload throws", () => { assert.throws(() => requireApprovalPayload(null)); });
test("clean payload passes through", () => {
  const p = { id: "a", status: "approved", error: null };
  assert.equal(requireApprovalPayload(p), p);
});
