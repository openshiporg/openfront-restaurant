import Nav from "@/features/storefront/modules/layout/templates/nav"
import Footer from "@/features/storefront/modules/layout/templates/footer"
import StorefrontServer from "./StorefrontServer"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { normalizeStoreLogoColor } from "@/features/lib/store-logo"

export async function MainLayout({ children }: { children: React.ReactNode }) {
  // Read shared storefront state before rendering interactive navigation. This
  // avoids leaving the cart behind an unresolved streamed Suspense fallback.
  const [storeSettings, cart] = await Promise.all([
    getStoreSettings(),
    retrieveCart(),
  ])
  const logoHue = normalizeStoreLogoColor(storeSettings?.logoColor)
  const brandHue = String((260 + Number.parseInt(logoHue, 10)) % 360)

  return (
    <div
      className="storefront-ui min-h-dvh bg-background font-sans text-foreground antialiased"
    >
      <StorefrontServer
        prefetchUser={true}
        prefetchCart={true}
        prefetchStoreSettings={true}
        prefetchMenuCategories={true}
      >
        <div className="relative flex min-h-dvh flex-col overflow-x-clip">
          <Nav storeSettings={storeSettings} cart={cart} brandHue={brandHue} />
          {children}
          <Footer storeSettings={storeSettings} />
        </div>
      </StorefrontServer>
    </div>
  )
}

export function MainNotFound() {
  return (
    <div className="storefront-shell flex min-h-[calc(100dvh-16rem)] flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="storefront-heading max-w-xl">This page is not on the menu.</h1>
      <p className="storefront-copy max-w-md">
        The page you tried to open does not exist or may have been removed.
      </p>
    </div>
  )
}
