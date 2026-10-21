import type { GraphQLClient } from "graphql-request";
import { getDeliveryConfigurationError } from "../../../lib/delivery-zones";

export function seedTableFloor(data: any, table: any) {
  return table.floor || data.sections?.find((section: any) => section.name === table.section)?.floor;
}

export function validateRestaurantSeed(data: any) {
  if (!data?.storeInfo?.name || !Array.isArray(data.categories) || !data.categories.length || !Array.isArray(data.menuItems) || !data.menuItems.length) throw new Error("Setup requires store information, categories and menu items");
  const deliveryError = getDeliveryConfigurationError({ ...data.storeInfo, deliveryEnabled: data.storeInfo.deliveryEnabled ?? true, countryCode: data.storeInfo.countryCode || "US" });
  if (deliveryError) throw new Error(`Setup delivery: ${deliveryError}`);
  for (const section of ["categories", "menuItems", "modifiers", "paymentMethods", "kitchenStations", "floors", "sections", "tables"]) {
    if (!Array.isArray(data[section])) throw new Error(`Setup ${section} must be a list`);
    const keys = data[section].map((record: any) => section === "tables" ? record.tableNumber : section === "modifiers" ? `${record.menuItemName}:${record.modifierGroup || "addons"}:${record.name}` : record.name);
    if (keys.some((key: unknown) => typeof key !== "string" || !key.trim()) || new Set(keys).size !== keys.length) throw new Error(`Setup ${section} contains missing or duplicate names`);
  }
  const names = (section: string) => new Set<string>(data[section].map((record: any) => record.name));
  for (const item of data.menuItems) {
    if (!names("categories").has(item.category)) throw new Error(`Missing category for ${item.name}`);
    if (!data.kitchenStations.some((station: any) => station.name.toLowerCase() === (item.kitchenStation || "grill"))) throw new Error(`Missing kitchen station for ${item.name}`);
    if (!Number.isFinite(Number(item.price)) || Number(item.price) < 0) throw new Error(`Invalid menu price for ${item.name}`);
  }
  for (const modifier of data.modifiers) if (!names("menuItems").has(modifier.menuItemName)) throw new Error(`Missing menu item for modifier ${modifier.name}`);
  for (const table of data.tables) if (!names("floors").has(seedTableFloor(data, table)) || !names("sections").has(table.section)) throw new Error(`Missing floor or section for table ${table.tableNumber}`);
  if (!data.paymentMethods.length || data.paymentMethods.some((method: any) => !["Cash", "Credit Card", "Mobile Payment"].includes(method.name))) throw new Error("Setup requires at least one supported payment method");
}

export async function requestSeedRecord(client: Pick<GraphQLClient, "request">, mutation: string, variables: { data: any }) {
  const entity = mutation.match(/\bcreate(StoreSettings|MenuCategory|MenuItem|MenuItemModifier|PaymentProvider|KitchenStation|Floor|Section|Table)\s*\(/)?.[1];
  if (!entity) throw new Error("Unsupported setup mutation");
  const result: any = await client.request(`mutation EnsureRestaurantSetup($entity: String!, $data: JSON!) { ensureRestaurantOnboardingRecord(entity: $entity, data: $data) }`, { entity, data: variables.data });
  const record = result?.ensureRestaurantOnboardingRecord;
  if (!record?.id) throw new Error(`${entity} setup did not return a persisted record`);
  return { [`create${entity}`]: record };
}

export async function runSeedPhases(start: () => Promise<{ success: boolean; error?: string }>, phases: Array<() => Promise<unknown>>, complete: () => Promise<{ success: boolean; error?: string }>) {
  const started = await start();
  if (!started.success) throw new Error(started.error || "Could not record setup progress");
  for (const phase of phases) await phase();
  const completed = await complete();
  if (!completed.success) throw new Error(completed.error || "Could not complete setup");
}
