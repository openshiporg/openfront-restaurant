-- Additive: order ahead. A cart may choose a pickup/delivery time; an order remembers it and the
-- time the kitchen should start it. NULL keeps today's "as soon as possible" behaviour.
ALTER TABLE "Cart" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "RestaurantOrder" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "RestaurantOrder" ADD COLUMN "fireAt" TIMESTAMP(3);
