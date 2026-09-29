import assert from 'node:assert/strict'
import {relativeDay} from '../src/lib/relative-day.ts'
import {dateInZone} from '../src/lib/dates.ts'
for(const [day,today,label] of [
 ['2026-09-28','2026-09-28','Today'],['2026-09-27','2026-09-28','Yesterday'],
 ['2026-09-29','2026-09-28','Tomorrow'],['2026-09-26','2026-09-28','2 days ago'],
 ['2026-09-21','2026-09-28','last week'],['2026-10-05','2026-09-28','next week'],
 ['2026-09-14','2026-09-28','2 weeks ago'],['2026-09-30','2026-09-28','in 2 days'],
 ['2026-03-09','2026-03-08','Tomorrow'],['2026-11-02','2026-11-01','Tomorrow'],
 ['2027-01-01','2026-12-31','Tomorrow'],['2028-02-29','2028-03-01','Yesterday'],
])assert.equal(relativeDay(day,today),label)
const now=Date.parse('2026-03-08T02:30:00Z')
assert.equal(relativeDay('2026-03-08',dateInZone(now,'America/Toronto')),'Tomorrow')
assert.equal(relativeDay('2026-03-08',dateInZone(now,'Asia/Tokyo')),'Today')
console.log('PASS relative calendar days, weeks, timezone boundary, DST, year and leap day')
