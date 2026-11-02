-- Additive: marks a customer who registered an account (storefront sign-up) as opposed to a
-- per-checkout guest user. Existing rows stay false: restaurant data has no reliable signal that
-- separates an old sign-up from an old guest checkout (every customer row was created through the
-- same public createUser with a phone and no addresses; only the 4 staff/role users differ), so
-- nothing is backfilled and old rows are never treated as retirable guests (see the epoch guard
-- in features/keystone/security/guest-user.ts).
ALTER TABLE "User" ADD COLUMN "hasAccount" BOOLEAN NOT NULL DEFAULT false;
