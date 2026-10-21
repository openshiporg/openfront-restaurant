import { isSignedIn, permissions } from "../access";
import { sanitizeStoreLogoSvg } from "../utils/storeLogo";
import { normalizeStoreLogoColor } from "../../lib/store-logo";
import { getDeliveryConfigurationError, normalizeCountryCode, normalizeDeliveryPostalCodeList } from "../../lib/delivery-zones";

const SPECS = {
  StoreSettings: { permission: "canManageSettings", fields: "name tagline logoIcon logoColor address phone currencyCode locale timezone countryCode deliveryEnabled deliveryPostalCodes hours deliveryFee deliveryMinimum pickupDiscount taxRate estimatedDelivery estimatedPickup heroHeadline heroSubheadline heroTagline promoBanner rating reviewCount" },
  MenuCategory: { permission: "canManageProducts", fields: "name icon sortOrder mealPeriods" },
  MenuItem: { permission: "canManageProducts", fields: "name price calories available featured popular kitchenStation prepTime mealPeriods category menuItemImages" },
  MenuItemModifier: { permission: "canManageProducts", fields: "name modifierGroup modifierGroupLabel priceAdjustment defaultSelected required minSelections maxSelections menuItem" },
  PaymentProvider: { permission: "canManagePayments", fields: "name code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction" },
  KitchenStation: { permission: "canManageKitchen", fields: "name displayOrder isActive" },
  Floor: { permission: "canManageTables", fields: "name level isActive" },
  Section: { permission: "canManageTables", fields: "name" },
  Table: { permission: "canManageTables", fields: "tableNumber capacity shape positionX positionY floor section" },
} as const;
const RELATIONS: Record<string, Record<string, string>> = { MenuItem: { category: "MenuCategory" }, MenuItemModifier: { menuItem: "MenuItem" }, Table: { floor: "Floor", section: "Section" } };
const INTEGERS = new Set(["price", "priceAdjustment", "minSelections", "maxSelections", "capacity", "calories", "sortOrder", "displayOrder", "prepTime", "level", "reviewCount"]);
const BOOLEANS = new Set(["available", "featured", "popular", "defaultSelected", "required", "isInstalled", "isActive", "deliveryEnabled"]);

export function validateOnboardingInput(entity: string, input: any) {
  const spec = SPECS[entity as keyof typeof SPECS];
  if (!spec || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid setup record");
  const allowed = new Set(spec.fields.split(" "));
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error("Unsupported setup field");
  const data = { ...input };
  const label = entity === "Table" ? data.tableNumber : data.name;
  if (typeof label !== "string" || !label.trim() || label.length > 250) throw new Error("Setup record needs a bounded name or table number");
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) { delete data[key]; continue; }
    if (INTEGERS.has(key) && (!Number.isSafeInteger(value) || (key !== "priceAdjustment" && Number(value) < 0))) throw new Error(`Invalid setup ${key}`);
    if (BOOLEANS.has(key) && typeof value !== "boolean") throw new Error(`Invalid setup ${key}`);
  }
  if (entity === "Table" && (!Number.isSafeInteger(data.capacity) || data.capacity < 1)) throw new Error("Table capacity must be positive");
  if (entity === "Floor" && (!Number.isSafeInteger(data.level) || data.level < 1)) throw new Error("Floor level must be positive");
  if (entity === "MenuItem" && !Number.isSafeInteger(data.price)) throw new Error("Menu price is required");
  if (data.mealPeriods && (!Array.isArray(data.mealPeriods) || data.mealPeriods.some((p: string) => !["all_day", "breakfast", "lunch", "dinner"].includes(p)))) throw new Error("Unknown meal period");
  if (entity === "MenuItem" && !["grill", "fryer", "salad", "bar", "dessert", "prep", "expo"].includes(data.kitchenStation)) throw new Error("Unknown kitchen station");
  if (entity === "MenuItemModifier" && !["size", "temperature", "addons", "removals", "sides", "dressings", "cheese", "toppings", "sauces", "patty", "ice", "dipping"].includes(data.modifierGroup)) throw new Error("Unknown modifier group");
  if (entity === "MenuItemModifier" && (data.minSelections > data.maxSelections || data.maxSelections < 1)) throw new Error("Invalid modifier selection limits");
  if (entity === "Table" && !["round", "square", "rectangle"].includes(data.shape)) throw new Error("Unknown table shape");
  if (entity === "PaymentProvider") {
    if (!/^pp_[A-Za-z0-9_-]+$/.test(data.code || "")) throw new Error("Invalid payment provider code");
    for (const key of spec.fields.split(" ").filter(field => field.endsWith("Function"))) if (!["stripe", "paypal", "manual"].includes(data[key])) throw new Error("Setup accepts registered payment adapters only");
  }
  if (entity === "StoreSettings") {
    if ((data.deliveryEnabled ?? true) && (input.countryCode === undefined || input.deliveryPostalCodes === undefined)) {
      throw new Error("Enabling delivery requires an explicitly submitted country and postal allowlist");
    }
    const deliveryError = getDeliveryConfigurationError({
      deliveryEnabled: data.deliveryEnabled ?? true,
      countryCode: data.countryCode || "US",
      deliveryPostalCodes: input.deliveryPostalCodes,
    });
    if (deliveryError) throw new Error(deliveryError);
    if (data.countryCode !== undefined) data.countryCode = normalizeCountryCode(data.countryCode);
    if (data.deliveryPostalCodes !== undefined) data.deliveryPostalCodes = normalizeDeliveryPostalCodeList(data.deliveryPostalCodes);
    if (data.logoIcon) {
      data.logoIcon = sanitizeStoreLogoSvg(data.logoIcon);
      if (!data.logoIcon) throw new Error("Logo must be a valid safe SVG");
    }
    if (data.logoColor !== undefined) data.logoColor = normalizeStoreLogoColor(data.logoColor);
    new Intl.DateTimeFormat("en", { timeZone: data.timezone || "America/New_York" });
    new Intl.NumberFormat("en", { style: "currency", currency: data.currencyCode || "USD" });
  }
  if (entity === "MenuItem") {
    const images = data.menuItemImages?.create;
    if (!Array.isArray(images) || images.length !== 1 || Object.keys(data.menuItemImages).some(key => key !== "create")) throw new Error("One setup image is required");
    const image = images[0];
    if (!image || typeof image.imagePath !== "string" || !/^\/images\/[\w./-]+$/.test(image.imagePath) || image.imagePath.includes("..") || typeof image.altText !== "string" || Object.keys(image).some(key => !["imagePath", "altText"].includes(key))) throw new Error("Setup image must use a local /images/ path");
  }
  for (const field of Object.keys(RELATIONS[entity] || {})) {
    const relation = data[field];
    if (!relation?.connect?.id || typeof relation.connect.id !== "string" || Object.keys(relation).length !== 1 || Object.keys(relation.connect).length !== 1) throw new Error(`Missing setup dependency: ${field}`);
  }
  return { spec, data };
}

