const units: Record<string, [string, number]> = { kg: ['mass', 1000], g: ['mass', 1], lb: ['mass', 453.59237], oz: ['mass', 28.349523125], liter: ['volume', 1000], l: ['volume', 1000], ml: ['volume', 1], gallon: ['volume', 3785.411784], each: ['each', 1], case: ['case', 1], box: ['box', 1] };
export function stockQuantity(value: unknown, from: string | undefined, to: string) {
  const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error('Recipe quantities must be positive and finite');
  const a = units[String(from || to).toLowerCase()], b = units[String(to).toLowerCase()];
  if (!a || !b || a[0] !== b[0]) throw new Error('Recipe units cannot be converted to the ingredient stock unit');
  return n * a[1] / b[1];
}
export function combineRecipeIngredients(rows: { ingredientId: string; quantity: number; unit: string }[]) {
  const combined = new Map<string, { ingredientId: string; quantity: number; unit: string }>();
  for (const row of rows) {
    const prior = combined.get(row.ingredientId);
    if (prior && prior.unit !== row.unit) throw new Error('Conflicting stock units');
    if (prior) prior.quantity += row.quantity; else combined.set(row.ingredientId, { ...row });
  }
  return [...combined.values()];
}
