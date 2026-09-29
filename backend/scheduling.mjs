// SPDX-License-Identifier: Apache-2.0
import {DomainError,date,timezone} from './domain.mjs'
import {range,rules} from './timezone-rules.mjs'
const fail=message=>{throw new DomainError('validation',message)}
export const addDays=(day,count)=>new Date(Date.parse(day+'T00:00:00Z')+count*86400000).toISOString().slice(0,10)
export function offsetAt(instant,zone){
 timezone(zone)
 const rows=rules[zone.toLowerCase()]
 if(!rows||instant<range[0]||instant>=range[1])fail('Timezone rules unavailable for date; refresh tzdata')
 let offset=rows[0][1];for(const row of rows){if(row[0]>instant)break;offset=row[1]}return offset
}
export function localDay(instant,zone){return new Date(instant+offsetAt(instant,zone)*60000).toISOString().slice(0,10)}
// Presentation uses the same pinned rules as scheduling, not the host timezone.
export function displayInstant(instant,zone){
 const offsetMinutes=offsetAt(instant,zone),local=new Date(instant+offsetMinutes*60000).toISOString()
 const hour=Number(local.slice(11,13)),time=`${hour%12||12}:${local.slice(14,16)} ${hour<12?'am':'pm'}`
 return {date:local.slice(0,10),time,offsetMinutes}
}
export function scheduledInstant(schedule){
 date(schedule.date);timezone(schedule.timezone)
 if(typeof schedule.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))fail('Scheduled time requires HH:mm')
 const wall=Date.parse(schedule.date+'T'+schedule.time+':00Z'),zone=schedule.timezone.toLowerCase()
 if(!rules[zone])fail('Timezone rules unavailable')
 const candidates=[...new Set(rules[zone].map(row=>row[1]))].map(offset=>({offset,instant:wall-offset*60000})).filter(x=>x.instant>=range[0]&&x.instant<range[1]&&offsetAt(x.instant,zone)===x.offset)
 if(schedule.offsetMinutes!==undefined&&(!Number.isInteger(schedule.offsetMinutes)||!candidates.some(x=>x.offset===schedule.offsetMinutes)))fail('Offset does not match timezone at local datetime')
 const selected=schedule.offsetMinutes===undefined?candidates:candidates.filter(x=>x.offset===schedule.offsetMinutes)
 if(selected.length!==1)fail(selected.length?'Ambiguous daylight-saving time; provide offsetMinutes':'Nonexistent local time or unavailable timezone rules')
 return selected[0].instant
}
export function horizon(day,zone,now){date(day);const today=localDay(now,zone);if(day>addDays(today,14))fail('Routine occurrence exceeds rolling 14-day horizon');return today}
/** Preserve language; broad periods are preferences, never invented hard times. */
export function interpretPreferredTime(text){
 if(typeof text!=='string'||!text.trim()||text.length>500)fail('Preferred time requires 1–500 characters')
 const normalized=text.trim().toLowerCase()
 const periods={'in the morning':'morning','morning':'morning','in the afternoon':'afternoon','afternoon':'afternoon','in the evening':'evening','evening':'evening','at night':'night'}
 if(periods[normalized])return {text,status:'validated',interpretation:{kind:'daypart',value:periods[normalized]}}
 if(['before lunch','after lunch','before breakfast','after breakfast','before dinner','after dinner','before bed'].includes(normalized))return {text,status:'context_required',interpretation:{kind:'relative',value:normalized}}
 const m=normalized.match(/^(?:at )?([01]\d|2[0-3]):([0-5]\d)$/)
 if(m)return {text,status:'validated',interpretation:{kind:'clock',value:m[1]+':'+m[2]}}
 return {text,status:'ambiguous',interpretation:{kind:'unresolved'}}
}
export function interpretRecurrence(text,anchorDate){
 if(typeof text!=='string'||!text.trim()||text.length>500)fail('Recurrence requires 1–500 characters')
 const s=text.trim().toLowerCase();date(anchorDate,'anchorDate')
 const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
 let weekdays=s==='every day'?[0,1,2,3,4,5,6]:s==='every weekday'?[1,2,3,4,5]:undefined,intervalWeeks=1
 const m=s.match(/^every (other )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)
 if(m){weekdays=[names.indexOf(m[2])];intervalWeeks=m[1]?2:1}
 const list=s.startsWith('every ')?s.slice(6).split(',').map(v=>v.trim()):[]
 if(list.length&&list.every(v=>names.includes(v))&&new Set(list).size===list.length)weekdays=list.map(v=>names.indexOf(v)).sort()
 if(weekdays)return {text,status:'validated',kind:'fixed',weekdays,intervalWeeks,anchorDate}
 const f=s.match(/^(one|two|three|four|five|six|seven|[1-7]) times? a week(?:,? preferably on weekdays)?$/)
 if(f)return {text,anchorDate,status:'validated',kind:'flexible',frequency:Number(f[1])||['one','two','three','four','five','six','seven'].indexOf(f[1])+1,period:'week',preferredWeekdays:s.includes('weekdays')?[1,2,3,4,5]:[]}
 return {text,anchorDate,status:'ambiguous',kind:'unresolved'}
}
export function occursOn(routine,day){
 const intent=routine.recurrenceIntent
 if(intent.kind!=='fixed')return false // Flexible targets require explicit planning.
 const weekdays=intent.weekdays,interval=intent.intervalWeeks
 if(!weekdays.includes(new Date(day+'T00:00:00Z').getUTCDay()))return false
 const delta=Math.floor((Date.parse(day+'T00:00:00Z')-Date.parse(intent.anchorDate+'T00:00:00Z'))/86400000)
 return delta>=0&&Math.floor(delta/7)%interval===0
}
