import assert from "node:assert/strict";
import test from "node:test";
import ensureOnboardingRecord, { validateOnboardingInput } from "../features/keystone/mutations/ensureOnboardingRecord";
import { validateRestaurantSeed, requestSeedRecord, runSeedPhases } from "../features/platform/onboarding/utils/seedRecords";
import { getSeedForTemplate } from "../features/platform/onboarding/utils/dataUtils";
import { findSavedSettingsMismatches } from "../features/platform/onboarding/utils/setupReadiness";
import { StoreSettings } from "../features/keystone/models/StoreSettings";
import seed from "../features/platform/onboarding/lib/seed.json";

const owner = { itemId: "owner", listKey: "User", data: { isActive: true, role: { canManageOnboarding: true, canManageProducts: true, canManageSettings: true, canManageTables: true, canManageKitchen: true, canManagePayments: true } } };
function databaseContext() {
  const records = new Map<string, any[]>();
  let sequence = 0;
  let conflicts = 0;
  let queue = Promise.resolve();
  const listModels: Record<string, string> = {
    StoreSettings: "storeSettings",
    MenuCategory: "menuCategory",
    MenuItem: "menuItem",
    MenuItemModifier: "menuItemModifier",
    PaymentProvider: "paymentProvider",
    KitchenStation: "kitchenStation",
    Floor: "floor",
    Section: "section",
    Table: "table",
  };
  const db: any = {};
  const matches = (row: any, where: any) => Object.entries(where || {}).every(([field, filter]: [string, any]) => {
    if (["category", "menuItem", "floor", "section"].includes(field) && filter?.id?.equals !== undefined) {
      return row[`${field}Id`] === filter.id.equals;
    }
    const expected = filter && typeof filter === "object" && "equals" in filter ? filter.equals : filter;
    return field === "id" ? String(row.id) === String(expected) : row[field] === expected;
  });
  for (const [listName, model] of Object.entries(listModels)) {
    records.set(model, []);
    db[listName] = {
      findOne: async ({ where }: any) => records.get(model)!.find(row => String(row.id) === String(where.id)) || null,
      findMany: async ({ where }: any) => records.get(model)!.filter(row => matches(row, where)),
      createOne: async ({ data }: any) => {
        const record: any = { ...data, id: listName === "StoreSettings" ? 1 : `saved${++sequence}` };
        for (const field of ["category", "menuItem", "floor", "section"]) if (data[field]) record[`${field}Id`] = data[field].connect.id;
        records.get(model)!.push(record);
        return record;
      },
    };
  }
  const tx = { db };
  const context: any = { session: owner, transaction: async (callback: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    if (conflicts > 0) { conflicts--; throw Object.assign(new Error("serialization conflict"), { code: "P2034" }); }
    // Test concurrency deterministically without opening any database.
    const previous = queue;
    let release!: () => void;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await callback(tx); } finally { release(); }
  } };
  return { context, records, setConflicts: (n: number) => { conflicts = n; } };
}

test("full and minimal built-in seeds have complete dependencies; bad custom seeds fail before writes", () => {
  for (const template of ["full", "minimal"] as const) assert.doesNotThrow(() => validateRestaurantSeed(getSeedForTemplate(template, seed)));
  const invalid = structuredClone(seed);
  invalid.menuItems[0].category = "missing";
  assert.throws(() => validateRestaurantSeed(invalid), /Missing category/);
  assert.throws(() => validateRestaurantSeed({ ...seed, paymentMethods: [] }), /payment method/);
  assert.throws(() => validateRestaurantSeed({ ...seed, categories: [...seed.categories, seed.categories[0]] }), /duplicate/);
  const withoutExplicitZone = structuredClone(seed);
  withoutExplicitZone.storeInfo.deliveryEnabled = true;
  withoutExplicitZone.storeInfo.deliveryPostalCodes = [];
  assert.throws(() => validateRestaurantSeed(withoutExplicitZone), /explicit delivery postal code/);
});

test("setup rejects unauthorized callers and unrelated or transactional models", async () => {
  const { context, records } = databaseContext();
  context.session = undefined;
  await assert.rejects(ensureOnboardingRecord(null, { entity: "MenuCategory", data: { name: "Burgers" } }, context), /authorized/);
  context.session = { ...owner, data: { isActive: true, role: { canManageOnboarding: true } } };
  await assert.rejects(ensureOnboardingRecord(null, { entity: "MenuCategory", data: { name: "Burgers" } }, context), /domain permission/);
  context.session = owner;
  await assert.rejects(ensureOnboardingRecord(null, { entity: "Payment", data: { amount: 100 } }, context), /Invalid/);
  assert.equal(records.get("menuCategory")!.length, 0);
  assert.throws(() => validateOnboardingInput("Table", { tableNumber: "1", capacity: 4, status: "occupied" }), /Unsupported/);
});