/** Seed-only creation boundary. The allowlist and explicit domain checks constrain
 * setup writes; Keystone's transactional DB API still applies list access and model
 * hooks. Existing records are never overwritten and transactional lists are excluded.
 */
export default async function ensureOnboardingRecord(_root: unknown, { entity, data: input }: { entity: string; data: any }, context: any) {
  if (!isSignedIn({ session: context.session }) || !permissions.canManageOnboarding({ session: context.session })) throw new Error("Not authorized to set up restaurant");
  const { spec, data } = validateOnboardingInput(entity, input);
  if (!(permissions as any)[spec.permission]({ session: context.session })) throw new Error("Missing setup domain permission");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await context.transaction(async (tx: any) => {
        for (const [field, listKey] of Object.entries(RELATIONS[entity] || {})) {
          if (!await tx.db[listKey].findOne({ where: { id: data[field].connect.id } })) throw new Error(`Missing setup dependency: ${field}`);
        }
        const where: any = entity === "StoreSettings"
          ? { id: { equals: "1" } }
          : entity === "PaymentProvider"
            ? { code: { equals: data.code } }
            : entity === "Table"
              ? { tableNumber: { equals: data.tableNumber } }
              : { name: { equals: data.name } };
        if (entity === "MenuItemModifier") Object.assign(where, {
          menuItem: { id: { equals: data.menuItem.connect.id } },
          modifierGroup: { equals: data.modifierGroup },
        });
        const list = tx.db[entity];
        const matches = await list.findMany({ where, take: 2 });
        if (matches.length > 1) throw new Error(`Ambiguous existing ${entity}; resolve duplicate names before retrying`);
        let item = matches[0];
        if (item) {
          for (const field of Object.keys(RELATIONS[entity] || {})) {
            if (item[`${field}Id`] !== data[field].connect.id) throw new Error(`Existing ${entity} has a different ${field}; review it before retrying`);
          }
        } else item = await list.createOne({ data });
        const result: any = { id: item.id, name: item.name || undefined, tableNumber: item.tableNumber || undefined, reused: matches.length === 1 };
        if (entity === "StoreSettings") {
          result.settingsReview = Object.fromEntries(Object.keys(data).map((field) => [field, item[field]]));
        }
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error: any) {
      if (attempt < 3 && ["P2034", "P2002"].includes(error?.code)) continue;
      throw error;
    }
  }
}

export { ensureOnboardingRecord as ensureRestaurantOnboardingRecord };
