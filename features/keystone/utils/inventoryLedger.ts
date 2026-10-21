import { allocateStockLots } from "./inventoryLots";
import type { Context } from '.keystone/types';

/** Frozen production facts, item identity and a serializable stock ledger survive check moves/retries. */
export async function depleteInventoryForCompletedOrder(orderId: string, context: Context) {
  return (context.prisma as any).$transaction(async (tx: any) => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { orderItems: true } });
    if (!order) throw new Error('Order not found');
    if (!['completed', 'cancelled'].includes(order.status)) throw new Error('Inventory can only be reconciled for a closed order');
    let created = 0, existing = 0;
    for (const item of order.orderItems || []) {
      const prepared = Boolean(item.kitchenStartedAt || item.kitchenReadyAt || item.fulfilledAt);
      const loss = item.isVoided || order.status === 'cancelled';
      if (loss && !prepared) continue;
      // Old versions keyed movements by order + item. Do not replay their consumption
      // with a new key or reinterpret their historical recipe after this upgrade.
      const historical = await tx.stockMovement.findMany({ where: { referenceType: 'OrderItem', referenceId: item.id } });
      const legacy = historical.filter((m: any) => String(m.eventKey).startsWith('sale:') && String(m.eventKey).split(':').length === 4);
      if (legacy.length) { existing += legacy.length; continue; }
      const snapshot = await tx.auditEvent.findUnique({ where: { eventKey: `recipe-snapshot:${item.id}` } });
      if (!snapshot) throw new Error(`Missing production recipe snapshot for ${item.id}; review legacy production before reconciling inventory`);
      const recipe = snapshot.after;
      if (!recipe?.recipeId) continue; // Explicit frozen "no recipe" is different from a missing snapshot.
      if (!Array.isArray(recipe.ingredients) || !(Number(recipe.recipeYield) > 0)) throw new Error('Invalid frozen production recipe');
      for (const row of recipe.ingredients) {
        const raw = Number(row.quantity) * Number(item.quantity) / Number(recipe.recipeYield);
        if (!row.ingredientId || !Number.isFinite(raw) || raw <= 0) throw new Error('Invalid frozen production recipe');
        const quantity = Math.round(raw * 100) / 100;
        if (!quantity) throw new Error('Consumption is below stock resolution; use grams or milliliters as the stocking unit');
        const eventKey = `sale:${item.id}:${row.ingredientId}`;
        if (await tx.stockMovement.findUnique({ where: { eventKey } })) { existing++; continue; }
        const ingredient = await tx.ingredient.findUnique({ where: { id: row.ingredientId } });
        if (!ingredient || ingredient.unit !== row.unit) throw new Error('Frozen recipe ingredient or stocking unit changed; review before reconciling');
        const movement = await tx.stockMovement.create({ data: {
          eventKey, referenceType: 'OrderItem', referenceId: item.id, ingredientId: row.ingredientId, orderId,
          type: loss ? 'waste' : 'sale', quantity: (-quantity).toFixed(2),
          reason: `${loss ? 'Prepared loss' : 'Theoretical depletion'} for order ${order.orderNumber}`,
          metadata: { orderId, recipeId: recipe.recipeId, recipeVersion: recipe.recipeVersion, recipeYield: recipe.recipeYield, prepared, theoretical: true, reviewedLegacy: Boolean(recipe.reviewedLegacy) },
        } });
        await allocateStockLots(tx, movement, ingredient, { actorId: context.session?.itemId, purpose: loss ? 'waste' : 'production', now: item.kitchenStartedAt || item.kitchenReadyAt || item.fulfilledAt || undefined });
        await tx.ingredient.update({ where: { id: ingredient.id }, data: { currentStock: (Number(ingredient.currentStock || 0) - quantity).toFixed(2) } });
        created++;
      }
    }
    return { created, existing };
  }, { isolationLevel: 'Serializable' });
}
