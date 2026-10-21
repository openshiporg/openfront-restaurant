import { transferStockLots } from "../utils/inventoryLots";
import type { Context } from '.keystone/types';
import { permissions } from '../access';
import { stockQuantity } from '../../lib/stock-units';
import { appendAuditEventWithClient } from '../utils/audit';
import { createHash } from 'node:crypto';
export async function transferRestaurantStock(_: unknown, args: { fromId: string; toId: string; quantity: number; reason: string; idempotencyKey: string }, context: Context) {
  if (!permissions.canManageInventory(context)) throw new Error('Not authorized');
  if (args.fromId === args.toId || !Number.isFinite(args.quantity) || args.quantity <= 0 || args.quantity > 999999 || Math.abs(args.quantity * 100 - Math.round(args.quantity * 100)) > 1e-6 || args.reason.trim().length < 3 || !/^[\w-]{8,100}$/.test(args.idempotencyKey)) throw new Error('Distinct stock records, precise positive quantity, reason and stable key required');
  const key = `stock-transfer:${args.idempotencyKey}`, fingerprint = createHash('sha256').update(JSON.stringify(args)).digest('hex');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const prior = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (prior) { if (prior.metadata?.fingerprint !== fingerprint) throw new Error('Transfer key reused'); return prior.after; }
    const from = await tx.ingredient.findUnique({ where: { id: args.fromId }, include: { location: true } });
    const to = await tx.ingredient.findUnique({ where: { id: args.toId }, include: { location: true } });
    if (!from || !to || !from.sku?.trim() || from.sku !== to.sku) throw new Error('Transfer requires matching nonempty SKU stock records');
    if (!from.location?.isActive || !to.location?.isActive) throw new Error('Both storage locations must be active');
    if (Number(from.currentStock) < args.quantity) throw new Error('Insufficient source stock');
    const converted = stockQuantity(args.quantity, from.unit, to.unit);
    if (Math.abs(converted * 100 - Math.round(converted * 100)) > 1e-6) throw new Error('Transfer loses stock precision; use compatible base stock units');
    const after = { fromId: from.id, toId: to.id, sku: from.sku, fromLocationId: from.locationId, toLocationId: to.locationId, sourceQuantity: args.quantity, targetQuantity: converted, sourceUnit: from.unit, targetUnit: to.unit };
    const movements: any[] = [];
    for (const [ingredient, quantity, side] of [[from, -args.quantity, 'out'], [to, converted, 'in']] as const) {
      movements.push(await tx.stockMovement.create({ data: { eventKey: `${key}:${side}`, type: 'adjustment', ingredientId: ingredient.id, quantity: quantity.toFixed(2), referenceType: 'StockTransfer', referenceId: key, reason: args.reason, createdById: context.session?.itemId, metadata: after } }));
    }
    await transferStockLots(tx, movements[0], movements[1], from, to, context.session?.itemId);
    await tx.ingredient.update({ where: { id: from.id }, data: { currentStock: (Number(from.currentStock) - args.quantity).toFixed(2) } });
    await tx.ingredient.update({ where: { id: to.id }, data: { currentStock: (Number(to.currentStock) + converted).toFixed(2) } });
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: 'inventory.stock_transfer', entityType: 'StockMovement', entityId: key, reason: args.reason, after, metadata: { fingerprint } });
    return after;
  }, { isolationLevel: 'Serializable' });
}
