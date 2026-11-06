// Order ahead: pickup/delivery times a guest (or the POS) can choose, the way Toast and Square
// offer them — from the next opening, inside store hours, after the kitchen's prep time, through
// the end of tomorrow in the restaurant's time zone. The kitchen is fired at (time − prep).
import { orderingWindow } from "./restaurant-hours";

export const SLOT_MINUTES = 15;

/** "15-20 min" → 20, "45 min" → 45, "1 hr" → 60. The upper bound is the promise the kitchen keeps. */
export function prepLeadMinutes(estimate: unknown, fallback: number) {
  const text = String(estimate || "").toLowerCase();
  const numbers = (text.match(/\d+/g) || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!numbers.length) return fallback;
  const value = Math.max(...numbers);
  const minutes = /h(ou)?r/.test(text) ? value * 60 : value;
  return Math.min(240, Math.max(5, minutes));
}

export function leadForOrderType(settings: any, orderType?: string | null) {
  return orderType === "delivery"
    ? prepLeadMinutes(settings?.estimatedDelivery, 45)
    : prepLeadMinutes(settings?.estimatedPickup, 20);
}

function safeZone(timeZone?: string | null) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
      return timeZone;
    }
  } catch {
    // An invalid saved zone falls back to UTC, as the ordering window does.
  }
  return "UTC";
}

function dayKey(at: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The kitchen works on a scheduled order from `at − lead` until `at`; both must be inside one open window. */
export function slotIsServiceable(hours: any, timeZone: string, at: Date, leadMinutes: number) {
  return orderingWindow(hours, timeZone, new Date(at.getTime() - leadMinutes * 60_000), leadMinutes);
}

/** Every choosable time from now through the end of tomorrow (store time), earliest first. */
export function orderAheadSlots(hours: any, timeZone: string | null | undefined, leadMinutes: number, now = new Date()) {
  const zone = safeZone(timeZone);
  if (!hours) return [] as Date[];
  const step = SLOT_MINUTES * 60_000;
  const lastDay = dayKey(new Date(now.getTime() + 86_400_000), zone);
  const earliest = now.getTime() + leadMinutes * 60_000;
  const slots: Date[] = [];
  for (let at = Math.ceil(earliest / step) * step; at - now.getTime() <= 50 * 3_600_000; at += step) {
    const candidate = new Date(at);
    if (dayKey(candidate, zone) > lastDay) break;
    if (slotIsServiceable(hours, zone, candidate, leadMinutes)) slots.push(candidate);
  }
  return slots;
}

export type ScheduleCheck = { ok: true; fireAt: Date } | { ok: false; message: string };

/** Server rule for a chosen time: on the slot grid, serviceable, not in the past, within the horizon. */
export function checkScheduledTime(settings: any, orderType: string | null | undefined, value: unknown, now = new Date()): ScheduleCheck {
  const at = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(at.getTime())) return { ok: false, message: "Choose a valid pickup time." };
  const lead = leadForOrderType(settings, orderType);
  const slots = orderAheadSlots(settings?.hours, settings?.timezone, lead, now);
  if (!slots.some((slot) => slot.getTime() === at.getTime())) {
    return { ok: false, message: "That time is no longer available. Choose another time." };
  }
  return { ok: true, fireAt: new Date(at.getTime() - lead * 60_000) };
}

/** "Today", "Tomorrow" or "Sat, Nov 7" for grouping, in store time. */
export function slotDayLabel(at: Date, timeZone: string | null | undefined, now = new Date()) {
  const zone = safeZone(timeZone);
  const key = dayKey(at, zone);
  if (key === dayKey(now, zone)) return "Today";
  if (key === dayKey(new Date(now.getTime() + 86_400_000), zone)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(at);
}

export function groupSlots(slots: Date[], timeZone: string | null | undefined, now = new Date()) {
  const groups: Array<{ label: string; slots: Date[] }> = [];
  for (const slot of slots) {
    const label = slotDayLabel(slot, timeZone, now);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.slots.push(slot);
    else groups.push({ label, slots: [slot] });
  }
  return groups;
}

export function formatSlotTime(at: Date | string, timeZone: string | null | undefined, locale = "en-US") {
  return new Intl.DateTimeFormat(locale || "en-US", { timeZone: safeZone(timeZone), hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

/** "Today 6:30 PM", "Tomorrow 11:45 AM", "Sat, Nov 7 12:00 PM". */
export function formatScheduled(at: Date | string, timeZone: string | null | undefined, locale = "en-US", now = new Date()) {
  const date = new Date(at);
  return `${slotDayLabel(date, timeZone, now)} ${formatSlotTime(date, timeZone, locale)}`;
}
