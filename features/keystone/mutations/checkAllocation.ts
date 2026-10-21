import type { Context } from '.keystone/types';
import { permissions } from '../access';
import { getActiveCheckAllocation } from '../utils/checkAllocations';
export async function restaurantCheckAllocation(_: unknown, { orderId }: { orderId: string }, context: Context) {
  if (!(permissions.canReadOrders(context) || permissions.canManageOrders(context) || permissions.canReadPayments(context) || permissions.canManagePayments(context))) throw new Error('Not authorized');
  return getActiveCheckAllocation(context.prisma, orderId);
}
