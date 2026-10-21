export type StorefrontRating = { rating: number; reviewCount: number };

/** Do not present a rating as social proof unless a positive review count is recorded. */
export function getStorefrontRating(rating: unknown, reviewCount: unknown): StorefrontRating | undefined {
  const average = Number(rating);
  const count = Number(reviewCount);
  if (!Number.isFinite(average) || average <= 0 || !Number.isSafeInteger(count) || count <= 0) return undefined;
  return { rating: average, reviewCount: count };
}
