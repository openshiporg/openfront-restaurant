import { LOGO_ICONS } from '../platform/store-settings/lib/icon-registry';
export const DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === 'refractional')!.lightSvg;

export const DEFAULT_STORE_LOGO_COLOR = '240';

export function normalizeStoreLogoColor(value: unknown): string {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String(((numeric % 360) + 360) % 360);
}
