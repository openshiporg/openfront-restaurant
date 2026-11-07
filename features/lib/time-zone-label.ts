/**
 * Human labels for IANA time zones. Never show "America/Los_Angeles" to a person:
 *   timeZoneLabel("America/Los_Angeles")                 -> "Pacific Time (PT)"
 *   timeZoneLabel("America/Los_Angeles", { city: true }) -> "Pacific Time · Los Angeles"
 *   timeZoneLabel("Europe/Berlin")                       -> "Central European Time"
 * Uses Intl's generic names ("Pacific Time", not "Pacific Daylight Time") so the label is
 * the same all year, with a small map for zones where Intl's wording is awkward or missing.
 */

type Names = { long: string; short?: string };

/** Overrides and fallbacks. Intl is used for every zone not listed here. */
const KNOWN: Record<string, Names> = {
  "America/Los_Angeles": { long: "Pacific Time", short: "PT" },
  "America/Vancouver": { long: "Pacific Time", short: "PT" },
  "America/Tijuana": { long: "Pacific Time", short: "PT" },
  "America/Denver": { long: "Mountain Time", short: "MT" },
  "America/Boise": { long: "Mountain Time", short: "MT" },
  "America/Edmonton": { long: "Mountain Time", short: "MT" },
  "America/Phoenix": { long: "Mountain Standard Time", short: "MST" },
  "America/Chicago": { long: "Central Time", short: "CT" },
  "America/Winnipeg": { long: "Central Time", short: "CT" },
  "America/Mexico_City": { long: "Central Time", short: "CT" },
  "America/New_York": { long: "Eastern Time", short: "ET" },
  "America/Detroit": { long: "Eastern Time", short: "ET" },
  "America/Toronto": { long: "Eastern Time", short: "ET" },
  "America/Indiana/Indianapolis": { long: "Eastern Time", short: "ET" },
  "America/Halifax": { long: "Atlantic Time", short: "AT" },
  "America/Anchorage": { long: "Alaska Time", short: "AKT" },
  "Pacific/Honolulu": { long: "Hawaii Time", short: "HT" },
  "Europe/London": { long: "UK Time" },
  "UTC": { long: "Coordinated Universal Time", short: "UTC" },
  "Etc/UTC": { long: "Coordinated Universal Time", short: "UTC" },
  "GMT": { long: "Greenwich Mean Time", short: "GMT" },
  "Etc/GMT": { long: "Greenwich Mean Time", short: "GMT" },
};

function intlName(timeZone: string, style: "longGeneric" | "shortGeneric", locale: string, date: Date) {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return undefined;
  }
}

/** "Los_Angeles" -> "Los Angeles", "Indiana/Indianapolis" -> "Indianapolis". */
export function timeZoneCity(timeZone: string) {
  const last = timeZone.split("/").pop() || timeZone;
  return last.replace(/_/g, " ");
}

/** Short abbreviations only ("PT", "AKT", "GMT"); "Germany Time" or "GMT+1" are not useful in parentheses. */
const isAbbreviation = (value?: string) => Boolean(value && /^[A-Z]{2,5}$/.test(value));
/** Intl answers "GMT+05:30" when it has no name; that's no better than nothing. */
const isOffsetOnly = (value?: string) => !value || /^(GMT|UTC)([+-−]\d|$)/.test(value);

export function timeZoneNames(timeZone: string, locale = "en-US", date = new Date()): Names | null {
  const zone = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!zone) return null;
  const known = KNOWN[zone];
  if (known) return known;
  const long = intlName(zone, "longGeneric", locale, date);
  if (!long || isOffsetOnly(long)) {
    const offset = intlName(zone, "shortGeneric", locale, date) || long;
    return offset ? { long: `${timeZoneCity(zone)} time`, short: offset } : null;
  }
  const short = intlName(zone, "shortGeneric", locale, date);
  return { long, short: isAbbreviation(short) ? short : undefined };
}

export type TimeZoneLabelOptions = {
  locale?: string;
  date?: Date;
  /** "Pacific Time · Los Angeles" instead of "Pacific Time (PT)". */
  city?: boolean;
};

/** A person-readable label for an IANA zone. Falls back to the city name, never the raw id. */
export function timeZoneLabel(timeZone: string | null | undefined, options: TimeZoneLabelOptions = {}) {
  const zone = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!zone) return "";
  const names = timeZoneNames(zone, options.locale, options.date);
  if (!names) return `${timeZoneCity(zone)} time`;
  if (options.city) {
    const city = timeZoneCity(zone);
    return names.long.toLowerCase().includes(city.toLowerCase()) || /^(UTC|GMT)$/i.test(city) ? names.long : `${names.long} · ${city}`;
  }
  return names.short ? `${names.long} (${names.short})` : names.long;
}

/** "Times in Pacific Time (PT)". */
export function timesInLabel(timeZone: string | null | undefined, options: TimeZoneLabelOptions = {}) {
  const label = timeZoneLabel(timeZone, options);
  return label ? `Times in ${label}` : "";
}
