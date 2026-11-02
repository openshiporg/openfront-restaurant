import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import { checkbox, relationship, text } from '@keystone-6/core/fields'

import { permissions } from '../access'
import { trackingFields } from './trackingFields'

export const Role = list({
  access: {
    operation: {
      ...allOperations(permissions.canManageRoles),
      // Roles are staff data: never public. Any session (user or scoped API
      // key) may query; the filter limits it to the caller's own role unless
      // it holds canReadRoles/canManageRoles (E-commerce pattern).
      query: ({ session }) => Boolean(session),
    },
    filter: {
      query: ({ session }) =>
        permissions.canReadRoles({ session }) || permissions.canManageRoles({ session })
          ? true
          : { assignedTo: { some: { id: { equals: session?.itemId } } } },
    },
  },
  ui: {
    hideCreate: args => !permissions.canManageRoles(args),
    hideDelete: args => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ['name', 'assignedTo'],
    },
    itemView: {
      defaultFieldMode: args => (permissions.canManageRoles(args) ? 'edit' : 'read'),
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),

    // Dashboard
    canAccessDashboard: checkbox({ defaultValue: false }),

    // Orders
    canReadOrders: checkbox({ defaultValue: false }),
    canManageOrders: checkbox({ defaultValue: false }),

    // Payments
    canReadPayments: checkbox({ defaultValue: false }),
    canManagePayments: checkbox({ defaultValue: false }),

    // Products / Menu
    canReadProducts: checkbox({ defaultValue: false }),
    canManageProducts: checkbox({ defaultValue: false }),

    // Cart
    canReadCart: checkbox({ defaultValue: false }),
    canManageCart: checkbox({ defaultValue: false }),

    // Inventory
    canReadInventory: checkbox({ defaultValue: false }),
    canManageInventory: checkbox({ defaultValue: false }),

    // Users
    canReadUsers: checkbox({ defaultValue: false }),
    canManageUsers: checkbox({ defaultValue: false }),
    canSeeOtherPeople: checkbox({ defaultValue: false }),
    canEditOtherPeople: checkbox({ defaultValue: false }),
    canManagePeople: checkbox({ defaultValue: false }),

    // Roles
    canReadRoles: checkbox({ defaultValue: false }),
    canManageRoles: checkbox({ defaultValue: false }),

    // Kitchen
    canReadKitchen: checkbox({ defaultValue: false }),
    canManageKitchen: checkbox({ defaultValue: false }),

    // Tables / Seating / Reservations
    canReadTables: checkbox({ defaultValue: false }),
    canManageTables: checkbox({ defaultValue: false }),

    // Staff / Scheduling
    canReadStaff: checkbox({ defaultValue: false }),
    canManageStaff: checkbox({ defaultValue: false }),

    // Settings
    canManageSettings: checkbox({ defaultValue: false }),

    // Onboarding
    canManageOnboarding: checkbox({ defaultValue: true }),

    // Vendors
    canReadVendors: checkbox({ defaultValue: false }),
    canManageVendors: checkbox({ defaultValue: false }),

    // Gift Cards
    canReadGiftCards: checkbox({ defaultValue: false }),
    canManageGiftCards: checkbox({ defaultValue: false }),

    // Discounts
    canReadDiscounts: checkbox({ defaultValue: false }),
    canManageDiscounts: checkbox({ defaultValue: false }),

    assignedTo: relationship({
      ref: 'User.role',
      many: true,
      ui: {
        itemView: { fieldMode: 'read' },
      },
    }),
    ...trackingFields,
  },
});
