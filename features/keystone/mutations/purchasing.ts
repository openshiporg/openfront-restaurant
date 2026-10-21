import type { Context } from '.keystone/types';
import { permissions } from '../access';
import { appendAuditEventWithClient } from '../utils/audit';
import { registerReceiptLots, validateReceiptLot, allocateStockLots } from '../utils/inventoryLots';
import { createHash } from 'node:crypto';
function quantity(value: unknown) { const n = Number(value); if (!Number.isFinite(n) || n <= 0 || n > 999999 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw new Error('Positive quantity with at most two decimals required'); return n; }
function allow(context: Context) { if (!permissions.canManageInventory(context)) throw new Error('Not authorized'); }
export async function transitionPurchaseOrder(_root: unknown, args: { id: string; status: string }, context: Context) {
  allow(context);
  return (context.prisma as any).$transaction(async (tx: any) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: args.id } }); if (!po) throw new Error('Purchase order not found');
    if (po.status === args.status) return po;
    const allowed: Record<string, string[]> = { draft: ['sent', 'cancelled'], sent: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['cancelled'], partially_received: ['cancelled'] };
    if (!allowed[po.status]?.includes(args.status)) throw new Error('Invalid purchasing transition; received status requires receipt posting');
    if (args.status !== 'cancelled') {
      if (!po.vendorId || !Array.isArray(po.lineItems) || !po.lineItems.length || po.lineItems.length > 100) throw new Error('Vendor and 1–100 line items required');
      if (!await tx.vendor.findUnique({ where: { id: po.vendorId }, select: { id: true } })) throw new Error('Purchase vendor no longer exists');
      const ingredientIds = new Set<string>();
      for (const line of po.lineItems) {
        if (!line || typeof line !== 'object' || typeof line.ingredientId !== 'string' || !line.ingredientId) throw new Error('Ingredient required');
        if (ingredientIds.has(line.ingredientId)) throw new Error('Combine duplicate ingredient lines before sending');
        ingredientIds.add(line.ingredientId);
        const q = quantity(line.quantity);
        const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId }, select: { id: true, unit: true } });
        if (!ingredient) throw new Error('Purchase line ingredient no longer exists');
        if (line.unit !== ingredient.unit) throw new Error('Purchase line unit must match the ingredient stock unit');
        if (line.unitCost == null || line.unitCost === '' || !Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0 || !Number.isFinite(q * Number(line.unitCost))) throw new Error('Invalid purchase unit cost');
      }
    }
    if (args.status === 'sent') {
      const settings = await tx.storeSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } });
      if (!settings?.currencyCode) throw new Error('Purchase currency configuration is required');
      await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: `purchase-currency:${po.id}`, entityType: 'PurchaseOrder', entityId: po.id, eventType: 'purchase.currency_recorded', after: { currencyCode: settings.currencyCode } });
    }
    const received = args.status === 'cancelled' ? await tx.stockMovement.findMany({ where: { referenceType: 'PurchaseOrder', referenceId: po.id, type: 'delivery' }, select: { id: true, ingredientId: true, quantity: true } }) : [];

    const result = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: args.status } });
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventType: 'purchase_order.transition', entityType: 'PurchaseOrder', entityId: po.id, reason: args.status === 'cancelled' ? 'Operator cancelled the unreceived remainder; posted stock receipts remain effective' : '', before: { status: po.status }, after: { status: args.status }, metadata: args.status === 'cancelled' ? { receivedMovements: received, cancelledRemainderOnly: true } : undefined }); return result;
  }, { isolationLevel: 'Serializable' });
}
export async function receivePurchaseOrder(_root: unknown, args: { id: string; lines: any[]; reference: string; idempotencyKey: string; currencyCode?: string }, context: Context) {
  allow(context);
  if (!args.reference?.trim() || !/^[\w-]{8,100}$/.test(args.idempotencyKey) || !Array.isArray(args.lines) || !args.lines.length || args.lines.length > 100) throw new Error('Receipt reference, lines and stable request key required');
  const fingerprint = createHash('sha256').update(JSON.stringify(args)).digest('hex'); const key = `purchase-receipt:${args.idempotencyKey}`;
  return (context.prisma as any).$transaction(async (tx: any) => {
    const replay = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (replay) { if (replay.metadata?.fingerprint !== fingerprint) throw new Error('Receipt key reused'); return replay.after; }
    const po = await tx.purchaseOrder.findUnique({ where: { id: args.id } });
    if (!po || !['sent', 'confirmed', 'shipped', 'partially_received'].includes(po.status)) throw new Error('Purchase order is not receivable');
    const policy = await tx.auditEvent.findUnique({ where: { eventKey: `purchase-currency:${po.id}` } });
    const currencyCode = policy?.after?.currencyCode || args.currencyCode;
    if (!/^[A-Z]{3}$/.test(currencyCode || '')) throw new Error('Explicit receipt currency is required for a legacy purchase order');
    if (args.currencyCode && args.currencyCode !== currencyCode) throw new Error('Receipt currency differs from the purchase order’s recorded currency');
    const original = Array.isArray(po.lineItems) ? po.lineItems : [];
    const ids = args.lines.map(line => line.ingredientId); if (new Set(ids).size !== ids.length) throw new Error('Duplicate receipt ingredient');
    const posted: any[] = [];
    for (const line of args.lines) {
      const planned = original.filter((l: any) => l.ingredientId === line.ingredientId); if (planned.length !== 1) throw new Error('Receipt must match one purchase line');
      const q = quantity(line.quantity); const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId } });
      if (!ingredient || planned[0].unit !== ingredient.unit) throw new Error('Receipt unit must match the ingredient stock unit');
      const previous = await tx.stockMovement.findMany({ where: { referenceType: 'PurchaseOrder', referenceId: po.id, ingredientId: ingredient.id, type: 'delivery' } });
      const received = previous.reduce((sum: number, m: any) => sum + Number(m.quantity), 0);
      if (received + q > Number(planned[0].quantity) + 1e-8) throw new Error('Receipt exceeds outstanding quantity');
      const unitCost = Number(planned[0].unitCost); if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Invalid purchase unit cost');
      const lot = validateReceiptLot(line);
      const movement = await tx.stockMovement.create({ data: { eventKey: `${key}:${ingredient.id}`, type: 'delivery', quantity: q.toFixed(2), ingredientId: ingredient.id, referenceType: 'PurchaseOrder', referenceId: po.id, reason: args.reference, createdById: context.session?.itemId, metadata: { unitCost, unit: ingredient.unit, receiptKey: key, currencyCode, currencySource: policy ? "purchase_order" : "receiving_operator_attestation", ...(lot || {}) } } });
      await registerReceiptLots(tx, movement, ingredient, lot, context.session?.itemId);
      await tx.ingredient.update({ where: { id: ingredient.id }, data: { currentStock: (Number(ingredient.currentStock || 0) + q).toFixed(2) } });
      posted.push({ ingredientId: ingredient.id, movementId: movement.id, quantity: q, unitCost, unit: ingredient.unit, currencyCode, currencySource: policy ? "purchase_order" : "receiving_operator_attestation", ...(lot || {}) });
    }
    const allMovements = await tx.stockMovement.findMany({ where: { referenceType: 'PurchaseOrder', referenceId: po.id, type: 'delivery' } });
    const complete = original.every((line: any) => allMovements.filter((m: any) => m.ingredientId === line.ingredientId).reduce((sum: number, m: any) => sum + Number(m.quantity), 0) >= Number(line.quantity));
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? 'received' : 'partially_received', receivedDate: complete ? new Date() : undefined } });
    const after = { purchaseOrderId: po.id, reference: args.reference, lines: posted, complete };
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: 'purchase_order.receipt', entityType: 'PurchaseOrder', entityId: po.id, after, metadata: { fingerprint } }); return after;
  }, { isolationLevel: 'Serializable' });
}
export async function countIngredientStock(_root: unknown, args: { ingredientId: string; counted: number; expectedStock: number; reason: string; idempotencyKey: string }, context: Context) {
  allow(context);
  if (args.counted !== 0) quantity(args.counted);
  if (args.reason?.trim().length < 3 || !/^[\w-]{8,100}$/.test(args.idempotencyKey)) throw new Error('Count reason and stable request key required');
  const key = `stock-count:${args.idempotencyKey}`; const hash = createHash('sha256').update(JSON.stringify(args)).digest('hex');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const existing = await tx.stockMovement.findUnique({ where: { eventKey: key } }); if (existing) { if (existing.metadata?.fingerprint !== hash) throw new Error('Count key reused'); return existing; }
    const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } }); if (!ingredient) throw new Error('Ingredient not found');
    const before = Number(ingredient.currentStock || 0); if (before !== args.expectedStock) throw new Error('Stock changed; refresh and recount before posting');
    const movement = await tx.stockMovement.create({ data: { eventKey: key, type: 'adjustment', quantity: (args.counted - before).toFixed(2), ingredientId: ingredient.id, referenceType: 'StockCount', referenceId: args.idempotencyKey, reason: args.reason, createdById: context.session?.itemId, metadata: { before, counted: args.counted, fingerprint: hash } } });
    if (args.counted < before) await allocateStockLots(tx, movement, ingredient, { purpose: 'count', actorId: context.session?.itemId });
    await tx.ingredient.update({ where: { id: ingredient.id }, data: { currentStock: args.counted.toFixed(2) } }); return movement;
  }, { isolationLevel: 'Serializable' });
}
