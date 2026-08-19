BEGIN;

-- Durable, idempotent audit identity for transactional evidence writes.
ALTER TABLE "AuditEvent" ADD COLUMN IF NOT EXISTS "eventKey" TEXT;
UPDATE "AuditEvent"
SET "eventKey" = 'legacy:audit:' || "id"
WHERE "eventKey" IS NULL OR btrim("eventKey") = '';

WITH ranked AS (
  SELECT "id", "eventKey", row_number() OVER (PARTITION BY "eventKey" ORDER BY "createdAt", "id") AS ordinal
  FROM "AuditEvent"
)
UPDATE "AuditEvent" AS target
SET "eventKey" = target."eventKey" || ':duplicate:' || ranked.ordinal || ':' || target."id"
FROM ranked
WHERE target."id" = ranked."id" AND ranked.ordinal > 1;

ALTER TABLE "AuditEvent" ALTER COLUMN "eventKey" SET DEFAULT '';
ALTER TABLE "AuditEvent" ALTER COLUMN "eventKey" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- One approval is requested by the operation actor, approved by a different
-- authorized session, then consumed atomically with the correction/refund.
CREATE TABLE IF NOT EXISTS "ManagerApproval" (
  "id" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "amount" INTEGER,
  "requestFingerprint" TEXT NOT NULL DEFAULT '',
  "requestPayload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedEntityType" TEXT NOT NULL DEFAULT '',
  "consumedEntityId" TEXT NOT NULL DEFAULT '',
  "requestedBy" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagerApproval_pkey" PRIMARY KEY ("id")
);

DO $$
DECLARE
  primary_columns TEXT[];
BEGIN
  SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
    INTO primary_columns
  FROM pg_constraint constraint_row
  JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality) ON TRUE
  JOIN pg_attribute attribute
    ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key_column.attnum
  WHERE constraint_row.conrelid = '"ManagerApproval"'::regclass
    AND constraint_row.contype = 'p';

  IF primary_columns IS DISTINCT FROM ARRAY['id']::TEXT[] THEN
    RAISE EXCEPTION 'ManagerApproval must have id as its sole primary key; found %', primary_columns;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ManagerApproval_actionType_idx" ON "ManagerApproval"("actionType");
CREATE INDEX IF NOT EXISTS "ManagerApproval_targetId_idx" ON "ManagerApproval"("targetId");
CREATE INDEX IF NOT EXISTS "ManagerApproval_status_idx" ON "ManagerApproval"("status");
CREATE INDEX IF NOT EXISTS "ManagerApproval_requestedAt_idx" ON "ManagerApproval"("requestedAt");
CREATE INDEX IF NOT EXISTS "ManagerApproval_expiresAt_idx" ON "ManagerApproval"("expiresAt");
CREATE INDEX IF NOT EXISTS "ManagerApproval_requestedBy_idx" ON "ManagerApproval"("requestedBy");
CREATE INDEX IF NOT EXISTS "ManagerApproval_approvedBy_idx" ON "ManagerApproval"("approvedBy");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManagerApproval_requestedBy_fkey') THEN
    ALTER TABLE "ManagerApproval"
      ADD CONSTRAINT "ManagerApproval_requestedBy_fkey"
      FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManagerApproval_approvedBy_fkey') THEN
    ALTER TABLE "ManagerApproval"
      ADD CONSTRAINT "ManagerApproval_approvedBy_fkey"
      FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
