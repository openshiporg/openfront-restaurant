import type { DayHours } from "./store-data";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function parseDayHours(value: string | DayHours | undefined): DayHours | null {
  if (!value) return null;
  if (typeof value === "object") {
    if (value.ranges?.length) return { ...value, enabled: value.enabled ?? true };
    if (value.open && value.close) return { enabled: value.enabled ?? true, ranges: [{ open: value.open, close: value.close }] };
    return value.enabled === false ? { enabled: false, ranges: [] } : null;
  }
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "closed") return { enabled: false, ranges: [] };
  const [open, close] = normalized.split(/\s*[-–]\s*/);
  if (!open || !close) return null;
  return { enabled: true, ranges: [{ open: open.trim(), close: close.trim() }] };
}

function parseClockTime(value: string) {
  const normalized = value.trim().toLowerCase();
  const twelveHour = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (twelveHour[3] === "pm" && hour < 12) hour += 12;
    if (twelveHour[3] === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }
  const twentyFourHour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** Format a venue's wall-clock service time; it is not an instant in the host or viewer timezone. */
export function formatVenueWallClockTime(value: string, locale = "en-US") {
  const parsed = parseClockTime(value);
  if (!parsed) return value;
  const anchor = new Date(Date.UTC(2000, 0, 1, parsed.hour, parsed.minute));
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(anchor);
  } catch {
    return value;
  }
}

export function getWeeklyHoursDisplay(hours: unknown, locale = "en-US") {
  const schedule = hours && typeof hours === "object" && !Array.isArray(hours)
    ? hours as Record<string, string | DayHours | undefined>
    : undefined;
  return DAY_ORDER.map((day) => {
    const parsed = parseDayHours(schedule?.[day]);
    const label = day.charAt(0).toUpperCase() + day.slice(1, 3);
    if (!parsed || parsed.enabled === false || !parsed.ranges?.length) return { day: label, value: "Closed" };
    const ranges = parsed.ranges.map((range) => `${formatVenueWallClockTime(range.open, locale)} – ${formatVenueWallClockTime(range.close, locale)}`);
    return { day: label, value: ranges.join(" · ") };
  });
}
