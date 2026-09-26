/** Runtime IANA data only; never persist a numeric UTC offset as schedule intent. */
export function validTimezone(value: string): boolean {
  if (typeof value !== 'string' || !(value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value))) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
export function timezoneChoices(selected?: string): string[] {
  return [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(selected && validTimezone(selected) ? [selected] : [])])].sort();
}
export function timezoneCity(zone: string): string {
  if (zone === 'UTC') return 'Coordinated Universal Time';
  const city = zone.split('/').at(-1)!.replaceAll('_', ' ');
  return zone === 'America/Toronto' ? 'Toronto / Montreal' : city;
}
const searchable = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('_', ' ');
export function matchesTimezone(zone: string, query: string): boolean {
  const haystack = searchable(`${timezoneCity(zone)} ${zone}`);
  return searchable(query).trim().split(/\s+/).every(part => haystack.includes(part));
}
/** Offset and wall time are calculated for the same instant, including DST. */
export function timezoneNow(zone: string, now: number): { offset: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { offset: get('timeZoneName').replace('GMT', 'UTC'), time: `${get('hour')}:${get('minute')}` };
}
