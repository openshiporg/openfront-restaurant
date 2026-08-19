/*
  Forward-only bounded-core migration.

  This migration intentionally supports both:
  1. a database replayed only from repository migration history; and
  2. a maintained database whose current schema already contains some or all
     of these columns/tables from earlier schema synchronization, but whose
     Prisma migration history does not contain this migration.

  Existing nonblank business keys and snapshot values are preserved. New
  required values are backfilled before NOT NULL/unique integrity is applied.
  No rows or business facts are deleted.
*/
BEGIN;

-- The superseded non-unique index may already be absent on a drifted schema.
DROP INDEX IF EXISTS "PaymentSession_idempotencyKey_idx";

-- Existing-table additions are nullable first so populated databases remain
-- migratable. Defaults and NOT NULL requirements are applied after backfill.
ALTER TABLE "Cart" ALTER COLUMN "tipPercent" SET DEFAULT '0';

ALTER TABLE "GiftCardTransaction"
  ADD COLUMN IF NOT EXISTS "balanceAfter" INTEGER,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT;

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "adjustmentTotal" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "isVoided" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "itemNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "itemThumbnailSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "kitchenStationSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "menuItemIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modifiersSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "originalOrderIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "voidReason" TEXT,
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedBy" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "refundedAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3);

ALTER TABLE "StockMovement"
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "referenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceType" TEXT;

ALTER TABLE "StoreSettings"
  ADD COLUMN IF NOT EXISTS "logoColor" TEXT,
  ADD COLUMN IF NOT EXISTS "logoIcon" TEXT;

ALTER TABLE "StoreSettings"
  ALTER COLUMN "heroHeadline" SET DEFAULT 'Fresh meals for pickup and delivery.',
  ALTER COLUMN "heroSubheadline" SET DEFAULT 'A modern ordering storefront with house favorites, quick pickup, and a menu built to customize.',
  ALTER COLUMN "heroTagline" SET DEFAULT 'Made fresh daily · Ready when you are';

ALTER TABLE "WasteLog"
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedBy" TEXT;

-- CREATE TABLE IF NOT EXISTS handles fresh replay and a fully drifted schema.
-- The following ADD COLUMN IF NOT EXISTS blocks also repair partially-created
-- drifted tables without replacing or truncating them.
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT '',
  "entityType" TEXT NOT NULL DEFAULT '',
  "entityId" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "actor" TEXT,
  "approver" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AuditEvent"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "entityId" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "before" JSONB,
  ADD COLUMN IF NOT EXISTS "after" JSONB,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actor" TEXT,
  ADD COLUMN IF NOT EXISTS "approver" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "OrderAdjustment" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB,
  "order" TEXT,
  "orderItem" TEXT,
  "actor" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "OrderAdjustment"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "order" TEXT,
  ADD COLUMN IF NOT EXISTS "orderItem" TEXT,
  ADD COLUMN IF NOT EXISTS "actor" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Receipt" (
  "id" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'sale',
  "amount" INTEGER NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB,
  "issuedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "order" TEXT,
  "payment" TEXT,
  "refund" TEXT,
  "correctsReceipt" TEXT,
  "issuedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "order" TEXT,
  ADD COLUMN IF NOT EXISTS "payment" TEXT,
  ADD COLUMN IF NOT EXISTS "refund" TEXT,
  ADD COLUMN IF NOT EXISTS "correctsReceipt" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Refund" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL DEFAULT '',
  "amount" INTEGER NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'processing',
  "reason" TEXT NOT NULL DEFAULT '',
  "providerRefundId" TEXT NOT NULL DEFAULT '',
  "providerData" JSONB,
  "processedAt" TIMESTAMP(3),
  "payment" TEXT,
  "order" TEXT,
  "requestedBy" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Refund"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "providerRefundId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerData" JSONB,
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payment" TEXT,
  ADD COLUMN IF NOT EXISTS "order" TEXT,
  ADD COLUMN IF NOT EXISTS "requestedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL DEFAULT '',
  "providerCode" TEXT NOT NULL DEFAULT '',
  "providerEventId" TEXT NOT NULL DEFAULT '',
  "eventType" TEXT NOT NULL DEFAULT '',
  "status" TEXT DEFAULT 'received',
  "payload" JSONB,
  "rawBody" TEXT NOT NULL DEFAULT '',
  "error" TEXT NOT NULL DEFAULT '',
  "attempts" INTEGER DEFAULT 0,
  "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "payment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "PaymentWebhookEvent"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
  ADD COLUMN IF NOT EXISTS "providerCode" TEXT,
  ADD COLUMN IF NOT EXISTS "providerEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "payload" JSONB,
  ADD COLUMN IF NOT EXISTS "rawBody" TEXT,
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payment" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Some maintained databases received this table from an earlier generated
-- contract where status was a PostgreSQL enum. The current Keystone contract
-- stores status as text; convert without changing values before text backfills.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'PaymentWebhookEvent'
      AND column_name = 'status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE "PaymentWebhookEvent"
      ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "KitchenTicketEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL DEFAULT '',
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "ticket" TEXT,
  "order" TEXT,
  "orderItem" TEXT,
  "actor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "KitchenTicketEvent"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
  ADD COLUMN IF NOT EXISTS "payload" JSONB,
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ticket" TEXT,
  ADD COLUMN IF NOT EXISTS "order" TEXT,
  ADD COLUMN IF NOT EXISTS "orderItem" TEXT,
  ADD COLUMN IF NOT EXISTS "actor" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Preserve existing nonblank sold snapshots. Empty/new values are populated
