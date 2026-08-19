import type { Context } from ".keystone/types";

export type ValidatedCartItem = {
  menuItem: {
    id: string;
    name: string;
    price: number;
    thumbnail?: string | null;
    kitchenStation?: string | null;
  };
  modifiers: Array<{
    id: string;
    name: string;
    modifierGroup: string;
    modifierGroupLabel?: string | null;
    priceAdjustment: number;
  }>;
  quantity: number;
  specialInstructions: string;
  unitPrice: number;
};

type ModifierRecord = ValidatedCartItem["modifiers"][number] & {
  required?: boolean | null;
  minSelections?: number | null;
  maxSelections?: number | null;
};

export function normalizeCartQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error("Quantity must be a whole number between 1 and 99");
  }
  return quantity;
}

export function normalizeSpecialInstructions(value: unknown) {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error("Special instructions must be text");
  const normalized = value.trim();
  if (normalized.length > 500) throw new Error("Special instructions cannot exceed 500 characters");
  return normalized;
}

export function validateModifierSelections(
  availableModifiers: ModifierRecord[],
  requestedModifierIds: string[] = []
) {
  const uniqueIds = Array.from(new Set(requestedModifierIds.filter(Boolean)));
  if (uniqueIds.length !== requestedModifierIds.length) {
    throw new Error("A modifier cannot be selected more than once");
  }

  const byId = new Map(availableModifiers.map((modifier) => [modifier.id, modifier]));
  const selected = uniqueIds.map((id) => {
    const modifier = byId.get(id);
    if (!modifier) throw new Error("One or more selected modifiers do not belong to this menu item");
    return modifier;
  });

  const groups = new Map<string, ModifierRecord[]>();
  for (const modifier of availableModifiers) {
    const key = modifier.modifierGroup || "addons";
    groups.set(key, [...(groups.get(key) || []), modifier]);
  }

  for (const [group, groupModifiers] of groups) {
    const selectedCount = selected.filter((modifier) => modifier.modifierGroup === group).length;
    const required = groupModifiers.some((modifier) => Boolean(modifier.required));
    const configuredMinimum = Math.max(0, ...groupModifiers.map((modifier) => Number(modifier.minSelections || 0)));
    const minimum = Math.max(required ? 1 : 0, configuredMinimum);
    const configuredMaximum = groupModifiers
      .map((modifier) => Number(modifier.maxSelections || 0))
      .filter((maximum) => maximum > 0);
    const maximum = configuredMaximum.length > 0 ? Math.min(...configuredMaximum) : groupModifiers.length;

    if (selectedCount < minimum) {
      throw new Error(`Select at least ${minimum} option${minimum === 1 ? "" : "s"} from ${group}`);
    }
    if (selectedCount > maximum) {
      throw new Error(`Select no more than ${maximum} option${maximum === 1 ? "" : "s"} from ${group}`);
    }
  }

  return selected;
}

export async function validateCartItemInput(
  context: Context,
  input: {
    menuItemId: string;
    quantity: number;
    modifierIds?: string[] | null;
    specialInstructions?: string | null;
  }
): Promise<ValidatedCartItem> {
  if (!input.menuItemId) throw new Error("Menu item is required");

  const menuItem = await context.sudo().query.MenuItem.findOne({
    where: { id: input.menuItemId },
    query: `
      id
      name
      price
      available
      thumbnail
      kitchenStation
      modifiers {
        id
        name
        modifierGroup
        modifierGroupLabel
        required
        minSelections
        maxSelections
        priceAdjustment
      }
    `,
  });

  if (!menuItem) throw new Error("Menu item not found");
  if (!menuItem.available) throw new Error(`${menuItem.name || "Selected item"} is unavailable`);

  const quantity = normalizeCartQuantity(input.quantity);
  const specialInstructions = normalizeSpecialInstructions(input.specialInstructions);
  const modifiers = validateModifierSelections(
    (menuItem.modifiers || []).map((modifier: any) => ({
      ...modifier,
      priceAdjustment: Math.round(Number(modifier.priceAdjustment || 0)),
    })),
    input.modifierIds || []
  );
  const basePrice = Math.round(Number(menuItem.price || 0));
  const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.priceAdjustment, 0);
  const unitPrice = basePrice + modifierTotal;

  if (unitPrice < 0) throw new Error("Selected modifiers cannot make the item price negative");

  return {
    menuItem: {
      id: menuItem.id,
      name: menuItem.name || "Item",
      price: basePrice,
      thumbnail: menuItem.thumbnail || null,
      kitchenStation: menuItem.kitchenStation || null,
    },
    modifiers,
    quantity,
    specialInstructions,
    unitPrice,
  };
}
