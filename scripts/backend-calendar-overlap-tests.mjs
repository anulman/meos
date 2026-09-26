// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';
import {calendarEventOverlaps as overlaps} from '../src/lib/dates.ts';
test('Calendar interval overlap covers overnight, multi-day and exclusive week boundaries in planner timezone',()=>{
 const period={start:'2026-09-28',end:'2026-10-04'},zone='America/Montreal';
 const timed=(start,end)=>({start:{dateTime:start},end:{dateTime:end}});
 assert(overlaps(timed('2026-09-28T03:00:00Z','2026-09-28T05:00:00Z'),period,zone));
 assert(!overlaps(timed('2026-09-28T03:00:00Z','2026-09-28T04:00:00Z'),period,zone));
 assert(!overlaps(timed('2026-10-05T04:00:00Z','2026-10-05T05:00:00Z'),period,zone));
 assert(overlaps({start:{date:'2026-09-26'},end:{date:'2026-09-29'}},period,zone));
 assert(!overlaps({start:{date:'2026-09-26'},end:{date:'2026-09-28'}},period,zone));
 assert(overlaps(timed('2026-09-20T00:00:00Z','2026-10-10T00:00:00Z'),period,zone));
 assert(overlaps(timed('2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'),{start:'2026-11-01',end:'2026-11-01'},zone));
});
