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
export function assertOrderingAvailable(settings: any, item?: any, now = new Date()) {
  if (!settings?.timezone || !settings?.hours) throw new Error('Restaurant ordering schedule is not configured');
  const lead = Number(settings.hours._ordering?.cutoffMinutes || 0);
  if (!Number.isInteger(lead) || lead < 0 || lead > 240) throw new Error('Invalid ordering cutoff configuration');
  if (!orderingWindow(settings.hours, settings.timezone, now, lead)) throw new Error('Restaurant is closed for new orders');
  if (item && (!mealAvailable(item.mealPeriods, settings.hours, settings.timezone, now) || !mealAvailable(item.category?.mealPeriods, settings.hours, settings.timezone, now))) throw new Error('This item is outside its menu service period');
}
