import type { CSSProperties } from "react";
import { normalizeStoreLogoColor } from "@/features/lib/store-logo";
import { getStoreSettings } from "@/features/storefront/lib/data/menu";
import { storefrontFont } from "@/features/storefront/lib/fonts";
import "./storefront.css";

type StorefrontBrandStyle = CSSProperties & {
  "--store-page-logo-hue": string;
  "--store-page-brand-hue": string;
};

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeSettings = await getStoreSettings();
  const logoHue = normalizeStoreLogoColor(storeSettings?.logoColor);
  const brandHue = String((260 + Number.parseInt(logoHue, 10)) % 360);
  const brandStyle: StorefrontBrandStyle = {
    "--store-page-logo-hue": logoHue,
    "--store-page-brand-hue": brandHue,
  };

  return <div className={`storefront-brand ${storefrontFont.variable}`} style={brandStyle}>{children}</div>;
}
