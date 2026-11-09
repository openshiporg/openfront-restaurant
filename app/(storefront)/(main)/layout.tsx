import { OrbitShell } from "@/features/storefront/orbit/Shell"
import "@/features/storefront/orbit/orbit.css"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <OrbitShell>{children}</OrbitShell>
}
