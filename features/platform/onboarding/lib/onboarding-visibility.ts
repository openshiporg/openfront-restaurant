/**
 * Whether the sidebar should still offer the "get started" onboarding card.
 * It is for an empty restaurant: once onboarding is finished or dismissed,
 * or the menu already has items (seeded or added by hand), it stays hidden.
 */
export function shouldShowOnboardingCard(input: {
  canManageOnboarding?: boolean | null
  onboardingStatus?: string | null
  menuItemsCount?: number | null
}): boolean {
  if (!input.canManageOnboarding) return false
  if (input.onboardingStatus === "completed" || input.onboardingStatus === "dismissed") return false
  if (typeof input.menuItemsCount === "number" && input.menuItemsCount > 0) return false
  return true
}
