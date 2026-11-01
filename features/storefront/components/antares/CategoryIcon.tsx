import {
  CakeSlice,
  CupSoda,
  Drumstick,
  Hamburger,
  IceCreamCone,
  LayoutGrid,
  Salad,
  Sandwich,
  Sparkles,
  Star,
  Utensils,
  type LucideProps,
} from "lucide-react"

function Fries(props: LucideProps) {
  const { size = 24, strokeWidth = 2, className, ...rest } = props
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 10 6.5 3.5M11 10V2.5M14 10l1-6.5M17 10.5l1.5-5" />
      <path d="M5 10h14l-1.6 10.2a1 1 0 0 1-1 .8H7.6a1 1 0 0 1-1-.8Z" />
      <path d="M8.5 14a3.5 3.5 0 0 0 7 0" />
    </svg>
  )
}

const ICONS: Record<string, (props: LucideProps) => React.ReactNode> = {
  popular: Star,
  all: LayoutGrid,
  sparkles: Sparkles,
  featured: Sparkles,
  burger: Hamburger,
  burgers: Hamburger,
  hamburger: Hamburger,
  drumstick: Drumstick,
  chicken: Drumstick,
  sandwich: Sandwich,
  fries: Fries,
  sides: Fries,
  cup: CupSoda,
  drinks: CupSoda,
  "ice-cream": IceCreamCone,
  desserts: IceCreamCone,
  dessert: IceCreamCone,
  cake: CakeSlice,
  salad: Salad,
}

/** The category's own icon setting, or one picked from its name, or a plain utensil. */
export function CategoryIcon({ icon, name, className }: { icon?: string | null; name?: string; className?: string }) {
  const key = (icon || "").trim().toLowerCase()
  const byName = (name || "").trim().toLowerCase()
  const Icon = ICONS[key] || ICONS[byName] || Utensils
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />
}
