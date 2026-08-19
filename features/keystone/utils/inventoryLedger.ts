import type { Context } from ".keystone/types";

type DepletionLine = {
  eventKey: string;
  orderItemId: string;
  ingredientId: string;
  quantity: number;
  recipeId: string;
  recipeYield: number;
};

export async function depleteInventoryForCompletedOrder(orderId: string, context: Context) {
  const sudo = context.sudo();
  const order = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status orderItems { id quantity menuItem { id } }",
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "completed") throw new Error("Inventory can only be depleted for a completed order");

  const lines: DepletionLine[] = [];
  for (const orderItem of order.orderItems || []) {
    if (!orderItem.menuItem?.id) continue;
    const recipes = await sudo.query.Recipe.findMany({
      where: { menuItem: { id: { equals: orderItem.menuItem.id } } },
      query: "id recipeIngredients yield",
      take: 1,
    });
    const recipe = recipes[0];
    if (!recipe || !Array.isArray(recipe.recipeIngredients)) continue;
    const recipeYield = Math.max(1, Number(recipe.yield || 1));
    const portions = Number(orderItem.quantity || 0) / recipeYield;
    for (const recipeIngredient of recipe.recipeIngredients as any[]) {
      const ingredientId = String(recipeIngredient?.ingredientId || "");
      const quantity = Number(recipeIngredient?.quantity || 0) * portions;
      if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) continue;
      lines.push({
        eventKey: `sale:${order.id}:${orderItem.id}:${ingredientId}`,
        orderItemId: orderItem.id,
        ingredientId,
        quantity: Math.round(quantity * 100) / 100,
        recipeId: recipe.id,
        recipeYield,
      });
    }
  }

  const prisma = context.prisma as any;
  return prisma.$transaction(async (tx: any) => {
    let created = 0;
    for (const line of lines) {
      const existing = await tx.stockMovement.findUnique({ where: { eventKey: line.eventKey } });
      if (existing) continue;
      const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId } });
      if (!ingredient) throw new Error(`Ingredient not found: ${line.ingredientId}`);
      const nextStock = Number(ingredient.currentStock || 0) - line.quantity;
      await tx.stockMovement.create({
        data: {
          eventKey: line.eventKey,
          referenceType: "OrderItem",
          referenceId: line.orderItemId,
          metadata: {
            orderId: order.id,
            recipeId: line.recipeId,
            recipeYield: line.recipeYield,
            theoretical: true,
          },
          ingredientId: line.ingredientId,
          orderId: order.id,
          type: "sale",
          quantity: (-line.quantity).toFixed(2),
          reason: `Theoretical depletion for order ${order.orderNumber}`,
        },
      });
      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: { currentStock: nextStock.toFixed(2) },
      });
      created += 1;
    }
    return { created, existing: lines.length - created };
  }, { isolationLevel: "Serializable" });
}
