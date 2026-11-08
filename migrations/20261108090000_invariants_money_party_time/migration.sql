-- Invariants the app relies on, backed by the database (2026-11-08).
-- CHECKs are NOT VALID: every new or changed row is checked, while a row written
-- mid-deploy cannot fail the deploy. The live data was checked first and had no violations.
-- Ingredient.currentStock deliberately has no floor: completing an order records
-- theoretical depletion for food already sold, and a later stock count corrects drift.

-- 1. Money
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_bounds"
  CHECK ("value" > 0 AND "balance" >= 0 AND "balance" <= "value") NOT VALID;
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_balance_not_negative"
  CHECK ("balanceAfter" >= 0) NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_bounds"
  CHECK ("amount" >= 0 AND COALESCE("refundedAmount", 0) >= 0 AND COALESCE("refundedAmount", 0) <= "amount") NOT VALID;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive"
  CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_not_negative"
  CHECK ("price" >= 0) NOT VALID;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_value_bounds"
  CHECK ("value" >= 0 AND ("type"::text <> 'percentage' OR "value" <= 100)) NOT VALID;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_dates_ordered"
  CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt") NOT VALID;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_usage_bounds"
  CHECK ("usageCount" >= 0 AND ("usageLimit" IS NULL OR ("usageLimit" >= 1 AND "usageCount" <= "usageLimit"))) NOT VALID;

-- 2. Quantities and party sizes
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive"
  CHECK ("quantity" >= 1) NOT VALID;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_positive"
  CHECK ("quantity" IS NULL OR "quantity" >= 1) NOT VALID;
ALTER TABLE "Table" ADD CONSTRAINT "Table_capacity_positive"
  CHECK ("capacity" >= 1) NOT VALID;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_party_and_duration"
  CHECK ("partySize" >= 1 AND ("duration" IS NULL OR "duration" BETWEEN 15 AND 1440)) NOT VALID;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_party_positive"
  CHECK ("partySize" >= 1) NOT VALID;

-- 3. Time windows
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_window_ordered"
  CHECK ("endTime" > "startTime") NOT VALID;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_window_ordered"
  CHECK ("clockOut" IS NULL OR "clockOut" > "clockIn") NOT VALID;

-- 4. One table per number on a floor (seating, KDS tickets and reservations show the number only)
CREATE UNIQUE INDEX IF NOT EXISTS "Table_number_per_floor"
  ON "Table" (lower(btrim("tableNumber")), COALESCE("floor", ''));
