import { GraphQLError } from 'graphql';

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function clockMinutes(value: unknown): number | null {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]); const minute = Number(m[2]);
  if (minute > 59 || (m[3] ? h < 1 || h > 12 : h > 23)) return null;
  if (m[3]) h = h % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return h * 60 + minute;
}
export function dayRanges(value: any): { open: number; close: number }[] {
  if (!value || value.enabled === false) return [];
  const ranges = typeof value === 'string' ? [(() => { const [open, close] = value.split(/\s*[-–]\s*/); return { open, close }; })()] : value.ranges || (value.open ? [value] : []);
  return ranges.map((r: any) => ({ open: clockMinutes(r.open), close: clockMinutes(r.close) })).filter((r: any) => r.open !== null && r.close !== null && r.open !== r.close);
}
export function venueClock(now: Date, timezone = 'UTC') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return { day: parts.weekday.toLowerCase(), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function orderingWindow(hours: any, timezone: string, now = new Date(), leadMinutes = 0) {
  const { day, minute } = venueClock(now, timezone);
  const previous = days[(days.indexOf(day) + 6) % 7];
  const today = dayRanges(hours?.[day]).some(r => minute >= r.open && minute + leadMinutes < (r.close > r.open ? r.close : r.close + 1440));
  const overnight = dayRanges(hours?.[previous]).some(r => r.close < r.open && minute + leadMinutes < r.close);
  return today || overnight;
}
export function mealAvailable(periods: unknown, hours: any, timezone: string, now = new Date()) {
  if (!Array.isArray(periods) || !periods.length || periods.includes('all_day')) return true;
  const { minute } = venueClock(now, timezone);
  // Service periods are merchant-defined; never guess breakfast/lunch/dinner hours.
  const windows = hours?._ordering?.mealPeriods;
  if (!windows) return true;
  return periods.some(p => dayRanges(windows[p]).some(r => r.close > r.open ? minute >= r.open && minute < r.close : minute >= r.open || minute < r.close));
}
/** Search actual instants, not host-local dates, so DST gaps and repeats remain correct. */
export function nextOrderingOpening(hours: any, timezone: string, now: Date, leadMinutes = 0): Date | null {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Math.floor(now.getTime() / 60000) * 60000 + 60000;
  for (let offset = 0; offset < 8 * 1440; offset++) {
    const instant = new Date(start + offset * 60000);
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    if (dayRanges(hours?.[parts.weekday.toLowerCase()]).some(r => r.open === minute) && orderingWindow(hours, timezone, instant, leadMinutes)) return instant;
  }
  return null;
}

export type OrderingOptions = {
  /** A chosen order-ahead time: menu service periods are checked at that time, not now. */
  at?: Date | null;
  /** Building a basket while closed is allowed when a later time can still be chosen. */
  allowLater?: boolean;
  /** Whether any order-ahead time exists (computed by the caller to keep this module dependency-free). */
  hasLaterSlot?: boolean;
};

export function assertOrderingAvailable(settings: any, item?: any, now = new Date(), options: OrderingOptions = {}) {
  if (!settings?.timezone || !settings?.hours) throw new Error('Restaurant ordering schedule is not configured');
  const lead = Number(settings.hours._ordering?.cutoffMinutes || 0);
  if (!Number.isInteger(lead) || lead < 0 || lead > 240) throw new Error('Invalid ordering cutoff configuration');
  const at = options.at ? new Date(options.at) : null;
  const openNow = orderingWindow(settings.hours, settings.timezone, now, lead);
  if (!at && !openNow && !(options.allowLater && options.hasLaterSlot)) {
    const opensAt = nextOrderingOpening(settings.hours, settings.timezone, now, lead);
    const localTime = opensAt && new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(opensAt);
    const later = options.hasLaterSlot ? ' Choose a later pickup time to order ahead.' : '';
    throw new GraphQLError(`${settings.name?.trim() || 'The restaurant'} is closed right now.${localTime ? ` Ordering opens at ${localTime}.` : ''}${later}`, {
      extensions: { code: 'RESTAURANT_CLOSED', ...(opensAt ? { opensAt: opensAt.toISOString() } : {}) },
    });
  }
  const serviceTime = at || (openNow ? now : null);
  if (item && serviceTime && (!mealAvailable(item.mealPeriods, settings.hours, settings.timezone, serviceTime) || !mealAvailable(item.category?.mealPeriods, settings.hours, settings.timezone, serviceTime))) {
    throw new GraphQLError(at ? `${item.name || 'This item'} is not served at the time you chose.` : 'This item is outside its menu service period.', { extensions: { code: 'OUTSIDE_SERVICE_PERIOD' } });
  }
}
