import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowOnboardingCard } from "../features/platform/onboarding/lib/onboarding-visibility";

test("an empty restaurant with onboarding not started shows the card to a manager", () => {
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: true, onboardingStatus: "not_started", menuItemsCount: 0 }), true);
});

test("staff without onboarding permission never see it", () => {
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: false, onboardingStatus: "not_started", menuItemsCount: 0 }), false);
});

test("completed or dismissed onboarding hides it", () => {
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: true, onboardingStatus: "completed", menuItemsCount: 0 }), false);
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: true, onboardingStatus: "dismissed", menuItemsCount: 0 }), false);
});

test("a menu that already has items hides it, even if onboarding never ran", () => {
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: true, onboardingStatus: "not_started", menuItemsCount: 23 }), false);
});

test("an unknown item count falls back to the onboarding status", () => {
  assert.equal(shouldShowOnboardingCard({ canManageOnboarding: true, onboardingStatus: "in_progress", menuItemsCount: null }), true);
});