-- from the best current relational facts available at migration time.
UPDATE "OrderItem" oi
SET
  "itemNameSnapshot" = CASE
    WHEN NULLIF(BTRIM(oi."itemNameSnapshot"), '') IS NOT NULL THEN oi."itemNameSnapshot"
    ELSE COALESCE(NULLIF(mi."name", ''), 'Legacy item')
  END,
  "itemThumbnailSnapshot" = CASE
    WHEN NULLIF(BTRIM(oi."itemThumbnailSnapshot"), '') IS NOT NULL THEN oi."itemThumbnailSnapshot"
    ELSE COALESCE((
      SELECT image."imagePath"
      FROM "_MenuItem_menuItemImages" link
      JOIN "MenuItemImage" image ON image."id" = link."B"
      WHERE link."A" = mi."id"
      ORDER BY image."order" NULLS LAST, image."id"
      LIMIT 1
    ), '')
  END,
  "kitchenStationSnapshot" = CASE
    WHEN NULLIF(BTRIM(oi."kitchenStationSnapshot"), '') IS NOT NULL THEN oi."kitchenStationSnapshot"
    ELSE COALESCE(NULLIF(mi."kitchenStation", ''), 'expo')
  END,
  "menuItemIdSnapshot" = CASE
    WHEN NULLIF(BTRIM(oi."menuItemIdSnapshot"), '') IS NOT NULL THEN oi."menuItemIdSnapshot"
    ELSE COALESCE(oi."menuItem", '')
  END,
  "originalOrderIdSnapshot" = CASE
    WHEN NULLIF(BTRIM(oi."originalOrderIdSnapshot"), '') IS NOT NULL THEN oi."originalOrderIdSnapshot"
    ELSE COALESCE(oi."order", '')
  END
FROM "MenuItem" mi
WHERE mi."id" = oi."menuItem";

-- Orphaned historical lines retain explicit deterministic placeholders rather
-- than borrowing facts from another item.
UPDATE "OrderItem"
SET
  "itemNameSnapshot" = COALESCE(NULLIF("itemNameSnapshot", ''), 'Legacy item'),
  "itemThumbnailSnapshot" = COALESCE("itemThumbnailSnapshot", ''),
  "kitchenStationSnapshot" = COALESCE(NULLIF("kitchenStationSnapshot", ''), 'expo'),
  "menuItemIdSnapshot" = COALESCE("menuItemIdSnapshot", "menuItem", ''),
  "originalOrderIdSnapshot" = COALESCE("originalOrderIdSnapshot", "order", ''),
  "adjustmentTotal" = COALESCE("adjustmentTotal", 0),
  "isVoided" = COALESCE("isVoided", false),
  "voidReason" = COALESCE("voidReason", '');

