import { getUniqueDeliveryPostalCodes } from "../../../lib/delivery-zones";

const NUMERIC_FIELDS = new Set(["deliveryFee", "deliveryMinimum", "pickupDiscount", "taxRate", "rating", "reviewCount"]);

function comparable(value: any, field: string): any {
  if (value === undefined || value === null) return value;
  if (field === "deliveryPostalCodes") return getUniqueDeliveryPostalCodes(value).sort();
  if (NUMERIC_FIELDS.has(field)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : String(value);
  }
  if (Array.isArray(value)) return value.map((entry) => comparable(entry, ""));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key], key)]));
  }
  return value;
}

/** Compares requested setup values with the values actually returned by the persistence boundary. */
export function findSavedSettingsMismatches(requested: Record<string, unknown>, saved: Record<string, unknown> | null | undefined) {
  return Object.keys(requested).filter((field) =>
    JSON.stringify(comparable(requested[field], field)) !== JSON.stringify(comparable(saved?.[field], field))
  );
}