test("serializable retry and concurrent setup requests reuse persisted records without changing owner data", async () => {
  const { context, records, setConflicts } = databaseContext();
  setConflicts(2);
  const payload = { entity: "MenuCategory", data: { name: "Burgers", sortOrder: 7, mealPeriods: ["all_day"] } };
  const [first, second] = await Promise.all([ensureOnboardingRecord(null, payload, context), ensureOnboardingRecord(null, payload, context)]);
  assert.equal(first.id, second.id);
  assert.equal(records.get("menuCategory")!.length, 1);
  const again = await ensureOnboardingRecord(null, { ...payload, data: { ...payload.data, sortOrder: 99 } }, context);
  assert.equal(again.reused, true);
  assert.equal(records.get("menuCategory")![0].sortOrder, 7);
});

test("dependency validation rejects missing parents and conflicting existing child ownership", async () => {
  const { context, records } = databaseContext();
  const input = { name: "Burger", price: 1000, kitchenStation: "grill", category: { connect: { id: "missing" } }, menuItemImages: { create: [{ imagePath: "/images/burger.jpeg", altText: "Burger" }] } };
  await assert.rejects(ensureOnboardingRecord(null, { entity: "MenuItem", data: input }, context), /dependency/);
  const category = await ensureOnboardingRecord(null, { entity: "MenuCategory", data: { name: "Burgers" } }, context);
  input.category.connect.id = category.id;
  const item = await ensureOnboardingRecord(null, { entity: "MenuItem", data: input }, context);
  const other = await ensureOnboardingRecord(null, { entity: "MenuCategory", data: { name: "Other" } }, context);
  input.category.connect.id = other.id;
  await assert.rejects(ensureOnboardingRecord(null, { entity: "MenuItem", data: input }, context), /different category/);
  assert.equal(records.get("menuItem")![0].id, item.id);
  assert.equal(records.get("menuItem")!.length, 1);
});

test("onboarding StoreSettings boundary requires explicit validated delivery configuration and reads back saved values", async () => {
  assert.throws(() => validateOnboardingInput("StoreSettings", { name: "Cafe", countryCode: "US" }), /explicitly submitted/);
  assert.throws(() => validateOnboardingInput("StoreSettings", { name: "Cafe", countryCode: "US", deliveryPostalCodes: ["11201/999"] }), /alphanumeric/);
  assert.throws(() => validateOnboardingInput("StoreSettings", { name: "Cafe", countryCode: "US", deliveryPostalCodes: [11201] }), /alphanumeric/);
  const validated = validateOnboardingInput("StoreSettings", { name: "Cafe", countryCode: "us", deliveryEnabled: true, deliveryPostalCodes: [" 11201 ", "11201"] });
  assert.deepEqual(validated.data.deliveryPostalCodes, ["11201"]);
  assert.equal(validated.data.countryCode, "US");
  assert.equal("id" in validated.data, false);

  const { context } = databaseContext();
  const saved = await ensureOnboardingRecord(null, { entity: "StoreSettings", data: { name: "Cafe", countryCode: "US", deliveryEnabled: true, deliveryPostalCodes: ["11201"] } }, context);
  assert.deepEqual(saved.settingsReview.deliveryPostalCodes, ["11201"]);
  assert.equal(saved.settingsReview.deliveryEnabled, true);
  const reused = await ensureOnboardingRecord(null, { entity: "StoreSettings", data: { name: "Cafe", countryCode: "US", deliveryEnabled: true, deliveryPostalCodes: ["10001"] } }, context);
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.settingsReview.deliveryPostalCodes, ["11201"]);
  assert.deepEqual(findSavedSettingsMismatches({ deliveryPostalCodes: ["10001"] }, reused.settingsReview), ["deliveryPostalCodes"]);

  const hooks = (StoreSettings as any).hooks;
  const createErrors: string[] = [];
  hooks.validate.create({
    inputData: { name: "Cafe", deliveryEnabled: true },
    resolvedData: { name: "Cafe", deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: ["11201"] },
    addValidationError: (message: string) => createErrors.push(message),
  });
  assert.match(createErrors.join(" "), /explicitly submitted country and postal allowlist/);
  const malformedCreateErrors: string[] = [];
  hooks.validate.create({
    inputData: { name: "Cafe", countryCode: "US", deliveryEnabled: true, deliveryPostalCodes: [11201] },
    resolvedData: { name: "Cafe", deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: ["11201"] },
    addValidationError: (message: string) => malformedCreateErrors.push(message),
  });
  assert.match(malformedCreateErrors.join(" "), /alphanumeric/);
  const pickupOnlyDefaults = hooks.resolveInput.create({
    inputData: { name: "Cafe" },
    resolvedData: { name: "Cafe", deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: ["11201"] },
  });
  assert.equal(pickupOnlyDefaults.deliveryEnabled, false);
  assert.deepEqual(pickupOnlyDefaults.deliveryPostalCodes, []);
  const normalized = hooks.resolveInput.create({
    inputData: { deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: [" 11201 ", "11201"] },
    resolvedData: { deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: [" 11201 ", "11201"] },
  });
  assert.equal(normalized.deliveryEnabled, true);
  assert.deepEqual(normalized.deliveryPostalCodes, ["11201"]);
  const updateErrors: string[] = [];
  hooks.validate.update({
    item: { deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: ["11201"] },
    resolvedData: { deliveryPostalCodes: [] },
    addValidationError: (message: string) => updateErrors.push(message),
  });
  assert.match(updateErrors.join(" "), /explicit delivery postal code/);
});

