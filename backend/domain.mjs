// SPDX-License-Identifier: Apache-2.0
import {schemas,resourceSchemas,validateSchema} from './contract.mjs'
import { isTimezone } from './timezones.mjs'
import {scheduledInstant,interpretPreferredTime,interpretRecurrence} from './scheduling.mjs'
export class DomainError extends Error {
 constructor(code, message, details) { super(message); this.name='DomainError'; this.code=code; this.details=details }
}
const fail = (field,message) => { throw new DomainError('validation',message,{fields:{[field]:message}}) }
const object = (value,field) => { if(!value || typeof value!=='object' || Array.isArray(value)) fail(field,'Expected an object') }
const keys = (value,allowed,field) => {object(value,field);for(const key of Object.keys(value)) if(!allowed.includes(key)) fail(field,`Unexpected field: ${key}`)}
const text = (value,field,max=300) => {if(typeof value!=='string' || !value.trim() || value.length>max)fail(field,`Expected text of 1–${max} characters`);return value.trim()}
const boolean = (value,field) => {if(typeof value!=='boolean')fail(field,'Expected true or false')}
const integer = (value,field,min,max) => {if(!Number.isSafeInteger(value)||value<min||value>max)fail(field,'Expected an integer in range')}
export function uuid(value,field='id') {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))fail(field,'Expected a canonical UUIDv4 or UUIDv7')
 return value
}
export function date(value,field='date') {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))fail(field,'Expected a real calendar date')
 const parsed=new Date(`${value}T00:00:00Z`)
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail(field,'Expected a real calendar date')
 return value
}
export function timezone(value,field='timezone') {
 if(typeof value!=='string'||value.length>100||/^[+-]/.test(value))fail(field,'Expected an IANA timezone')
 if(!isTimezone(value))fail(field,'Expected an IANA timezone')
 return value
}
const time = (value,field='time') => {if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(field,'Expected HH:mm')}
export function period(value,kind) {
 keys(value,['start','end'],'period');date(value.start,'period.start');date(value.end,'period.end')
 if((Date.parse(value.end+'T00:00:00Z')-Date.parse(value.start+'T00:00:00Z'))/86400000!==(kind==='day'?0:6))fail('period','Expected inclusive period boundaries')
}
export function safeUrl(value,field='url') {
 if(typeof value!=='string'||value.length>2048||/\s/.test(value))fail(field,'Expected a safe HTTP(S) URL')
 let parsed;try {parsed=new URL(value)}catch {fail(field,'Expected a safe HTTP(S) URL')}
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)fail(field,'Expected a safe HTTP(S) URL')
 return value
}
/** Matches the basic editor's supported document model; no arbitrary HTML or image fetches. */
export function notes(value) {
 // Reserve <1 KiB and two nodes for the legacy constraint-preservation paragraph.
 const encoded=JSON.stringify(value)
 if(encoded===undefined||encoded.length>101024)fail('notes','Notes exceed the document limit')
 let count=0
 function visit(node,depth,parent) {
  if(++count>5002||depth>32)fail('notes','Notes exceed the structure limit')
  keys(node,['type','content','text','marks','attrs'],'notes')
  if(typeof node.type!=='string')fail('notes','Missing node type')
  const inline=['text','hard_break'];const block=['paragraph','blockquote','heading','code_block','horizontal_rule']
  if(parent===null ? node.type!=='doc' : parent==='doc'||parent==='blockquote' ? !block.includes(node.type) : !inline.includes(node.type))fail('notes','Invalid document nesting')
  if(node.type==='text') {
   if(typeof node.text!=='string'||!node.text.length||node.content!==undefined||node.attrs!==undefined)fail('notes','Invalid text node')
  } else if(node.text!==undefined)fail('notes','Only text nodes have text')
  if(node.attrs!==undefined) {
   if(node.type!=='heading')fail('notes','Unsupported node attributes')
   keys(node.attrs,['level'],'notes');integer(node.attrs.level,'notes',1,6)
  }
  if(node.type==='heading'&&node.attrs===undefined)fail('notes','Heading level required')
  if(node.marks!==undefined) {
   if(node.type!=='text'||!Array.isArray(node.marks)||node.marks.length>4)fail('notes','Invalid marks')
   const seen=new Set()
   for(const mark of node.marks) {
    keys(mark,['type','attrs'],'notes')
    if(!['strong','em','code','link'].includes(mark.type)||seen.has(mark.type))fail('notes','Unsupported or duplicate mark')
    seen.add(mark.type)
    if(mark.type==='link') {keys(mark.attrs,['href','title'],'notes');safeUrl(mark.attrs.href,'notes');if(mark.attrs.title!==undefined&&mark.attrs.title!==null)text(mark.attrs.title,'notes',300)}
    else if(mark.attrs!==undefined)fail('notes','Unexpected mark attributes')
   }
  }
  if(node.content!==undefined) {
   if(!Array.isArray(node.content)||['text','hard_break','horizontal_rule'].includes(node.type))fail('notes','Invalid node children')
   for(const child of node.content)visit(child,depth+1,node.type)
  }
  if(node.type==='blockquote'&&!node.content?.length)fail('notes','Blockquote needs a block')
  if(node.type==='code_block'&&node.content?.some(child=>child.type!=='text'||child.marks?.length))fail('notes','Invalid code block')
 }
 visit(value,0,null)
 return value
}
// Transport values are JSON data; keep cloning independent of browser-only APIs.
function cloneData(value) {
 if(value===null||typeof value!=='object')return value
 if(Array.isArray(value))return value.map(cloneData)
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,cloneData(item)]))
}
const base=['id','title','notes']
const fields={
 projects:[...base,'completed','archived','targetDate','references'],
 tasks:[...base,'type','completed','priority','projectId','schedule','durationMinutes','location','durationIntent','actualDurationMinutes','archived','references','preferredTime'],
 routines:[...base,'timezone','location','durationIntent','archived','preferredTime','recurrenceIntent'],
 occurrences:['id','routineId','date','completed','title','notes','durationMinutes','location','durationIntent','actualDurationMinutes','schedule','preferredTime','skipped','edited','templateRevision'],outcomes:['id','taskId','period','position'],periodNotes:['id','kind','period','notes']
}
export function validateResource(kind,input) {
 if(!fields[kind])fail('resource','Unsupported resource')
 validateSchema(schemas[resourceSchemas[kind]],input)
 keys(input,fields[kind],'resource');uuid(input.id)
 const value=cloneData(input)
 if(kind!=='occurrences'&&base.every(key=>fields[kind].includes(key))){value.title=text(value.title,'title');notes(value.notes)}
 for(const flag of ['completed','archived'])if(value[flag]!==undefined)boolean(value[flag],flag)
 if(value.durationMinutes!==undefined)integer(value.durationMinutes,'durationMinutes',1,1440)
 for(const [k,max]of [['location',1000],['durationIntent',500]])if(value[k]!==undefined&&(typeof value[k]!=='string'||value[k].length>max))fail(k,'Invalid text')
 if(value.actualDurationMinutes!==undefined)integer(value.actualDurationMinutes,'actualDurationMinutes',1,10080)
 if(value.references!==undefined) {
  if(!Array.isArray(value.references)||value.references.length>50)fail('references','Too many references')
  const ids=new Set()
  for(const ref of value.references){keys(ref,['id','label','url'],'references');uuid(ref.id,'references');if(ids.has(ref.id))fail('references','Duplicate reference');ids.add(ref.id);ref.label=text(ref.label,'references');safeUrl(ref.url,'references')}
 }
 if(kind==='projects'&&value.targetDate!==undefined)date(value.targetDate,'targetDate')
 if(['tasks','routines','occurrences'].includes(kind)&&value.preferredTime!==undefined){
  keys(value.preferredTime,['text','status','interpretation'],'preferredTime');value.preferredTime=interpretPreferredTime(value.preferredTime.text)
 }
 if(['tasks','occurrences'].includes(kind)&&value.schedule!==undefined){keys(value.schedule,['date','time','timezone','offsetMinutes'],'schedule');scheduledInstant(value.schedule)}
 if(kind==='tasks') {
  boolean(value.completed,'completed');if(!['none','low','medium','high'].includes(value.priority))fail('priority','Invalid priority')
  if(value.projectId!==undefined)uuid(value.projectId,'projectId')
  if(value.schedule!==undefined){keys(value.schedule,['date','time','timezone','offsetMinutes'],'schedule');date(value.schedule.date);timezone(value.schedule.timezone);time(value.schedule.time,'schedule.time')}
 }
 if(kind==='routines') {
  keys(value.recurrenceIntent,['text','status','kind','weekdays','intervalWeeks','anchorDate','frequency','period','preferredWeekdays'],'recurrenceIntent');value.recurrenceIntent=interpretRecurrence(value.recurrenceIntent.text,value.recurrenceIntent.anchorDate)
  timezone(value.timezone)
 }
 if(kind==='occurrences'){uuid(value.routineId,'routineId');date(value.date);boolean(value.completed,'completed');if(value.title!==undefined)value.title=text(value.title,'title');if(value.notes!==undefined)notes(value.notes);for(const key of ['skipped','edited'])if(value[key]!==undefined)boolean(value[key],key);if(value.templateRevision!==undefined)integer(value.templateRevision,'templateRevision',1,Number.MAX_SAFE_INTEGER)}
 if(kind==='outcomes'){uuid(value.taskId,'taskId');period(value.period,'week');integer(value.position,'position',0,10000)}
 if(kind==='periodNotes'){if(!['day','week'].includes(value.kind))fail('kind','Invalid note kind');period(value.period,value.kind);notes(value.notes)}
 return value
}
export function validatePreferences(input) {
 validateSchema(schemas.Preferences,input)
 keys(input,['timezone','weekStartsOn','weather'],'preferences');timezone(input.timezone);integer(input.weekStartsOn,'weekStartsOn',0,1)
 keys(input.weather,['enabled','source','units','manual'],'weather');boolean(input.weather.enabled,'weather.enabled')
 if(!['latest','manual'].includes(input.weather.source)||!['celsius','fahrenheit'].includes(input.weather.units))fail('weather','Invalid weather preferences')
 if(input.weather.manual!==undefined)coarseLocation(input.weather.manual)
 if(input.weather.enabled&&input.weather.source==='manual'&&!input.weather.manual)fail('weather.manual','Manual location required')
 const result=cloneData(input)
 if(result.weather.manual)result.weather.manual=coarseLocation(result.weather.manual)
 return result
}
export function coarseLocation(input) {
 keys(input,['latitude','longitude','label'],'location')
 for(const [field,max]of [['latitude',90],['longitude',180]])if(!Number.isFinite(input[field])||Math.abs(input[field])>max)fail(field,'Invalid coordinate')
 if(input.label!==undefined)text(input.label,'label',200)
 return {...input,latitude:Math.round(input.latitude*100)/100,longitude:Math.round(input.longitude*100)/100}
}
/** Deterministic storage/retry comparison independent of JSON object key order. */
export function canonical(value) {
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'
}
