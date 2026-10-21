import type { Context } from '.keystone/types';
import { isSignedIn, permissions } from '../access';
import { appendAuditEventWithClient } from '../utils/audit';
function human(context: Context) { if (!isSignedIn(context)) throw new Error('Sign in to manage your customer data'); return context.session!.itemId; }
export async function exportMyRestaurantData(_root: unknown, _args: unknown, context: Context) {
  const id = human(context); const tx = context.prisma as any;
  const user = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, createdAt: true } });
  const orders = await tx.restaurantOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, orderNumber: true, createdAt: true, orderType: true, status: true, subtotal: true, tax: true, tip: true, discount: true, total: true, currencyCode: true, orderItems: { select: { itemNameSnapshot: true, quantity: true, price: true, modifiersSnapshot: true, isVoided: true, adjustmentTotal: true } } } });
  const preferences = await tx.auditEvent.findMany({ where: { entityType: 'CustomerPrivacy', entityId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { eventType: true, occurredAt: true, after: true, reason: true } });
  return { user, orders, preferences, limit: 1000, exportedAt: new Date().toISOString(), note: 'Latest 1000 orders. Contact the restaurant for an older archive; financial retention depends on the venue policy.' };
}
export async function recordMyRestaurantPrivacy(_root: unknown, args: { action: string; reason?: string; idempotencyKey: string }, context: Context) {
  const id = human(context);
  if (!['marketing_opt_in', 'marketing_opt_out', 'request_access', 'request_correction', 'request_erasure'].includes(args.action) || !/^[\w-]{8,100}$/.test(args.idempotencyKey) || (args.reason?.length || 0) > 1000) throw new Error('Invalid privacy request');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const key = `privacy:${id}:${args.idempotencyKey}`; const existing = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (existing) { if (existing.eventType !== `privacy.${args.action}` || existing.reason !== (args.reason || '')) throw new Error('Request key reused'); return { id: existing.id, action: args.action, status: existing.after.status }; }
    const event = await appendAuditEventWithClient(tx, id, { eventKey: key, entityType: 'CustomerPrivacy', entityId: id, eventType: `privacy.${args.action}`, reason: args.reason || '', after: { status: args.action.startsWith('request_') ? 'requested' : 'recorded', channel: 'authenticated_account', purpose: 'restaurant_marketing', policyVersion: 'explicit-opt-in-v1' } });
    return { id: event.id, action: args.action, status: event.after.status };
  }, { isolationLevel: 'Serializable' });
}
export async function restaurantPrivacyRequests(_root: unknown, _args: unknown, context: Context) {
  if (!permissions.canManageUsers(context)) throw new Error('User management required');
  const tx = context.prisma as any;
  const rows = await tx.auditEvent.findMany({ where: { entityType: 'CustomerPrivacy', eventType: { startsWith: 'privacy.request_' } }, orderBy: { occurredAt: 'desc' }, take: 100 });
  return Promise.all(rows.map(async (row: any) => ({ ...row, resolution: await tx.auditEvent.findUnique({ where: { eventKey: `privacy-resolution:${row.id}` } }) })));
}
export async function resolveRestaurantPrivacyRequest(_root: unknown, args: { requestId: string; outcome: string; reason: string }, context: Context) {
  if (!permissions.canManageUsers(context)) throw new Error('User management required');
  if (!['fulfilled', 'retained_with_reason', 'needs_information'].includes(args.outcome) || args.reason.trim().length < 3) throw new Error('Outcome and evidence/reference required');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const original = await tx.auditEvent.findUnique({ where: { id: args.requestId } });
    if (original?.entityType !== 'CustomerPrivacy' || !original.eventType.startsWith('privacy.request_')) throw new Error('Privacy request not found');
    const existing = await tx.auditEvent.findUnique({ where: { eventKey: `privacy-resolution:${args.requestId}` } });
    if (existing && (existing.after.outcome !== args.outcome || existing.reason !== args.reason)) throw new Error('Resolution is immutable; record a new customer request for further review');
    return appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: `privacy-resolution:${args.requestId}`, entityType: 'CustomerPrivacy', entityId: original.entityId, eventType: 'privacy.resolved', reason: args.reason, after: { requestId: original.id, outcome: args.outcome } });
  }, { isolationLevel: 'Serializable' });
}
