import type { Context } from '.keystone/types';
import { permissions } from '../access';
import { reconcileCompletedOrderOperations } from '../utils/orderCompletion';
import { reviewLegacyOrderRecipes } from '../utils/inventoryRecipeSnapshot';
function inventoryManager(context: Context) {
  if (!permissions.canManageInventory({ session: context.session })) throw new Error('Not authorized to recover operations');
}
export async function restaurantOperationsRecovery(_: unknown, _args: unknown, context: Context) {
  inventoryManager(context);
  const seen = new Set<string>(), pending: any[] = [];
  let cursor: string | undefined;
  // Page through history rather than letting recent successful work hide older
  // unresolved failures. occurredAt + id makes equal timestamps deterministic.
  for (;;) {
    const events = await (context.prisma as any).auditEvent.findMany({ where: { eventType: { in: ['operations.recovery_required', 'operations.reconciled'] } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const event of events) {
      const key = `${event.entityId}:${event.after?.operation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (event.eventType === 'operations.recovery_required') pending.push({ orderId: event.entityId, operation: event.after?.operation, error: event.after?.error, at: event.occurredAt });
    }
    if (events.length < 1000) break;
    cursor = events[events.length - 1].id;
  }
  return pending;
}
export async function retryRestaurantOperations(_: unknown, { orderId }: { orderId: string }, context: Context) {
  inventoryManager(context);
  await reconcileCompletedOrderOperations(orderId, context);
  return restaurantOperationsRecovery(null, null, context);
}
export async function reviewLegacyRestaurantRecipes(_: unknown, { orderId, reason }: { orderId: string; reason: string }, context: Context) {
  inventoryManager(context);
  const result = await reviewLegacyOrderRecipes(orderId, reason, context);
  await reconcileCompletedOrderOperations(orderId, context);
  return result;
}
