import {
  Users,
  Tag,
  Gift,
  BarChart3,
  Ticket,
  LucideIcon,
  ChefHat,
  ClipboardList,
  HandPlatter,
  ConciergeBell,
  FileText,
  Boxes,
  CreditCard,
  MapPin,
  Store,
  RefreshCw,
  Key,
  CalendarDays,
  BookOpen,
  Trash2,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

export const platformNavItems: PlatformNavItem[] = [
  // Standalone
  { title: 'Orders',        href: '/platform/orders',          color: 'blue',   description: 'Manage customer orders, delivery, and dine-in.',                          icon: Ticket,       group: 'standalone' },
  { title: 'KDS',           href: '/platform/kds',             color: 'orange', description: 'Kitchen Display System for order fulfillment.',                           icon: ChefHat,      group: 'standalone' },
  { title: 'POS',           href: '/platform/pos',             color: 'teal',   description: 'Take in-person orders, seat tables, and process payment.',                icon: HandPlatter,  group: 'standalone' },
  { title: 'Service Floor', href: '/platform/service-floor',   color: 'cyan',   description: 'Waiter table-service UI with quick order and payment actions.',           icon: ConciergeBell,group: 'standalone' },
  { title: 'Analytics',     href: '/platform/reports',         color: 'indigo', description: 'View sales reports, customer insights, and performance metrics.',         icon: BarChart3,    group: 'standalone' },
  { title: 'Reservations',  href: '/platform/reservations',    color: 'purple', description: 'Manage table reservations and booking schedule.',                         icon: CalendarDays, group: 'standalone' },
  { title: 'Store Settings',href: '/platform/store-settings',  color: 'slate',  description: 'Configure restaurant settings, hours, and branding.',                     icon: Store,        group: 'standalone' },

  { title: 'Receipts', href: '/platform/receipts', color: 'emerald', description: 'Inspect immutable payment receipts and print or export evidence.', icon: CreditCard, group: 'standalone' },
  { title: 'Cash & Close', href: '/platform/reconciliation', color: 'emerald', description: 'Reconcile cash, refunds and processor statements.', icon: CreditCard, group: 'standalone' },

  // Menu — single entry
  { title: 'Menu Architect', href: '/platform/menu',           color: 'green',  description: 'Unified visual workspace for menu items, categories, and modifiers.',     icon: BookOpen,     group: 'standalone' },

  // Inventory
  { title: 'Ingredients',     href: '/platform/ingredients',              color: 'emerald', description: 'Manage ingredients and inventory tracking.',    icon: Boxes,    group: 'inventory' },
  { title: 'Purchase Orders', href: '/platform/inventory/purchase-orders',color: 'blue',    description: 'Manage inventory replenishment.',               icon: FileText, group: 'inventory' },
  { title: 'Waste Log',       href: '/platform/inventory/waste',          color: 'red',     description: 'Track food waste and loss.',                    icon: Trash2,   group: 'inventory' },

  // Operations
  { title: 'Operations',        href: '/platform/operations',   color: 'orange', description: 'Daily operations dashboard and performance signals.',        icon: ClipboardList, group: 'operations' },
  { title: 'Tables & Sections', href: '/platform/tables',       color: 'cyan',   description: 'Manage dining room layout, tables, and sections.',           icon: MapPin,        group: 'operations' },
  { title: 'Time Clock', href: '/platform/time-clock', color: 'purple', description: 'Clock work and breaks, review corrections and export approved time.', icon: Users, group: 'operations' },
  { title: 'Staff',             href: '/platform/users',        color: 'purple', description: 'Manage staff accounts, roles, and permissions.',             icon: Users,         group: 'operations' },

  // Marketing
  { title: 'Discounts',   href: '/platform/discounts',       color: 'pink', description: 'Manage discount codes and promotional campaigns.',   icon: Tag,  group: 'marketing' },
  { title: 'Gift Cards',  href: '/platform/gift-cards',      color: 'rose', description: 'Manage gift card creation and redemption.',          icon: Gift, group: 'marketing' },

  { title: 'Customer Privacy', href: '/platform/privacy', color: 'slate', description: 'Review data requests and record retention decisions.', icon: Users, group: 'operations' },

  // Integrations
  { title: 'Payment Providers', href: '/platform/payment-providers', color: 'slate',  description: 'Configure payment gateways and provider settings.', icon: CreditCard, group: 'integrations' },
  { title: 'API Keys',          href: '/platform/api-keys',          color: 'violet', description: 'Manage API keys for programmatic access.',           icon: Key,        group: 'integrations' },
]

export const platformStandaloneItems = platformNavItems.filter(
  (item) => item.group === 'standalone'
)

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'inventory',    title: 'Inventory',    icon: Boxes,        items: platformNavItems.filter((i) => i.group === 'inventory')    },
  { id: 'operations',   title: 'Operations',   icon: ClipboardList,items: platformNavItems.filter((i) => i.group === 'operations')   },
  { id: 'marketing',    title: 'Marketing',    icon: BarChart3,    items: platformNavItems.filter((i) => i.group === 'marketing')    },
  { id: 'integrations', title: 'Integrations', icon: RefreshCw,    items: platformNavItems.filter((i) => i.group === 'integrations') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({
    ...item,
    href: `${basePath}${item.href}`,
  }))
}
