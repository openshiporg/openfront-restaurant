import { list } from "@keystone-6/core";
import { json, relationship, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const AuditEvent = list({
  access: {
    filter: { query: ({ session }) => {
      const OR: any[] = [];
      if (permissions.canManageOrders({ session })) OR.push({ AND: [{ entityType: { in: ['RestaurantOrder', 'OrderItem', 'Reservation', 'WaitlistEntry', 'RestaurantNotification', 'RestaurantRewardAccount'] } }, { eventType: { not: { startsWith: 'inventory.' } } }] });
      if (permissions.canManagePayments({ session })) OR.push({ entityType: { in: ['Payment', 'Refund', 'GiftCard', 'Receipt', 'BusinessDay', 'RestaurantRewardAccount', 'ManagerApproval'] } });
      if (permissions.canManageInventory({ session })) OR.push({ entityType: { in: ['Ingredient', 'PurchaseOrder', 'StockMovement', 'WasteLog', 'Recipe'] } }, { eventType: { startsWith: 'inventory.' } }, { eventType: { startsWith: 'operations.' } });
      if (permissions.canManageStaff({ session })) OR.push({ entityType: { in: ['Shift', 'TimeEntry', 'TipPool', 'StaffAttendance', 'TimeCorrection'] } });
      if (permissions.canManageUsers({ session })) OR.push({ entityType: { equals: 'CustomerPrivacy' } });
      return OR.length ? { OR } : false;
    } },
    operation: {
      query: ({ session }) =>
        permissions.canManageOrders({ session }) ||
        permissions.canManagePayments({ session }) ||
        permissions.canManageInventory({ session }) ||
        permissions.canManageStaff({ session }) || permissions.canManageUsers({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    eventType: text({ validation: { isRequired: true }, isIndexed: true }),
    entityType: text({ validation: { isRequired: true }, isIndexed: true }),
    entityId: text({ validation: { isRequired: true }, isIndexed: true }),
    reason: text({ ui: { displayMode: "textarea" } }),
    before: json(),
    after: json(),
    metadata: json({
      // Notification bodies may contain guest possession links. Delivery uses
      // authorized internal projections; generic audit readers never receive them.
      access: { read: ({ item }) => !String(item.eventType || '').startsWith('notification.') && !String(item.eventType || '').startsWith('guest.reservation_') },
    }),
    occurredAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    actor: relationship({ ref: "User" }),
    approver: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