UPDATE "OrderItem" oi
SET "modifiersSnapshot" = COALESCE((
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', modifier."id",
      'name', modifier."name",
      'modifierGroup', modifier."modifierGroup",
      'modifierGroupLabel', NULLIF(modifier."modifierGroupLabel", ''),
      'priceAdjustment', COALESCE(modifier."priceAdjustment", 0)
    ) ORDER BY modifier."id"
  )
  FROM "_OrderItem_appliedModifiers" link
  JOIN "MenuItemModifier" modifier ON modifier."id" = link."A"
  WHERE link."B" = oi."id"
), '[]'::JSONB)
WHERE oi."modifiersSnapshot" IS NULL;

-- Historical gift-card rows used signed amounts. Reconstruct each known
-- balance-after value backwards from the card's current balance; this exactly
-- preserves the current card balance. Orphan transactions receive 0 because
-- no defensible opening/current balance exists. Existing populated values win.
WITH history AS (
  SELECT
    gct."id",
    COALESCE(
      card."balance" - COALESCE(
        SUM(gct."amount") OVER (
          PARTITION BY COALESCE(gct."giftCard", gct."id")
          ORDER BY gct."createdAt", gct."id"
          ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ),
        0
      ),
      0
    )::INTEGER AS reconstructed_balance
  FROM "GiftCardTransaction" gct
  LEFT JOIN "GiftCard" card ON card."id" = gct."giftCard"
)
UPDATE "GiftCardTransaction" gct
SET "balanceAfter" = history.reconstructed_balance
FROM history
WHERE gct."id" = history."id"
  AND gct."balanceAfter" IS NULL;

UPDATE "GiftCardTransaction"
SET "type" = CASE
  WHEN "type" IS NOT NULL AND BTRIM("type") <> '' THEN "type"
  WHEN "amount" < 0 THEN 'redeem'
  ELSE 'adjustment'
END;

