// Node 24 runs this dependency-free TypeScript module directly.
import assert from 'node:assert/strict';
import { addDays, addMonths, assertDate, dateInZone, dayPeriod, weekPeriod,
  zonedInstant, scheduleDisplayDate, millisecondsUntilNextDay,
  periodContains } from '../src/lib/dates.ts';

for (const invalid of ['2025-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '0000-01-01', '2024-1-01']) {
  assert.throws(() => assertDate(invalid), RangeError);
}
assertDate('2024-02-29');
assert.equal(addDays('2024-02-28', 1), '2024-02-29');
assert.equal(addDays('2024-02-29', 1), '2024-03-01');
assert.equal(addDays('2025-01-01', -1), '2024-12-31');
assert.equal(addDays('0099-12-31', 1), '0100-01-01');
assert.equal(addDays('1900-02-28', 1), '1900-03-01');
assert.equal(addDays('2000-02-28', 1), '2000-02-29');
assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
assert.equal(addMonths('2025-01-31', -1), '2024-12-31');
assert.throws(() => addDays('9999-12-31', 1), RangeError);
assert.deepEqual(weekPeriod('2025-01-01', 0), { start: '2024-12-29', end: '2025-01-04' });
assert.deepEqual(weekPeriod('2025-01-05', 1), { start: '2024-12-30', end: '2025-01-05' });
assert.ok(Object.isFrozen(weekPeriod('2025-01-01', 1)));
assert.ok(periodContains(dayPeriod('2024-02-29'), '2024-02-29'));
assert.throws(() => periodContains({ start: '2025-02-01', end: '2025-01-01' }, '2025-01-01'), RangeError);

const iso = value => new Date(value).toISOString();
// Published civil-clock transitions: NY jumps at 07:00Z / folds at 06:00Z.
assert.equal(iso(zonedInstant('2024-03-10', '02:30', 'America/New_York')), '2024-03-10T07:30:00.000Z');
assert.equal(iso(zonedInstant('2024-11-03', '01:30', 'America/New_York')), '2024-11-03T05:30:00.000Z');
assert.equal(iso(zonedInstant('2024-10-06', '02:15', 'Australia/Lord_Howe')), '2024-10-05T15:45:00.000Z');
assert.equal(iso(zonedInstant('2024-04-07', '01:45', 'Australia/Lord_Howe')), '2024-04-06T14:45:00.000Z');
assert.equal(iso(zonedInstant('2011-12-30', '12:00', 'Pacific/Apia')), '2011-12-30T22:00:00.000Z');
assert.throws(() => zonedInstant('2024-01-01', '24:00', 'UTC'), RangeError);
assert.throws(() => zonedInstant('2024-01-01', '12:00', 'not/a-zone'), RangeError);
assert.equal(dateInZone(Date.parse('2024-01-01T04:59:59Z'), 'America/New_York'), '2023-12-31');
assert.equal(dateInZone(Date.parse('2024-01-01T05:00:00Z'), 'America/New_York'), '2024-01-01');
assert.equal(millisecondsUntilNextDay(Date.parse('2024-03-10T05:00:00Z'), 'America/New_York'), 23 * 3600000);
assert.equal(millisecondsUntilNextDay(Date.parse('2024-11-03T04:00:00Z'), 'America/New_York'), 25 * 3600000);
assert.equal(millisecondsUntilNextDay(Date.parse('2024-01-01T04:59:59.900Z'), 'America/New_York'), 100);
// Sao Paulo skipped midnight: next day starts at local 01:00, not 00:00.
assert.equal(millisecondsUntilNextDay(Date.parse('2018-11-04T02:59:59Z'), 'America/Sao_Paulo'), 1000);
assert.equal(scheduleDisplayDate({ date: '2024-01-01', timezone: 'Asia/Tokyo' }, 'America/Los_Angeles'), '2024-01-01');
assert.equal(scheduleDisplayDate({ date: '2024-01-01', time: '00:30', timezone: 'Asia/Tokyo' }, 'America/Los_Angeles'), '2023-12-31');

console.log('Date helper checks passed: calendar bounds, DST gaps/folds, display projection, midnight refresh.');
