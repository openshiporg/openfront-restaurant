import type { Context } from '.keystone/types';
import { permissions } from '../access';
import { appendAuditEventWithClient } from '../utils/audit';
import { businessDate, businessDayStart, money, tenderTotals } from '../../lib/financial-ledger';
import { createHash } from 'node:crypto';

const entityType = 'BusinessDay';
function authorize(context: Context, write = false) {
  if (!(write ? permissions.canManagePayments(context) : permissions.canReadPayments(context) || permissions.canManagePayments(context))) throw new Error('Not authorized');
}
function fingerprint(value: any) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function eventsFor(tx: any, id: string) { return tx.auditEvent.findMany({ where: { entityType, entityId: id }, orderBy: { occurredAt: 'asc' } }); }
function state(events: any[]) {
  const open = events.find(e => e.eventType === 'business_day.opened');
  const close = events.find(e => e.eventType === 'business_day.closed');
  return { open, close, movements: events.filter(e => e.eventType === 'business_day.cash_movement'), settlements: events.filter(e => e.eventType === 'business_day.settlement') };
}
async function snapshot(tx: any, events: any[], end: Date) {
  const { open, movements } = state(events);
  if (!open) throw new Error('Business day not found');
  const start = new Date(open.after.startAt);
  // A provider result can commit after yesterday's immutable close with an older
  // processedAt. Carry every unassigned posting forward exactly once by identity.
  const history = await tx.auditEvent.findMany({ where: { entityType, eventType: { in: ['business_day.opened', 'business_day.closed'] } } });
  const starts = history.filter((e: any) => e.eventType === 'business_day.opened').map((e: any) => new Date(e.after.startAt).getTime());
  const managedStart = new Date(Math.min(start.getTime(), ...starts));
  const priorCloses = history.filter((e: any) => e.eventType === 'business_day.closed');
  const assignedPayments = new Set(priorCloses.flatMap((e: any) => e.after.paymentIds || []));
  const assignedRefunds = new Set(priorCloses.flatMap((e: any) => e.after.refundIds || []));
  const payments = (await tx.payment.findMany({ where: { processedAt: { gte: managedStart, lt: end }, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } } })).filter((p: any) => !assignedPayments.has(p.id));
  const refunds = (await tx.refund.findMany({ where: { processedAt: { gte: managedStart, lt: end }, status: 'succeeded' }, include: { payment: { select: { paymentMethod: true } } } })).filter((r: any) => !assignedRefunds.has(r.id));
  if ([...payments, ...refunds].some(p => p.currencyCode !== open.after.currencyCode)) throw new Error('Mixed currency requires separate reconciliation');
  const tenders = tenderTotals(payments, refunds);
  const movementTotal = movements.reduce((sum: number, e: any) => sum + (e.after.direction === 'in' ? e.after.amount : -e.after.amount), 0);
  return { managedStartAt: managedStart.toISOString(), carriedPaymentIds: payments.filter((p: any) => new Date(p.processedAt) < start).map((p: any) => p.id), carriedRefundIds: refunds.filter((r: any) => new Date(r.processedAt) < start).map((r: any) => r.id), startAt: start.toISOString(), endAt: end.toISOString(), currencyCode: open.after.currencyCode, timezone: open.after.timezone, cutoffMinutes: open.after.cutoffMinutes, openingFloat: open.after.openingFloat, tenders, movementTotal, expectedCash: open.after.openingFloat + (tenders.cash?.net || 0) + movementTotal, paymentIds: payments.map((p: any) => p.id), refundIds: refunds.map((r: any) => r.id) };
}
export async function restaurantBusinessDays(_root: unknown, _args: unknown, context: Context) {
  authorize(context);
  return (context.prisma as any).auditEvent.findMany({ where: { entityType, eventType: { in: ['business_day.opened', 'business_day.closed'] } }, orderBy: { occurredAt: 'desc' }, take: 100 });
}
export async function restaurantBusinessDay(_root: unknown, { id }: { id: string }, context: Context) {
  authorize(context);
  return (context.prisma as any).$transaction(async (tx: any) => {
    const events = await eventsFor(tx, id); const { open, close } = state(events);
    if (!open) throw new Error('Business day not found');
    return { id, events, closed: !!close, summary: close?.after || await snapshot(tx, events, new Date()) };
  }, { isolationLevel: 'Serializable' });
}
export async function openRestaurantBusinessDay(_root: unknown, args: { openingFloat: number; cutoffMinutes?: number; idempotencyKey: string }, context: Context) {
  authorize(context, true); money(args.openingFloat);
  if (!/^[\w-]{8,100}$/.test(args.idempotencyKey)) throw new Error('Stable request key required');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const key = `business-day-open:${args.idempotencyKey}`; const hash = fingerprint(args);
    const existing = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (existing) { if (existing.metadata?.fingerprint !== hash) throw new Error('Request key reused'); return existing.entityId; }
    const settings = await tx.storeSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new Error('Store settings required');
    const cutoffMinutes = args.cutoffMinutes || 0; const now = new Date();
    const id = businessDate(now, settings.timezone, cutoffMinutes);
    const all = await tx.auditEvent.findMany({ where: { entityType, eventType: { in: ['business_day.opened', 'business_day.closed'] } } });
    const closed = new Set(all.filter((e: any) => e.eventType === 'business_day.closed').map((e: any) => e.entityId));
    if (all.some((e: any) => e.eventType === 'business_day.opened' && !closed.has(e.entityId))) throw new Error('Close the active business day first');
    if (all.some((e: any) => e.entityId === id)) throw new Error('This business date is already closed');
    // Continue exactly at the previous close so late refunds are included once.
    const latestClose = all.filter((e: any) => e.eventType === 'business_day.closed').sort((a: any, b: any) => new Date(b.after.endAt).getTime() - new Date(a.after.endAt).getTime())[0];
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, entityType, entityId: id, eventType: 'business_day.opened', after: { openingFloat: args.openingFloat, timezone: settings.timezone, currencyCode: settings.currencyCode, cutoffMinutes, startAt: latestClose?.after.endAt || businessDayStart(id, settings.timezone, cutoffMinutes).toISOString() }, metadata: { fingerprint: hash } });
    return id;
  }, { isolationLevel: 'Serializable' });
}
export async function recordRestaurantCashMovement(_root: unknown, args: { id: string; direction: string; amount: number; reason: string; idempotencyKey: string }, context: Context) {
  authorize(context, true); money(args.amount);
  if (!['in', 'out'].includes(args.direction) || !args.amount || args.reason.trim().length < 3 || args.reason.length > 500 || !/^[\w-]{8,100}$/.test(args.idempotencyKey)) throw new Error('Direction, positive amount, reason and stable key required');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const key = `cash-movement:${args.idempotencyKey}`; const hash = fingerprint(args);
    const prior = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (prior) { if (prior.metadata?.fingerprint !== hash) throw new Error('Request key reused'); return prior; }
    const { open, close } = state(await eventsFor(tx, args.id)); if (!open || close) throw new Error('An open business day is required');
    return appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: 'business_day.cash_movement', entityType, entityId: args.id, reason: args.reason, after: { direction: args.direction, amount: args.amount }, metadata: { fingerprint: hash } });
  }, { isolationLevel: 'Serializable' });
}
export async function closeRestaurantBusinessDay(_root: unknown, args: { id: string; countedCash: number; reason: string }, context: Context) {
  authorize(context, true); money(args.countedCash);
  return (context.prisma as any).$transaction(async (tx: any) => {
    const events = await eventsFor(tx, args.id); const { open, close } = state(events); if (!open) throw new Error('Business day not found');
    const hash = fingerprint(args);
    if (close) { if (close.metadata?.fingerprint !== hash) throw new Error('Closed day is immutable'); return close.after; }
    const end = new Date();
    const pending = await tx.payment.count({ where: { createdAt: { lt: end }, status: { in: ['processing', 'authorized', 'unknown'] } } });
    const pendingRefunds = await tx.refund.count({ where: { createdAt: { lt: end }, status: { in: ['processing', 'unknown'] } } });
    if (pending || pendingRefunds) throw new Error('Reconcile pending/unknown payments and refunds before closing');
    const summary = await snapshot(tx, events, end); const variance = args.countedCash - summary.expectedCash;
    if (variance && args.reason.trim().length < 3) throw new Error('Explain the cash variance');
    const after = { ...summary, countedCash: args.countedCash, variance };
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: `business-day-close:${args.id}`, eventType: 'business_day.closed', entityType, entityId: args.id, reason: args.reason, after, metadata: { fingerprint: hash } });
    return after;
  }, { isolationLevel: 'Serializable' });
}
export async function recordRestaurantSettlement(_root: unknown, args: { id: string; reference: string; method: string; gross: number; fees: number; net: number; reason: string }, context: Context) {
  authorize(context, true); [args.gross, args.fees, args.net].forEach(money);
  if (!args.reference.trim() || args.reference.length > 200 || !args.method.trim() || args.gross - args.fees !== args.net || args.reason.trim().length < 3) throw new Error('Balanced settlement reference and explanation required');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const { close } = state(await eventsFor(tx, args.id)); if (!close) throw new Error('Close the day before attaching settlement evidence');
    const hash = fingerprint(args); const key = `settlement:${fingerprint({ method: args.method, reference: args.reference })}`;
    const prior = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (prior) { if (prior.metadata?.fingerprint !== hash) throw new Error('Settlement reference reused'); return prior; }
    return appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: 'business_day.settlement', entityType, entityId: args.id, reason: args.reason, after: { ...args, differenceFromRecordedTender: args.gross - (close.after.tenders[args.method]?.net || 0) }, metadata: { fingerprint: hash } });
  }, { isolationLevel: 'Serializable' });
}