test("setup input boundary preserves safety while Keystone write hooks stay in the transaction", () => {
  assert.throws(() => validateOnboardingInput("StoreSettings", { name: "Cafe", deliveryEnabled: false, logoIcon: "<script>alert(1)</script>" }), /safe SVG/);
  assert.throws(() => validateOnboardingInput("MenuItem", { name: "Burger", price: -1 }), /price/);
  assert.throws(() => validateOnboardingInput("PaymentProvider", { name: "Provider", code: "pp_x", createPaymentFunction: "https://attacker.example" }), /registered/);
  assert.throws(() => validateOnboardingInput("MenuItemModifier", { name: "Extra", modifierGroup: "addons", minSelections: 2, maxSelections: 1 }), /selection/);
});

test("onboarding never completes after denied start, failed dependency or failed completion acknowledgement", async () => {
  let phases = 0;
  let completed = 0;
  const complete = async () => { completed++; return { success: true }; };
  await assert.rejects(runSeedPhases(async () => ({ success: false, error: "Denied" }), [async () => { phases++; }], complete), /Denied/);
  assert.equal(phases, 0);
  await assert.rejects(runSeedPhases(async () => ({ success: true }), [async () => { phases++; }, async () => { throw new Error("menu failed"); }, async () => { phases++; }], complete), /menu failed/);
  assert.equal(phases, 1);
  assert.equal(completed, 0);
  await assert.rejects(runSeedPhases(async () => ({ success: true }), [], async () => ({ success: false, error: "status failed" })), /status failed/);
});

test("seed transport accepts only acknowledged records and resume survives failed response after persistence", async () => {
  const { context, records } = databaseContext();
  let failResponse = true;
  const client: any = { request: async (_query: string, variables: any) => {
    const record = await ensureOnboardingRecord(null, variables, context);
    if (failResponse) { failResponse = false; throw new Error("connection lost after commit"); }
    return { ensureRestaurantOnboardingRecord: record };
  } };
  const mutation = "mutation { createMenuCategory(data: $data) { id name } }";
  await assert.rejects(requestSeedRecord(client, mutation, { data: { name: "Burgers" } }), /connection lost/);
  const response = await requestSeedRecord(client, mutation, { data: { name: "Burgers" } });
  assert.equal(response.createMenuCategory.reused, true);
  assert.equal(records.get("menuCategory")!.length, 1);
  await assert.rejects(requestSeedRecord({ request: async () => ({}) } as any, mutation, { data: { name: "Burgers" } }), /persisted/);
});

test("setup uses Keystone's singleton record key", async () => {
  const { context, records } = databaseContext();
  const input = { entity: "StoreSettings", data: { name: "Cafe", deliveryEnabled: false, timezone: "America/New_York", currencyCode: "USD" } };
  const first = await ensureOnboardingRecord(null, input, context);
  assert.equal(first.id, 1);
  assert.equal((await ensureOnboardingRecord(null, input, context)).reused, true);
  assert.equal(records.get("storeSettings")!.length, 1);
});
