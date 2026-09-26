import assert from 'node:assert/strict'
import {matchesTimezone,timezoneChoices,timezoneNow,validTimezone} from '../src/lib/timezones.ts'
for(const q of ['Montreal','Montréal','Toronto','America/Toronto']) assert.ok(matchesTimezone('America/Toronto',q))
assert.ok(matchesTimezone('America/New_York','New York'))
assert.ok(timezoneChoices().includes('America/Toronto'));assert.ok(timezoneChoices().includes('UTC'))
for(const zone of ['Not/A_Zone','+04:00','UTC+4','',undefined]) assert.equal(validTimezone(zone),false)
for(const zone of ['America/Toronto','Asia/Kathmandu','UTC']) assert.equal(validTimezone(zone),true)
assert.deepEqual(timezoneNow('America/Toronto',Date.parse('2026-01-15T12:00:00Z')),{offset:'UTC-05:00',time:'07:00'})
assert.deepEqual(timezoneNow('America/Toronto',Date.parse('2026-07-15T12:00:00Z')),{offset:'UTC-04:00',time:'08:00'})
assert.deepEqual(timezoneNow('Asia/Kathmandu',Date.parse('2026-07-15T12:00:00Z')),{offset:'UTC+05:45',time:'17:45'})
console.log('PASS timezone search, invalid/offset rejection, IANA list, winter/summer DST and fractional offset/current local time')
