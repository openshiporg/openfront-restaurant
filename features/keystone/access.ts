import { scopeAllowsPermission } from "./utils/apiKeyPolicy";
export type Session = {
  apiKeyId?: string
  apiKeyScopes?: string[]
  itemId: string
  listKey: string
  data: {
    isActive?: boolean
    name: string
    role: {
      id: string
      name: string
      canAccessDashboard: boolean
      canReadOrders: boolean
      canManageOrders: boolean
      canReadPayments: boolean
      canManagePayments: boolean
      canReadProducts: boolean
      canManageProducts: boolean
      canReadCart: boolean
      canManageCart: boolean
      canReadInventory: boolean
      canManageInventory: boolean
      canReadUsers: boolean
      canManageUsers: boolean
      canSeeOtherPeople: boolean
      canEditOtherPeople: boolean
      canManagePeople: boolean
      canReadRoles: boolean
      canManageRoles: boolean
      canReadKitchen: boolean
      canManageKitchen: boolean
      canReadTables: boolean
      canManageTables: boolean
      canReadStaff: boolean
      canManageStaff: boolean
      canManageSettings: boolean
      canManageOnboarding: boolean
      canReadVendors: boolean
      canManageVendors: boolean
      canReadGiftCards: boolean
      canManageGiftCards: boolean
      canReadDiscounts: boolean
      canManageDiscounts: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session && session.data?.isActive !== false && !session.apiKeyId && !session.apiKeyScopes)
}

// ─── Permissions (boolean checks) ───────────────────────────────────
// Each reads a checkbox from session.data.role. auto-generated from Role model fields.

export function hasPermission(session: Session | undefined, permission: string) {
  if (!session || session.data?.isActive === false) return false;
  const grantedByRole = (session.data?.role as any)?.[permission] === true;
  if (session.apiKeyId || session.apiKeyScopes) {
    return grantedByRole && scopeAllowsPermission(session.apiKeyScopes, permission);
  }
  return grantedByRole;
}

export const permissions = {
  canAccessDashboard: ({ session }: AccessArgs) => hasPermission(session, "canAccessDashboard"),
  canReadOrders: ({ session }: AccessArgs) => hasPermission(session, "canReadOrders"),
  canManageOrders: ({ session }: AccessArgs) => hasPermission(session, "canManageOrders"),
  canReadPayments: ({ session }: AccessArgs) => hasPermission(session, "canReadPayments"),
  canManagePayments: ({ session }: AccessArgs) => hasPermission(session, "canManagePayments"),
  canReadProducts: ({ session }: AccessArgs) => hasPermission(session, "canReadProducts"),
  canManageProducts: ({ session }: AccessArgs) => hasPermission(session, "canManageProducts"),
  canReadCart: ({ session }: AccessArgs) => hasPermission(session, "canReadCart"),
  canManageCart: ({ session }: AccessArgs) => hasPermission(session, "canManageCart"),
  canReadInventory: ({ session }: AccessArgs) => hasPermission(session, "canReadInventory"),
  canManageInventory: ({ session }: AccessArgs) => hasPermission(session, "canManageInventory"),
  canReadUsers: ({ session }: AccessArgs) => hasPermission(session, "canReadUsers"),
  canManageUsers: ({ session }: AccessArgs) => hasPermission(session, "canManageUsers"),
  canSeeOtherPeople: ({ session }: AccessArgs) => hasPermission(session, "canSeeOtherPeople"),
  canEditOtherPeople: ({ session }: AccessArgs) => hasPermission(session, "canEditOtherPeople"),
  canManagePeople: ({ session }: AccessArgs) => hasPermission(session, "canManagePeople"),
  canReadRoles: ({ session }: AccessArgs) => hasPermission(session, "canReadRoles"),
  canManageRoles: ({ session }: AccessArgs) => hasPermission(session, "canManageRoles"),
  canReadKitchen: ({ session }: AccessArgs) => hasPermission(session, "canReadKitchen"),
  canManageKitchen: ({ session }: AccessArgs) => hasPermission(session, "canManageKitchen"),
  canReadTables: ({ session }: AccessArgs) => hasPermission(session, "canReadTables"),
  canManageTables: ({ session }: AccessArgs) => hasPermission(session, "canManageTables"),
  canReadStaff: ({ session }: AccessArgs) => hasPermission(session, "canReadStaff"),
  canManageStaff: ({ session }: AccessArgs) => hasPermission(session, "canManageStaff"),
  canManageSettings: ({ session }: AccessArgs) => hasPermission(session, "canManageSettings"),
  canManageOnboarding: ({ session }: AccessArgs) => hasPermission(session, "canManageOnboarding"),
  canReadVendors: ({ session }: AccessArgs) => hasPermission(session, "canReadVendors"),
  canManageVendors: ({ session }: AccessArgs) => hasPermission(session, "canManageVendors"),
  canReadGiftCards: ({ session }: AccessArgs) => hasPermission(session, "canReadGiftCards"),
  canManageGiftCards: ({ session }: AccessArgs) => hasPermission(session, "canManageGiftCards"),
  canReadDiscounts: ({ session }: AccessArgs) => hasPermission(session, "canReadDiscounts"),
  canManageDiscounts: ({ session }: AccessArgs) => hasPermission(session, "canManageDiscounts"),
}

// ─── Rules (boolean or filter returns) ──────────────────────────────
// Rules return true/false or a Keystone filter object for scoped queries.

export const rules = {
  canManageOrders({ session }: AccessArgs) {
    if (permissions.canManageOrders({ session })) return true
    return false
  },

  canManagePayments({ session }: AccessArgs) {
    if (permissions.canManagePayments({ session })) return true
    return false
  },

  canReadPeople({ session }: AccessArgs) {
    if (!isSignedIn({ session })) return false
    if (permissions.canSeeOtherPeople({ session })) return true
    return { id: { equals: session?.itemId } }
  },

  canUpdatePeople({ session }: AccessArgs) {
    if (!isSignedIn({ session })) return false
    if (permissions.canEditOtherPeople({ session })) return true
    return { id: { equals: session?.itemId } }
  },
}
