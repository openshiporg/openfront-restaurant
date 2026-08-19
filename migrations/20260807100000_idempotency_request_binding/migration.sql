BEGIN;

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL DEFAULT '',
  "requestMethod" TEXT NOT NULL DEFAULT 'POST',
  "requestParams" JSONB,
  "requestPath" TEXT NOT NULL DEFAULT '',
  "responseCode" INTEGER,
  "responseBody" JSONB,
  "recoveryPoint" TEXT NOT NULL DEFAULT 'started',
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IdempotencyKey"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "requestMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "requestParams" JSONB,
  ADD COLUMN IF NOT EXISTS "requestPath" TEXT,
  ADD COLUMN IF NOT EXISTS "responseCode" INTEGER,
  ADD COLUMN IF NOT EXISTS "responseBody" JSONB,
  ADD COLUMN IF NOT EXISTS "recoveryPoint" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "IdempotencyKey"
SET
  "idempotencyKey" = CASE
    WHEN NULLIF(BTRIM("idempotencyKey"), '') IS NULL THEN 'legacy:idempotency:' || "id"
    ELSE BTRIM("idempotencyKey")
  END,
  "requestMethod" = COALESCE(NULLIF(BTRIM("requestMethod"), ''), 'POST'),
  "requestPath" = COALESCE(NULLIF(BTRIM("requestPath"), ''), 'legacy'),
  "recoveryPoint" = COALESCE(NULLIF(BTRIM("recoveryPoint"), ''), 'started'),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP);

WITH ranked AS (
  SELECT
    "id",
    "idempotencyKey",
    ROW_NUMBER() OVER (PARTITION BY "idempotencyKey" ORDER BY "createdAt", "id") AS duplicate_rank
  FROM "IdempotencyKey"
)
UPDATE "IdempotencyKey" AS target
SET "idempotencyKey" = ranked."idempotencyKey" || ':duplicate:' || target."id"
FROM ranked
WHERE target."id" = ranked."id" AND ranked.duplicate_rank > 1;

ALTER TABLE "IdempotencyKey"
  ALTER COLUMN "idempotencyKey" SET DEFAULT '',
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "requestMethod" SET DEFAULT 'POST',
  ALTER COLUMN "requestMethod" SET NOT NULL,
  ALTER COLUMN "requestPath" SET DEFAULT '',
  ALTER COLUMN "requestPath" SET NOT NULL,
  ALTER COLUMN "recoveryPoint" SET DEFAULT 'started',
  ALTER COLUMN "recoveryPoint" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_idempotencyKey_key"
  ON "IdempotencyKey"("idempotencyKey");

COMMIT;
