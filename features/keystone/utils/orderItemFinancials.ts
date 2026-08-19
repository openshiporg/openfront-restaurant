export type FinancialOrderItem = {
  quantity?: number | null;
  price?: number | null;
  adjustmentTotal?: number | null;
  isVoided?: boolean | null;
};

export function getOrderItemOriginalTotal(item: FinancialOrderItem) {
  return Math.max(0, Math.round(Number(item.price || 0))) * Math.max(0, Math.round(Number(item.quantity || 0)));
}

export function getOrderItemEffectiveTotal(item: FinancialOrderItem) {
  if (item.isVoided) return 0;
  return Math.max(0, getOrderItemOriginalTotal(item) - Math.max(0, Math.round(Number(item.adjustmentTotal || 0))));
}

export function getOrderItemsSubtotal(items: FinancialOrderItem[]) {
  return items.reduce((sum, item) => sum + getOrderItemEffectiveTotal(item), 0);
}
