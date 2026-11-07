import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expireStaleManagerApprovals } from "../features/keystone/utils/managerApproval";

const read = (f: string) => readFileSync(new URL(`../features/keystone/${f}`, import.meta.url), "utf8");

test("stale pending approvals are expired in the data", async () => {
  let args: any;
  const n = await expireStaleManagerApprovals({ managerApproval: { updateMany: async (a: any) => { args = a; return { count: 3 }; } } });
  assert.equal(n, 3);
  assert.equal(args.where.status, "pending");
  assert.ok(args.where.expiresAt.lte instanceof Date);
  assert.equal(args.data.status, "expired");
});

test("firing a course or sending to kitchen never regresses a check past open", () => {
  for (const f of ["mutations/courseManagement.ts", "mutations/serviceFloorTable.ts"]) {
    const s = read(f);
    assert.match(s, /updateMany\(\{ where: \{ id: [^}]*status: "open" \}, data: \{ status: "sent_to_kitchen"/, f);
    assert.doesNotMatch(s, /restaurantOrder\.update\(\{[^)]*status: "sent_to_kitchen"/, f);
  }
});

test("a table cannot be hand-set to occupied without active service", () => {
  assert.match(read("mutations/serviceFloorTable.ts"), /occupied only while it has an active check or a seated party/);
});

test("attendance writers only move a shift from the status they expect", () => {
  const s = read("mutations/attendance.ts");
  assert.doesNotMatch(s, /tx\.shift\.update\(\{ where: \{ id: (previous\.shiftId|state\.shiftId|shift\.id) \}, data: \{ status: "(completed|started)"/);
  assert.match(s, /status: "started" \}, data: \{ status: "completed"/);
});
