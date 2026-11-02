import { sanitizeStoreLogoSvg } from '@/features/keystone/utils/storeLogo';
import { normalizeStoreLogoColor } from './store-logo';

// Pure half of the E-commerce updateStoreSettings action: sanitize the SVG,
// normalize the hue, and reject the save when the SVG is not a safe document.
export function buildStoreSettingsPayload<T extends { logoIcon?: string; logoColor?: string }>(data: T):
  | { success: true; data: T }
  | { success: false; error: string } {
  const sanitizedData = {
    ...data,
    logoIcon: data.logoIcon ? sanitizeStoreLogoSvg(data.logoIcon) : undefined,
    logoColor:
      data.logoColor === undefined ? undefined : normalizeStoreLogoColor(data.logoColor),
  };

  if (data.logoIcon && !sanitizedData.logoIcon) {
    return { success: false, error: 'Invalid SVG format' };
  }

  return { success: true, data: sanitizedData };
}
