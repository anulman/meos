/** Calendar dates use YYYY-MM-DD (years 0001–9999); weekdays use Sunday = 0. */
export interface DatePeriod { readonly start: string; readonly end: string }
export interface ZonedSchedule { date: string; time?: string; timezone: string }
export interface RoutineSchedule { weekdays: readonly number[]; time?: string; timezone: string }

const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  let result = formatters.get(timezone);
  if (!result) {
    result = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(timezone, result);
  }
  return result;
}
function utc(year: number, month: number, day: number): number {
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(0, 0, 0, 0);
  return result.getTime();
}
export function assertDate(date: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid calendar date: ${date}`);
  const [, y, m, d] = match;
  const actual = new Date(utc(Number(y), Number(m), Number(d)));
  if (Number(y) < 1 || actual.getUTCFullYear() !== Number(y) ||
      actual.getUTCMonth() + 1 !== Number(m) || actual.getUTCDate() !== Number(d)) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
}
function dateNumber(date: string): number {
  assertDate(date);
  const [year, month, day] = date.split('-').map(Number);
  return utc(year, month, day);
}
function calendarString(value: number): string {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999 || !Number.isFinite(value)) throw new RangeError('Date outside supported range');
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function timeNumber(time: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RangeError(`Invalid time: ${time}`);
  const [hour, minute] = time.split(':').map(Number);
  return (hour * 60 + minute) * 60_000;
}
function wallNumber(instant: number, timezone: string): number {
  if (!Number.isFinite(instant)) throw new RangeError('Invalid instant');
  const parts = formatter(timezone).formatToParts(instant);
  const part = (type: string) => Number(parts.find(value => value.type === type)?.value);
  return utc(part('year'), part('month'), part('day')) +
    ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
}

/** Pure calendar arithmetic; never add elapsed hours to a zoned instant. */
export function addDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError('Days must be an integer');
  return calendarString(dateNumber(date) + days * DAY);
}
/** Month arithmetic clamps the day to the destination month's final day. */
export function addMonths(date: string, months: number): string {
  assertDate(date);
  if (!Number.isSafeInteger(months)) throw new RangeError('Months must be an integer');
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(utc(year, month + months, 1));
  const lastDay = new Date(utc(first.getUTCFullYear(), first.getUTCMonth() + 2, 0)).getUTCDate();
  return calendarString(utc(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(day, lastDay)));
}
export function weekday(date: string): number { return new Date(dateNumber(date)).getUTCDay(); }
export function dateInZone(instant: number, timezone: string): string {
  return calendarString(wallNumber(instant, timezone));
}
/** Inclusive bounds, frozen so an open period editor keeps its original identity. */
export function dayPeriod(date: string): DatePeriod {
  assertDate(date);
  return Object.freeze({ start: date, end: date });
}
export function weekPeriod(date: string, weekStartsOn: 0 | 1): DatePeriod {
  if (weekStartsOn !== 0 && weekStartsOn !== 1) throw new RangeError('Week starts on Sunday or Monday');
  const start = addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));
  return Object.freeze({ start, end: addDays(start, 6) });
}
export function periodContains(period: DatePeriod, date: string): boolean {
  assertDate(period.start); assertDate(period.end); assertDate(date);
  if (period.start > period.end) throw new RangeError('Period ends before it starts');
  return date >= period.start && date <= period.end;
}

/**
 * Resolve a routine/schedule's local wall time to epoch milliseconds.
 * DST policy matches Temporal's "compatible": folds choose the earlier instant;
 * gaps shift forward by the offset change (02:30 -> 03:30 for a one-hour gap).
 * This also handles half-hour transitions and whole skipped calendar days.
 */
export function zonedInstant(date: string, time: string, timezone: string): number {
  const wanted = dateNumber(date) + timeNumber(time);
  const offsets = new Set<number>();
  // Probe both sides of a transition, including international date-line jumps.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = wanted + hours * 3_600_000;
    offsets.add(wallNumber(probe, timezone) - probe);
  }
  const candidates = [...offsets].map(offset => wanted - offset);
  const exact = candidates.filter(value => wallNumber(value, timezone) === wanted);
  if (exact.length) return Math.min(...exact);
  const after = candidates.map(instant => ({ instant, wall: wallNumber(instant, timezone) }))
    .filter(value => value.wall > wanted).sort((a, b) => a.wall - b.wall || a.instant - b.instant);
  if (!after.length) throw new RangeError('Unable to resolve local time');
  return after[0].instant;
}
/** All-day schedules preserve their literal date, regardless of display zone. */
export function scheduleDisplayDate(schedule: ZonedSchedule, displayTimezone: string): string {
  assertDate(schedule.date);
  return schedule.time === undefined ? schedule.date :
    dateInZone(zonedInstant(schedule.date, schedule.time, schedule.timezone), displayTimezone);
}
/** Milliseconds until the next display-zone calendar day, including 23/25-hour days. */
export function millisecondsUntilNextDay(now: number, timezone: string): number {
  const tomorrow = addDays(dateInZone(now, timezone), 1);
  return zonedInstant(tomorrow, '00:00', timezone) - now;
}
export function routineOccursOn(routine: RoutineSchedule, routineDate: string): boolean {
  if (routine.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new RangeError('Routine weekdays must be 0–6');
  }
  return routine.weekdays.includes(weekday(routineDate));
}
/**
 * Returns routine-local occurrence dates whose projected dates are in the display
 * period. Persist completion with (routineId, returned date), not the display date.
 * All-day routines use floating dates, just like all-day schedules.
 */
export function routineDatesInPeriod(routine: RoutineSchedule, period: DatePeriod, displayTimezone: string): string[] {
  periodContains(period, period.start);
  let start = period.start;
  let end = period.end;
  if (routine.time !== undefined) {
    start = addDays(dateInZone(zonedInstant(period.start, '00:00', displayTimezone), routine.timezone), -1);
    end = addDays(dateInZone(zonedInstant(addDays(period.end, 1), '00:00', displayTimezone), routine.timezone), 1);
  }
  const dates: string[] = [];
  for (let date = start; ; date = addDays(date, 1)) {
    if (routineOccursOn(routine, date) && periodContains(period,
      scheduleDisplayDate({ date, time: routine.time, timezone: routine.timezone }, displayTimezone))) dates.push(date);
    if (date === end) break;
  }
  return dates;
}

/** Google ends are exclusive; planner period dates are inclusive. */
export function calendarEventOverlaps(event: {start?: {date?: string; dateTime?: string}; end?: {date?: string; dateTime?: string}}, period: DatePeriod, timezone: string): boolean {
  if (event.start?.date && event.end?.date) return event.start.date <= period.end && event.end.date > period.start;
  const start = Date.parse(event.start?.dateTime ?? ''), end = Date.parse(event.end?.dateTime ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return start < zonedInstant(addDays(period.end, 1), '00:00', timezone) && end > zonedInstant(period.start, '00:00', timezone);
}
