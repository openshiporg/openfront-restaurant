import { stockQuantity, combineRecipeIngredients } from '../../lib/stock-units';
import type { Context } from '.keystone/types';
import { appendAuditEventWithClient } from './audit';
async function productionRecipe(tx: any, menuItemId: string | null | undefined) {
  const recipes = menuItemId ? await tx.recipe.findMany({ where: { menuItemId }, take: 2 }) : [];
  if (recipes.length > 1) throw new Error('A menu item must have one production recipe before dispatch');
  const recipe = recipes[0];
  const recipeYield = Number(recipe?.yield ?? 1);
  if (!Number.isFinite(recipeYield) || recipeYield <= 0) throw new Error('Production recipe yield must be positive');
  const normalized = [];
  if (recipe && !Array.isArray(recipe.recipeIngredients)) throw new Error('Production recipe ingredients must be an array');
  for (const row of recipe?.recipeIngredients || []) {
    const ingredient = await tx.ingredient.findUnique({ where: { id: String(row.ingredientId || '') } });
    if (!ingredient) throw new Error('Production recipe references a missing ingredient');
    normalized.push({ ingredientId: ingredient.id, unit: ingredient.unit, quantity: stockQuantity(row.quantity, row.unit, ingredient.unit) });
  }
  return { recipeId: recipe?.id || null, recipeVersion: recipe?.updatedAt?.toISOString() || null, recipeYield, ingredients: combineRecipeIngredients(normalized) };
}
/** Private production facts precede provider confirmation, outside public quote JSON. */
export async function snapshotCheckoutRecipes(context: Context, sessionId: string, items: any[]) {
  return (context.prisma as any).$transaction(async (tx: any) => {
    for (const [index, item] of items.entries()) {
      const key = `checkout-recipe:${sessionId}:${index}`;
      if (await tx.auditEvent.findUnique({ where: { eventKey: key } })) continue;
      await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, entityType: 'PaymentSession', entityId: sessionId, eventType: 'inventory.checkout_recipe_snapshot', after: await productionRecipe(tx, item.menuItem?.id) });
    }
  }, { isolationLevel: 'Serializable' });
}
export async function attachCheckoutRecipeWithClient(tx: any, sessionId: string, index: number, itemId: string, actorId?: string | null) {
  const privateQuote = await tx.auditEvent.findUnique({ where: { eventKey: `checkout-recipe:${sessionId}:${index}` } });
  if (!privateQuote) throw new Error('Checkout production snapshot is missing; reconcile this legacy attempt before dispatch');
  return appendAuditEventWithClient(tx, actorId, { eventKey: `recipe-snapshot:${itemId}`, entityType: 'OrderItem', entityId: itemId, eventType: 'inventory.recipe_snapshot', after: privateQuote.after });
}
/** POS recipes are frozen at first dispatch; splits retain original item identity. */
export async function snapshotOrderRecipes(orderId: string, context: Context) {
  return (context.prisma as any).$transaction(async (tx: any) => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId } });
    if (!order || order.onHold || !['sent_to_kitchen', 'in_progress', 'ready'].includes(order.status)) return;
    const items = await tx.orderItem.findMany({ where: { orderId }, include: { course: true } });
    for (const item of items) {
      if (item.isVoided || item.course?.onHold || (item.course && !['fired', 'served', 'completed'].includes(item.course.status))) continue;
      const key = `recipe-snapshot:${item.id}`;
      if (await tx.auditEvent.findUnique({ where: { eventKey: key } })) continue;
      await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, entityType: 'OrderItem', entityId: item.id, eventType: 'inventory.recipe_snapshot', after: await productionRecipe(tx, item.menuItemId || item.menuItemIdSnapshot) });
    }
  }, { isolationLevel: 'Serializable' });
}

/** Explicit operator review only; never silently substitutes today's recipe for history. */
export async function reviewLegacyOrderRecipes(orderId: string, reason: string, context: Context) {
  if (reason.trim().length < 10) throw new Error('Describe the production records checked and why the current recipe is accurate');
  return (context.prisma as any).$transaction(async (tx: any) => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { orderItems: true } });
    if (!order || !['completed', 'cancelled'].includes(order.status)) throw new Error('Review requires a closed legacy check');
    let created = 0;
    for (const item of order.orderItems) {
      const key = `recipe-snapshot:${item.id}`;
      if (await tx.auditEvent.findUnique({ where: { eventKey: key } })) continue;
      const after = await productionRecipe(tx, item.menuItemId || item.menuItemIdSnapshot);
      await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: 'inventory.recipe_snapshot', entityType: 'OrderItem', entityId: item.id, reason, after: { ...after, reviewedLegacy: true } });
      created++;
    }
    return { created };
  }, { isolationLevel: 'Serializable' });
}
