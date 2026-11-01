import { dayRanges, venueClock } from "./restaurant-hours";

const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function offsetMinutes(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000;
}

/** The instant at which the venue's wall clock reads `date` (YYYY-MM-DD) + `minutes` after midnight. */
export function venueWallClockToInstant(date: string, minutes: number, timezone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Invalid date");
  const naive = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, minutes);
  let guess = new Date(naive - offsetMinutes(new Date(naive), timezone) * 60000);
  guess = new Date(naive - offsetMinutes(guess, timezone) * 60000);
  return guess;
}

/** YYYY-MM-DD of an instant on the venue's calendar. */
export function venueDateString(instant: Date, timezone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export type ReservationSlot = { time: string; startsAt: string; tables: number };

/**
 * Bookable start times for one venue day: every `step` minutes inside opening
 * ranges, leaving room for the stay, with at least one table free for the party.
 */
export function reservationSlots(input: {
  date: string;
  hours: unknown;
  timezone: string;
  partySize: number;
  duration: number;
  tables: Array<{ id: string; capacity: number; status?: string | null }>;
  reservations: Array<{ assignedTableId: string | null; reservationDate: Date | string; duration?: number | null }>;
  now?: Date;
  leadMinutes?: number;
  step?: number;
}): ReservationSlot[] {
  const { date, hours, timezone, partySize, duration } = input;
  const now = input.now ?? new Date();
  const lead = input.leadMinutes ?? 30;
  const step = input.step ?? 30;
  const schedule = hours && typeof hours === "object" ? (hours as Record<string, unknown>) : {};
  const ranges = dayRanges(schedule[weekdayOf(date)]);
  const fits = input.tables.filter((t) => t.capacity >= partySize);
  const slots: ReservationSlot[] = [];
  const seen = new Set<number>();
  for (const range of ranges) {
    const close = range.close > range.open ? range.close : range.close + 1440;
    for (let minute = Math.ceil(range.open / step) * step; minute + duration <= close; minute += step) {
      if (seen.has(minute)) continue;
      seen.add(minute);
      const start = venueWallClockToInstant(date, minute, timezone);
      if (start.getTime() < now.getTime() + lead * 60000) continue;
      const end = start.getTime() + duration * 60000;
      const free = fits.filter((table) => {
        if (table.status === "occupied" && start.getTime() < now.getTime() + duration * 60000) return false;
        return !input.reservations.some((r) => {
          if (r.assignedTableId !== table.id) return false;
          const rs = new Date(r.reservationDate).getTime();
          return start.getTime() < rs + Number(r.duration || 90) * 60000 && rs < end;
        });
      });
      if (free.length) {
        const h = Math.floor((minute % 1440) / 60), m = minute % 60;
        slots.push({ time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, startsAt: start.toISOString(), tables: free.length });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Smallest free table that seats the party for the interval, or null. */
export function pickTable(
  tables: Array<{ id: string; capacity: number }>,
  reservations: Array<{ assignedTableId: string | null; reservationDate: Date | string; duration?: number | null }>,
  start: Date,
  duration: number,
  partySize: number,
) {
  const end = start.getTime() + duration * 60000;
  return tables
    .filter((t) => t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity)
    .find((t) => !reservations.some((r) => {
      if (r.assignedTableId !== t.id) return false;
      const rs = new Date(r.reservationDate).getTime();
      return start.getTime() < rs + Number(r.duration || 90) * 60000 && rs < end;
    })) ?? null;
}

export function reservationCode(id: string) {
  return id.slice(-8).toUpperCase();
}

export { venueClock };
