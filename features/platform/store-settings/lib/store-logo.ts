import { LOGO_ICONS } from './icon-registry';
export const DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === 'refractional')!.lightSvg;
export const DEFAULT_STORE_LOGO_COLOR = '0';

// This module is intentionally browser-safe. Server-only SVG parsing and
// sanitization lives under features/keystone/utils/storeLogo.ts.
export function normalizeStoreLogoColor(value: unknown): string {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String(((numeric % 360) + 360) % 360);
}