-- Deterministically fill missing keys and repair only the second/subsequent
-- copies of duplicate nonblank keys. The lowest lexical id retains the original
-- key; rewritten keys are stable id-derived values. Collision suffixes are
-- deterministic and never overwrite another row's key.
CREATE OR REPLACE FUNCTION pg_temp.backfill_unique_text_key(
  target_table REGCLASS,
  key_column TEXT,
  key_prefix TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  target_row RECORD;
  candidate TEXT;
  base_candidate TEXT;
  collision BOOLEAN;
  suffix INTEGER;
BEGIN
  FOR target_row IN EXECUTE FORMAT(
    'SELECT id::text AS id FROM %s current_row
     WHERE %I IS NULL
        OR BTRIM(%I) = ''''
        OR (
          SELECT COUNT(*) FROM %s earlier
          WHERE earlier.%I = current_row.%I
            AND earlier.id::text <= current_row.id::text
        ) > 1
     ORDER BY id::text',
    target_table, key_column, key_column,
    target_table, key_column, key_column
  ) LOOP
    base_candidate := key_prefix || target_row.id;
    candidate := base_candidate;
    suffix := 0;
    LOOP
      EXECUTE FORMAT(
        'SELECT EXISTS (
           SELECT 1 FROM %s
           WHERE %I = $1 AND id::text <> $2
         )',
        target_table, key_column
      ) INTO collision USING candidate, target_row.id;
      EXIT WHEN NOT collision;
      suffix := suffix + 1;
      candidate := base_candidate || ':' || suffix::text;
    END LOOP;
    EXECUTE FORMAT('UPDATE %s SET %I = $1 WHERE id::text = $2', target_table, key_column)
      USING candidate, target_row.id;
  END LOOP;
END;
$$;

SELECT pg_temp.backfill_unique_text_key('"GiftCardTransaction"'::REGCLASS, 'idempotencyKey', 'legacy:gift-card-transaction:');
SELECT pg_temp.backfill_unique_text_key('"Payment"'::REGCLASS, 'idempotencyKey', 'legacy:payment:');
SELECT pg_temp.backfill_unique_text_key('"PaymentSession"'::REGCLASS, 'idempotencyKey', 'legacy:payment-session:');
SELECT pg_temp.backfill_unique_text_key('"StockMovement"'::REGCLASS, 'eventKey', 'legacy:stock-movement:');
SELECT pg_temp.backfill_unique_text_key('"WasteLog"'::REGCLASS, 'eventKey', 'legacy:waste-log:');
SELECT pg_temp.backfill_unique_text_key('"OrderAdjustment"'::REGCLASS, 'idempotencyKey', 'legacy:order-adjustment:');
SELECT pg_temp.backfill_unique_text_key('"Receipt"'::REGCLASS, 'receiptNumber', 'legacy:receipt:');
SELECT pg_temp.backfill_unique_text_key('"Refund"'::REGCLASS, 'idempotencyKey', 'legacy:refund:');
SELECT pg_temp.backfill_unique_text_key('"PaymentWebhookEvent"'::REGCLASS, 'eventKey', 'legacy:payment-webhook-event:');
SELECT pg_temp.backfill_unique_text_key('"KitchenTicketEvent"'::REGCLASS, 'eventKey', 'legacy:kitchen-ticket-event:');

-- Deterministic required-field backfills for partially-created drifted tables.
UPDATE "AuditEvent" SET
  "eventType" = COALESCE(NULLIF("eventType", ''), 'legacy'),
  "entityType" = COALESCE(NULLIF("entityType", ''), 'Unknown'),
  "entityId" = COALESCE("entityId", ''),
  "reason" = COALESCE("reason", ''),
  "occurredAt" = COALESCE("occurredAt", "createdAt", CURRENT_TIMESTAMP),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "OrderAdjustment" SET
  "type" = COALESCE(NULLIF("type", ''), 'adjustment'),
  "amount" = COALESCE("amount", 0),
  "reason" = COALESCE("reason", ''),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "Receipt" SET
  "kind" = COALESCE(NULLIF("kind", ''), 'sale'),
  "amount" = COALESCE("amount", 0),
  "currencyCode" = COALESCE(NULLIF("currencyCode", ''), 'USD'),
  "issuedAt" = COALESCE("issuedAt", "createdAt", CURRENT_TIMESTAMP),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "Refund" SET
  "amount" = COALESCE("amount", 0),
  "currencyCode" = COALESCE(NULLIF("currencyCode", ''), 'USD'),
  "status" = COALESCE(NULLIF("status", ''), 'processing'),
  "reason" = COALESCE("reason", ''),
  "providerRefundId" = COALESCE("providerRefundId", ''),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "PaymentWebhookEvent" SET
  "providerCode" = COALESCE("providerCode", ''),
  "providerEventId" = COALESCE("providerEventId", ''),
  "eventType" = COALESCE(NULLIF("eventType", ''), 'legacy'),
  "status" = COALESCE(NULLIF("status", ''), 'received'),
  "rawBody" = COALESCE("rawBody", ''),
  "error" = COALESCE("error", ''),
  "attempts" = COALESCE("attempts", 0),
  "receivedAt" = COALESCE("receivedAt", "createdAt", CURRENT_TIMESTAMP),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "KitchenTicketEvent" SET
  "eventType" = COALESCE(NULLIF("eventType", ''), 'legacy'),
  "occurredAt" = COALESCE("occurredAt", "createdAt", CURRENT_TIMESTAMP),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);

UPDATE "Payment" SET "refundedAmount" = COALESCE("refundedAmount", 0);
UPDATE "StockMovement" SET
  "referenceId" = COALESCE("referenceId", ''),
  "referenceType" = COALESCE("referenceType", '');
UPDATE "WasteLog" SET "reversalReason" = COALESCE("reversalReason", '');
UPDATE "StoreSettings" SET
  "logoColor" = COALESCE("logoColor", '0'),
  "logoIcon" = COALESCE("logoIcon", '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 200 200"><g clip-path="url(#restaurant-logo-clip)"><path fill-rule="evenodd" clip-rule="evenodd" d="M107.143 0H92.8571V63.2531L69.1621 4.60582L55.9166 9.95735L80.2255 70.1239L34.3401 24.2385L24.2386 34.3401L68.2177 78.3191L11.2241 53.4181L5.50459 66.5089L65.8105 92.8571H0V107.143H65.8104L5.50461 133.491L11.2241 146.582L68.2176 121.681L24.2386 165.66L34.3401 175.761L80.2255 129.876L55.9166 190.043L69.1621 195.394L92.8571 136.747V200H107.143V136.747L130.838 195.394L144.083 190.043L119.775 129.876L165.66 175.761L175.761 165.66L131.782 121.681L188.776 146.582L194.495 133.491L134.19 107.143H200V92.8571H134.189L194.495 66.5089L188.776 53.4181L131.782 78.3191L175.761 34.34L165.66 24.2385L119.775 70.1238L144.083 9.95735L130.838 4.60582L107.143 63.2531V0Z" fill="url(#restaurant-logo-gradient)"/></g><defs><linearGradient id="restaurant-logo-gradient" x1="14" y1="26" x2="179" y2="179.5" gradientUnits="userSpaceOnUse"><stop stop-color="#5c6bc0"/><stop offset="1" stop-color="#4f39f6"/></linearGradient><clipPath id="restaurant-logo-clip"><rect width="200" height="200" fill="white"/></clipPath></defs></svg>');

-- Enforce source-schema defaults and requiredness after all backfills.
ALTER TABLE "GiftCardTransaction"
  ALTER COLUMN "idempotencyKey" SET DEFAULT '',
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "balanceAfter" DROP DEFAULT,
  ALTER COLUMN "balanceAfter" SET NOT NULL;
ALTER TABLE "OrderItem"
  ALTER COLUMN "adjustmentTotal" SET DEFAULT 0,
  ALTER COLUMN "isVoided" SET DEFAULT false,
  ALTER COLUMN "isVoided" SET NOT NULL,
  ALTER COLUMN "itemNameSnapshot" SET DEFAULT '',
  ALTER COLUMN "itemNameSnapshot" SET NOT NULL,
  ALTER COLUMN "itemThumbnailSnapshot" SET DEFAULT '',
  ALTER COLUMN "itemThumbnailSnapshot" SET NOT NULL,
  ALTER COLUMN "kitchenStationSnapshot" SET DEFAULT '',
  ALTER COLUMN "kitchenStationSnapshot" SET NOT NULL,
  ALTER COLUMN "menuItemIdSnapshot" SET DEFAULT '',
  ALTER COLUMN "menuItemIdSnapshot" SET NOT NULL,
  ALTER COLUMN "originalOrderIdSnapshot" SET DEFAULT '',
  ALTER COLUMN "originalOrderIdSnapshot" SET NOT NULL,
  ALTER COLUMN "voidReason" SET DEFAULT '',
  ALTER COLUMN "voidReason" SET NOT NULL;
ALTER TABLE "Payment"
  ALTER COLUMN "idempotencyKey" SET DEFAULT '',
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "refundedAmount" SET DEFAULT 0;
ALTER TABLE "StockMovement"
  ALTER COLUMN "eventKey" SET DEFAULT '',
  ALTER COLUMN "eventKey" SET NOT NULL,
  ALTER COLUMN "referenceId" SET DEFAULT '',
  ALTER COLUMN "referenceId" SET NOT NULL,
  ALTER COLUMN "referenceType" SET DEFAULT '',
  ALTER COLUMN "referenceType" SET NOT NULL;
ALTER TABLE "StoreSettings"
  ALTER COLUMN "logoColor" SET DEFAULT '0',
  ALTER COLUMN "logoColor" SET NOT NULL,
  ALTER COLUMN "logoIcon" SET DEFAULT '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 200 200"><g clip-path="url(#restaurant-logo-clip)"><path fill-rule="evenodd" clip-rule="evenodd" d="M107.143 0H92.8571V63.2531L69.1621 4.60582L55.9166 9.95735L80.2255 70.1239L34.3401 24.2385L24.2386 34.3401L68.2177 78.3191L11.2241 53.4181L5.50459 66.5089L65.8105 92.8571H0V107.143H65.8104L5.50461 133.491L11.2241 146.582L68.2176 121.681L24.2386 165.66L34.3401 175.761L80.2255 129.876L55.9166 190.043L69.1621 195.394L92.8571 136.747V200H107.143V136.747L130.838 195.394L144.083 190.043L119.775 129.876L165.66 175.761L175.761 165.66L131.782 121.681L188.776 146.582L194.495 133.491L134.19 107.143H200V92.8571H134.189L194.495 66.5089L188.776 53.4181L131.782 78.3191L175.761 34.34L165.66 24.2385L119.775 70.1238L144.083 9.95735L130.838 4.60582L107.143 63.2531V0Z" fill="url(#restaurant-logo-gradient)"/></g><defs><linearGradient id="restaurant-logo-gradient" x1="14" y1="26" x2="179" y2="179.5" gradientUnits="userSpaceOnUse"><stop stop-color="#5c6bc0"/><stop offset="1" stop-color="#4f39f6"/></linearGradient><clipPath id="restaurant-logo-clip"><rect width="200" height="200" fill="white"/></clipPath></defs></svg>',
  ALTER COLUMN "logoIcon" SET NOT NULL;
ALTER TABLE "WasteLog"
  ALTER COLUMN "eventKey" SET DEFAULT '',
  ALTER COLUMN "eventKey" SET NOT NULL,
  ALTER COLUMN "reversalReason" SET DEFAULT '',
  ALTER COLUMN "reversalReason" SET NOT NULL;

ALTER TABLE "AuditEvent"
  ALTER COLUMN "eventType" SET DEFAULT '', ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "entityType" SET DEFAULT '', ALTER COLUMN "entityType" SET NOT NULL,
  ALTER COLUMN "entityId" SET DEFAULT '', ALTER COLUMN "entityId" SET NOT NULL,
  ALTER COLUMN "reason" SET DEFAULT '', ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "OrderAdjustment"
  ALTER COLUMN "idempotencyKey" SET DEFAULT '', ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "type" DROP DEFAULT, ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "amount" DROP DEFAULT, ALTER COLUMN "amount" SET NOT NULL,
  ALTER COLUMN "reason" SET DEFAULT '', ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Receipt"
  ALTER COLUMN "receiptNumber" SET DEFAULT '', ALTER COLUMN "receiptNumber" SET NOT NULL,
  ALTER COLUMN "kind" SET DEFAULT 'sale', ALTER COLUMN "kind" SET NOT NULL,
  ALTER COLUMN "amount" DROP DEFAULT, ALTER COLUMN "amount" SET NOT NULL,
  ALTER COLUMN "currencyCode" SET DEFAULT '', ALTER COLUMN "currencyCode" SET NOT NULL,
  ALTER COLUMN "issuedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Refund"
  ALTER COLUMN "idempotencyKey" SET DEFAULT '', ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "amount" DROP DEFAULT, ALTER COLUMN "amount" SET NOT NULL,
  ALTER COLUMN "currencyCode" SET DEFAULT '', ALTER COLUMN "currencyCode" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'processing', ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "reason" SET DEFAULT '', ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "providerRefundId" SET DEFAULT '', ALTER COLUMN "providerRefundId" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "PaymentWebhookEvent"
  ALTER COLUMN "eventKey" SET DEFAULT '', ALTER COLUMN "eventKey" SET NOT NULL,
  ALTER COLUMN "providerCode" SET DEFAULT '', ALTER COLUMN "providerCode" SET NOT NULL,
  ALTER COLUMN "providerEventId" SET DEFAULT '', ALTER COLUMN "providerEventId" SET NOT NULL,
  ALTER COLUMN "eventType" SET DEFAULT '', ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'received',
  ALTER COLUMN "rawBody" SET DEFAULT '', ALTER COLUMN "rawBody" SET NOT NULL,
  ALTER COLUMN "error" SET DEFAULT '', ALTER COLUMN "error" SET NOT NULL,
  ALTER COLUMN "attempts" SET DEFAULT 0,
  ALTER COLUMN "receivedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "KitchenTicketEvent"
  ALTER COLUMN "eventType" DROP DEFAULT, ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "eventKey" SET DEFAULT '', ALTER COLUMN "eventKey" SET NOT NULL,
  ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET NOT NULL;

-- Ensure every additive table has a primary key even if a partial drift table
-- was created without one. Existing primary keys, regardless of name, remain.
CREATE OR REPLACE FUNCTION pg_temp.ensure_id_primary_key(
  target_table REGCLASS,
  constraint_name TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target_table AND contype = 'p'
  ) THEN
    EXECUTE FORMAT(
      'ALTER TABLE %s ADD CONSTRAINT %I PRIMARY KEY ("id")',
      target_table, constraint_name
    );
  END IF;
END;
$$;
SELECT pg_temp.ensure_id_primary_key('"AuditEvent"'::REGCLASS, 'AuditEvent_pkey');
SELECT pg_temp.ensure_id_primary_key('"OrderAdjustment"'::REGCLASS, 'OrderAdjustment_pkey');
SELECT pg_temp.ensure_id_primary_key('"Receipt"'::REGCLASS, 'Receipt_pkey');
SELECT pg_temp.ensure_id_primary_key('"Refund"'::REGCLASS, 'Refund_pkey');
SELECT pg_temp.ensure_id_primary_key('"PaymentWebhookEvent"'::REGCLASS, 'PaymentWebhookEvent_pkey');
SELECT pg_temp.ensure_id_primary_key('"KitchenTicketEvent"'::REGCLASS, 'KitchenTicketEvent_pkey');

-- Rebuild unique indexes after key repair. This both deduplicates the five
-- warned existing-table keys and verifies that drifted named indexes cannot
-- silently leave weaker/non-unique definitions behind.
DROP INDEX IF EXISTS "OrderAdjustment_idempotencyKey_key";
DROP INDEX IF EXISTS "Receipt_receiptNumber_key";
DROP INDEX IF EXISTS "Refund_idempotencyKey_key";
DROP INDEX IF EXISTS "PaymentWebhookEvent_eventKey_key";
DROP INDEX IF EXISTS "KitchenTicketEvent_eventKey_key";
DROP INDEX IF EXISTS "GiftCardTransaction_idempotencyKey_key";
DROP INDEX IF EXISTS "Payment_idempotencyKey_key";
DROP INDEX IF EXISTS "PaymentSession_idempotencyKey_key";
DROP INDEX IF EXISTS "StockMovement_eventKey_key";
DROP INDEX IF EXISTS "WasteLog_eventKey_key";

CREATE UNIQUE INDEX "OrderAdjustment_idempotencyKey_key" ON "OrderAdjustment"("idempotencyKey");
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventKey_key" ON "PaymentWebhookEvent"("eventKey");
CREATE UNIQUE INDEX "KitchenTicketEvent_eventKey_key" ON "KitchenTicketEvent"("eventKey");
CREATE UNIQUE INDEX "GiftCardTransaction_idempotencyKey_key" ON "GiftCardTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentSession_idempotencyKey_key" ON "PaymentSession"("idempotencyKey");
CREATE UNIQUE INDEX "StockMovement_eventKey_key" ON "StockMovement"("eventKey");
CREATE UNIQUE INDEX "WasteLog_eventKey_key" ON "WasteLog"("eventKey");

-- Non-unique access-path indexes are safe to retain when already present.
CREATE INDEX IF NOT EXISTS "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");
CREATE INDEX IF NOT EXISTS "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");
CREATE INDEX IF NOT EXISTS "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actor_idx" ON "AuditEvent"("actor");
CREATE INDEX IF NOT EXISTS "AuditEvent_approver_idx" ON "AuditEvent"("approver");
CREATE INDEX IF NOT EXISTS "OrderAdjustment_order_idx" ON "OrderAdjustment"("order");
CREATE INDEX IF NOT EXISTS "OrderAdjustment_orderItem_idx" ON "OrderAdjustment"("orderItem");
CREATE INDEX IF NOT EXISTS "OrderAdjustment_actor_idx" ON "OrderAdjustment"("actor");
CREATE INDEX IF NOT EXISTS "OrderAdjustment_approvedBy_idx" ON "OrderAdjustment"("approvedBy");
CREATE INDEX IF NOT EXISTS "Receipt_issuedAt_idx" ON "Receipt"("issuedAt");
CREATE INDEX IF NOT EXISTS "Receipt_order_idx" ON "Receipt"("order");
CREATE INDEX IF NOT EXISTS "Receipt_payment_idx" ON "Receipt"("payment");
CREATE INDEX IF NOT EXISTS "Receipt_refund_idx" ON "Receipt"("refund");
CREATE INDEX IF NOT EXISTS "Receipt_correctsReceipt_idx" ON "Receipt"("correctsReceipt");
CREATE INDEX IF NOT EXISTS "Receipt_issuedBy_idx" ON "Receipt"("issuedBy");
CREATE INDEX IF NOT EXISTS "Refund_payment_idx" ON "Refund"("payment");
CREATE INDEX IF NOT EXISTS "Refund_order_idx" ON "Refund"("order");
CREATE INDEX IF NOT EXISTS "Refund_requestedBy_idx" ON "Refund"("requestedBy");
CREATE INDEX IF NOT EXISTS "Refund_approvedBy_idx" ON "Refund"("approvedBy");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_providerCode_idx" ON "PaymentWebhookEvent"("providerCode");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_providerEventId_idx" ON "PaymentWebhookEvent"("providerEventId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_eventType_idx" ON "PaymentWebhookEvent"("eventType");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_receivedAt_idx" ON "PaymentWebhookEvent"("receivedAt");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_payment_idx" ON "PaymentWebhookEvent"("payment");
CREATE INDEX IF NOT EXISTS "KitchenTicketEvent_occurredAt_idx" ON "KitchenTicketEvent"("occurredAt");
CREATE INDEX IF NOT EXISTS "KitchenTicketEvent_ticket_idx" ON "KitchenTicketEvent"("ticket");
CREATE INDEX IF NOT EXISTS "KitchenTicketEvent_order_idx" ON "KitchenTicketEvent"("order");
CREATE INDEX IF NOT EXISTS "KitchenTicketEvent_orderItem_idx" ON "KitchenTicketEvent"("orderItem");
CREATE INDEX IF NOT EXISTS "KitchenTicketEvent_actor_idx" ON "KitchenTicketEvent"("actor");
CREATE INDEX IF NOT EXISTS "OrderItem_voidedBy_idx" ON "OrderItem"("voidedBy");
CREATE INDEX IF NOT EXISTS "OrderItem_approvedBy_idx" ON "OrderItem"("approvedBy");
CREATE INDEX IF NOT EXISTS "StockMovement_referenceId_idx" ON "StockMovement"("referenceId");
CREATE INDEX IF NOT EXISTS "WasteLog_reversedBy_idx" ON "WasteLog"("reversedBy");

-- Recreate this migration's foreign keys exactly. Dropping/re-adding a named
-- drift copy is transactional, preserves rows, and validates all existing
-- references instead of silently accepting a weaker definition.
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_voidedBy_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_approvedBy_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WasteLog" DROP CONSTRAINT IF EXISTS "WasteLog_reversedBy_fkey";
ALTER TABLE "WasteLog" ADD CONSTRAINT "WasteLog_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_actor_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_approver_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approver_fkey" FOREIGN KEY ("approver") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderAdjustment" DROP CONSTRAINT IF EXISTS "OrderAdjustment_order_fkey";
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_order_fkey" FOREIGN KEY ("order") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderAdjustment" DROP CONSTRAINT IF EXISTS "OrderAdjustment_orderItem_fkey";
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_orderItem_fkey" FOREIGN KEY ("orderItem") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderAdjustment" DROP CONSTRAINT IF EXISTS "OrderAdjustment_actor_fkey";
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderAdjustment" DROP CONSTRAINT IF EXISTS "OrderAdjustment_approvedBy_fkey";
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_order_fkey";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_order_fkey" FOREIGN KEY ("order") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_payment_fkey";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_refund_fkey";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_refund_fkey" FOREIGN KEY ("refund") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_correctsReceipt_fkey";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_correctsReceipt_fkey" FOREIGN KEY ("correctsReceipt") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_issuedBy_fkey";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_payment_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_order_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_order_fkey" FOREIGN KEY ("order") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_requestedBy_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_approvedBy_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" DROP CONSTRAINT IF EXISTS "PaymentWebhookEvent_payment_fkey";
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketEvent" DROP CONSTRAINT IF EXISTS "KitchenTicketEvent_ticket_fkey";
ALTER TABLE "KitchenTicketEvent" ADD CONSTRAINT "KitchenTicketEvent_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "KitchenTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketEvent" DROP CONSTRAINT IF EXISTS "KitchenTicketEvent_order_fkey";
ALTER TABLE "KitchenTicketEvent" ADD CONSTRAINT "KitchenTicketEvent_order_fkey" FOREIGN KEY ("order") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketEvent" DROP CONSTRAINT IF EXISTS "KitchenTicketEvent_orderItem_fkey";
ALTER TABLE "KitchenTicketEvent" ADD CONSTRAINT "KitchenTicketEvent_orderItem_fkey" FOREIGN KEY ("orderItem") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketEvent" DROP CONSTRAINT IF EXISTS "KitchenTicketEvent_actor_fkey";
ALTER TABLE "KitchenTicketEvent" ADD CONSTRAINT "KitchenTicketEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
