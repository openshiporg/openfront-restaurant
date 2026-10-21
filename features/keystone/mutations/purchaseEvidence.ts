import { permissions } from '../access';
import { appendAuditEventWithClient } from '../utils/audit';
import { idempotencyFingerprint } from '../utils/idempotency';
import { readStockLots, stockHundredths } from '../utils/inventoryLots';
import { fromMinorUnits } from '../../storefront/lib/currency';
function authorize(context: any, write = true) {
  if (!(permissions.canManageInventory(context) || (!write && permissions.canReadInventory(context)))) throw new Error('Inventory permission required');
}
function bounded(value: unknown, label: string, max = 250) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is required and must be bounded`);
  return value.trim();
}
function money(value: unknown, allowZero = true) {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1) || Number(value) > 2147483647) throw new Error('Money must be nonnegative integer minor units');
  return Number(value);
}
/** Unit prices may be fractional minor units; round only the extended line. */
export function purchaseLineAmount(quantityHundredths: number, unitCost: unknown, currencyCode: string) {
  const price = typeof unitCost === 'number' ? unitCost.toFixed(6).replace(/\.?0+$/, '') || '0' : String(unitCost);
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(price)) throw new Error('Unit cost must be nonnegative major units with at most six decimal places');
  if (typeof unitCost === 'number' && Math.abs(Number(price) - unitCost) > 1e-10) throw new Error('Unit cost exceeds six-decimal pricing precision');
  const [whole, fraction = ''] = price.split('.');
  const micros = BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'));
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  const numerator = micros * BigInt(quantityHundredths) * BigInt(10 ** digits), denominator = BigInt(100000000);
  return money(Number((numerator + denominator / BigInt(2)) / denominator));
}
async function transaction(context: any, operation: (tx: any) => Promise<any>) {
  for (let attempt = 0; attempt < 4; attempt++) try { return await context.prisma.$transaction(operation, { isolationLevel: 'Serializable' }); }
  catch (error: any) { if (attempt < 3 && ['P2034', 'P2002'].includes(error.code)) continue; throw error; }
}
async function evidence(tx: any, id: string) {
  const events = await tx.auditEvent.findMany({ where: { entityType: 'PurchaseOrder', entityId: id, eventType: { in: ['purchase.invoice_matched', 'purchase.credit_recorded'] } }, take: 10001 });
  if (events.length > 10000) throw new Error('Purchase evidence window requires archive-aware review');
  return events;
}
function receiptBilled(events: any[], receiptId: string) {
  let quantity = 0;
  for (const event of events) for (const line of event.after.lines) if (line.receiptId === receiptId) quantity += (event.eventType === 'purchase.invoice_matched' ? 1 : -1) * stockHundredths(line.quantity, true);
  return quantity;
}
function requestKey(key: string) { if (!/^[\w-]{8,100}$/.test(key || '')) throw new Error('Stable purchase evidence request key required'); return `purchase-evidence-request:${key}`; }
async function priorRequest(tx: any, key: string, fingerprint: string) {
  const prior = await tx.auditEvent.findUnique({ where: { eventKey: requestKey(key) } });
  if (prior && prior.metadata?.fingerprint !== fingerprint) throw new Error('Purchase request key belongs to different input');
  return prior?.after;
}
async function finish(tx: any, actorId: string, key: string, fingerprint: string, event: any) {
  const result = { eventId: event.id, ...event.after };
  await appendAuditEventWithClient(tx, actorId, { eventKey: requestKey(key), entityType: event.entityType, entityId: event.entityId, eventType: 'purchase.evidence_request', metadata: { fingerprint }, after: result });
  return result;
}
export async function restaurantPurchaseEvidence(_: unknown, args: { id: string }, context: any) {
  authorize(context, false);
  return transaction(context, async tx => {
    const order = await tx.purchaseOrder.findUnique({ where: { id: args.id }, include: { vendor: { select: { id: true, name: true } } } });
    if (!order) throw new Error('Purchase order not found');
    const policy = await tx.auditEvent.findUnique({ where: { eventKey: `purchase-currency:${order.id}` } });
    const events = await evidence(tx, order.id);
    const receipts = await tx.stockMovement.findMany({ where: { referenceType: 'PurchaseOrder', referenceId: order.id, type: 'delivery' }, orderBy: { createdAt: 'asc' }, take: 10001 });
    if (receipts.length > 10000) throw new Error('Receipt window requires archive-aware review');
    return { order, currencyCode: policy?.after?.currencyCode || null, events, receipts: receipts.map((receipt: any) => ({ ...receipt, billedQuantity: receiptBilled(events, receipt.id) / 100, unbilledQuantity: (stockHundredths(receipt.quantity) - receiptBilled(events, receipt.id)) / 100 })), scope: 'Goods invoice/credit matching; no accounts-payable transfer or tax certification' };
  });
}
export async function recordRestaurantPurchaseInvoice(_: unknown, args: { id: string; reference: string; currencyCode: string; lines: any[]; varianceReason?: string; idempotencyKey: string }, context: any) {
  authorize(context); requestKey(args.idempotencyKey);
  const reference = bounded(args.reference, 'Supplier invoice reference');
  if (!/^[A-Z]{3}$/.test(args.currencyCode || '')) throw new Error('Invoice currency must be a three-letter uppercase currency code');
  new Intl.NumberFormat('en', { style: 'currency', currency: args.currencyCode });
  if (!Array.isArray(args.lines) || !args.lines.length || args.lines.length > 100) throw new Error('Invoice needs 1–100 received-goods lines');
  const fingerprint = idempotencyFingerprint(args);
  return transaction(context, async tx => {
    const replay = await priorRequest(tx, args.idempotencyKey, fingerprint); if (replay) return replay;
    const order = await tx.purchaseOrder.findUnique({ where: { id: args.id }, include: { vendor: { select: { id: true, name: true } } } });
    if (!order?.vendorId || !order.vendor) throw new Error('Purchase order and supplier evidence are required');
    const eventKey = `purchase-invoice-ref:${idempotencyFingerprint({ vendorId: order.vendorId, reference })}`;
    const duplicate = await tx.auditEvent.findUnique({ where: { eventKey } });
    if (duplicate) { if (duplicate.metadata?.fingerprint !== fingerprint) throw new Error('Supplier invoice reference has already been matched'); return finish(tx, context.session.itemId, args.idempotencyKey, fingerprint, duplicate); }
    const events = await evidence(tx, order.id); const seen = new Set<string>(), lines = [];
    let totalMinor = 0, expectedMinor = 0, legacyCurrencyReviewed = false;
    for (const input of args.lines) {
      const receiptId = bounded(input?.receiptId, 'Receipt movement ID');
      if (seen.has(receiptId)) throw new Error('Combine repeated receipt lines'); seen.add(receiptId);
      const receipt = await tx.stockMovement.findUnique({ where: { id: receiptId } });
      if (!receipt || receipt.type !== 'delivery' || receipt.referenceType !== 'PurchaseOrder' || receipt.referenceId !== order.id || !receipt.ingredientId) throw new Error('Invoice line must reference this purchase order’s actual receipt');
      const quantity = stockHundredths(input.quantity);
      const unitCost = input.unitCost !== undefined ? input.unitCost : fromMinorUnits(money(input.unitCostMinor), args.currencyCode);
      if (receiptBilled(events, receiptId) + quantity > stockHundredths(receipt.quantity)) throw new Error('Invoice quantity exceeds received units remaining unmatched');
      const currency = receipt.metadata?.currencyCode;
      if (currency && currency !== args.currencyCode) throw new Error('Invoice currency differs from recorded receipt currency');
      if (!currency) legacyCurrencyReviewed = true;
      if (receipt.metadata?.unitCost == null || !Number.isFinite(Number(receipt.metadata.unitCost))) throw new Error('Receipt unit cost evidence is missing');
      const expectedUnitCost = String(receipt.metadata.unitCost);
      const amountMinor = purchaseLineAmount(quantity, unitCost, args.currencyCode);
      const expectedAmountMinor = purchaseLineAmount(quantity, expectedUnitCost, args.currencyCode);
      lines.push({ receiptId, ingredientId: receipt.ingredientId, quantity: quantity / 100, unit: receipt.metadata.unit, unitCost: String(unitCost), expectedUnitCost, amountMinor, expectedAmountMinor, lotCode: receipt.metadata?.lotCode || null });
      totalMinor += amountMinor; expectedMinor += expectedAmountMinor;
    }
    money(totalMinor); money(expectedMinor);
    const varianceMinor = totalMinor - expectedMinor;
    const hasLineVariance = lines.some(line => Number(line.unitCost) !== Number(line.expectedUnitCost));
    if ((hasLineVariance || legacyCurrencyReviewed) && (!args.varianceReason?.trim() || args.varianceReason.length > 1000)) throw new Error('Explain every cost variance or explicitly attest missing historical receipt currency');
    const after = { reference, vendorId: order.vendorId, vendorName: order.vendor.name, currencyCode: args.currencyCode, lines, totalMinor, expectedMinor, varianceMinor, legacyCurrencyReviewed, invoiceScope: 'received-goods-excluding-tax-and-freight', status: hasLineVariance ? 'matched_with_explained_variance' : 'matched' };
    const event = await appendAuditEventWithClient(tx, context.session.itemId, { eventKey, entityType: 'PurchaseOrder', entityId: order.id, eventType: 'purchase.invoice_matched', reason: args.varianceReason || '', after, metadata: { fingerprint } });
    return finish(tx, context.session.itemId, args.idempotencyKey, fingerprint, event);
  });
}
export async function recordRestaurantPurchaseCredit(_: unknown, args: { id: string; invoiceId: string; reference: string; lines: any[]; reason: string; idempotencyKey: string }, context: any) {
  authorize(context); requestKey(args.idempotencyKey);
  const reference = bounded(args.reference, 'Supplier credit reference'), reason = bounded(args.reason, 'Credit/correction reason', 1000);
  if (!Array.isArray(args.lines) || !args.lines.length || args.lines.length > 100) throw new Error('Credit needs 1–100 invoice lines');
  const fingerprint = idempotencyFingerprint(args);
  return transaction(context, async tx => {
    const replay = await priorRequest(tx, args.idempotencyKey, fingerprint); if (replay) return replay;
    const invoice = await tx.auditEvent.findUnique({ where: { id: args.invoiceId } });
    if (!invoice || invoice.entityId !== args.id || invoice.eventType !== 'purchase.invoice_matched') throw new Error('Invoice must belong to this purchase order');
    const eventKey = `purchase-credit-ref:${idempotencyFingerprint({ vendorId: invoice.after.vendorId, reference })}`;
    const duplicate = await tx.auditEvent.findUnique({ where: { eventKey } });
    if (duplicate) { if (duplicate.metadata?.fingerprint !== fingerprint) throw new Error('Supplier credit reference already recorded'); return finish(tx, context.session.itemId, args.idempotencyKey, fingerprint, duplicate); }
    const priorCredits = (await evidence(tx, args.id)).filter((event: any) => event.eventType === 'purchase.credit_recorded' && event.after.invoiceId === invoice.id);
    const seen = new Set<number>(), lines = []; let totalMinor = 0;
    for (const input of args.lines) {
      if (!Number.isSafeInteger(input?.invoiceLineIndex) || input.invoiceLineIndex < 0 || seen.has(input.invoiceLineIndex)) throw new Error('Credit requires distinct original invoice line indexes');
      seen.add(input.invoiceLineIndex); const original = invoice.after.lines[input.invoiceLineIndex]; if (!original) throw new Error('Original invoice line missing');
      const quantity = stockHundredths(input.quantity, true), amountMinor = money(input.amountMinor, false);
      const prior = priorCredits.flatMap((event: any) => event.after.lines).filter((line: any) => line.invoiceLineIndex === input.invoiceLineIndex);
      const alreadyQuantity = prior.reduce((sum: number, line: any) => sum + stockHundredths(line.quantity, true), 0), alreadyAmount = prior.reduce((sum: number, line: any) => sum + line.amountMinor, 0);
      if (quantity + alreadyQuantity > stockHundredths(original.quantity) || amountMinor + alreadyAmount > original.amountMinor) throw new Error('Credit exceeds uncredited original invoice quantity or amount');
      const remainingQuantity = stockHundredths(original.quantity) - alreadyQuantity, remainingAmount = original.amountMinor - alreadyAmount;
      if (quantity > 0 && amountMinor !== Number((BigInt(remainingAmount) * BigInt(quantity) + BigInt(Math.floor(remainingQuantity / 2))) / BigInt(remainingQuantity))) throw new Error('Quantity credits must proportionally reverse the remaining invoiced amount; use zero quantity for a price-only credit');
      lines.push({ invoiceLineIndex: input.invoiceLineIndex, receiptId: original.receiptId, ingredientId: original.ingredientId, quantity: quantity / 100, amountMinor, unit: original.unit }); totalMinor += amountMinor;
    }
    money(totalMinor);
    const after = { invoiceId: invoice.id, reference, vendorId: invoice.after.vendorId, currencyCode: invoice.after.currencyCode, lines, totalMinor, status: 'credit_recorded', stockEffect: 'none; financial quantity credit permits a separately matched corrected invoice' };
    const event = await appendAuditEventWithClient(tx, context.session.itemId, { eventKey, entityType: 'PurchaseOrder', entityId: args.id, eventType: 'purchase.credit_recorded', reason, after, metadata: { fingerprint } });
    return finish(tx, context.session.itemId, args.idempotencyKey, fingerprint, event);
  });
}
export async function restaurantIngredientLots(_: unknown, args: { ingredientId: string }, context: any) {
  authorize(context, false);
  return transaction(context, async tx => {
    const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } }); if (!ingredient) throw new Error('Ingredient not found');
    const result = await readStockLots(tx, ingredient.id);
    return { ingredient, ...result, untrackedQuantity: Number(ingredient.currentStock || 0) - result.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0), scope: 'Recorded FEFO allocation; physical batch selection must be verified by the operator' };
  });
}
export async function setRestaurantLotHold(_: unknown, args: { receiptId: string; onHold: boolean; reason: string; idempotencyKey: string }, context: any) {
  authorize(context); requestKey(args.idempotencyKey); const reason = bounded(args.reason, 'Lot hold/release reason', 1000), fingerprint = idempotencyFingerprint(args);
  return transaction(context, async tx => {
    const replay = await priorRequest(tx, args.idempotencyKey, fingerprint); if (replay) return replay;
    const receipt = await tx.stockMovement.findUnique({ where: { id: args.receiptId } });
    if (!receipt || !receipt.metadata?.lotCode || receipt.type !== 'delivery') throw new Error('Original received lot is required');
    const history = await tx.auditEvent.findMany({ where: { entityType: 'StockLot', entityId: receipt.id, eventType: 'inventory.lot_hold' }, take: 10001 });
    if (history.length > 10000) throw new Error('Lot hold history requires review');
    const revision = Math.max(0, ...history.map((event: any) => Number(event.after.revision))) + 1;
    const event = await appendAuditEventWithClient(tx, context.session.itemId, { eventKey: `stock-lot:hold:${receipt.id}:${revision}`, entityType: 'StockLot', entityId: receipt.id, eventType: 'inventory.lot_hold', reason, after: { receiptId: receipt.id, onHold: args.onHold, revision } });
    return finish(tx, context.session.itemId, args.idempotencyKey, fingerprint, event);
  });
}
