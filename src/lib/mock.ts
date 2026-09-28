import { interpretRecurrence } from '../../backend/scheduling.mjs'
import { validTimezone } from './timezones'
import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { getConfig } from './config'
import type { Task, Project, Routine, Occurrence } from './contracts'
import type { WeeklyOutcome, PeriodNote } from './planner-contracts'
import { assertDate, weekPeriod, dateInZone } from './dates'
const config=getConfig()
const today=dateInZone(Date.now(),config.timezone)
export let projects:Project[]=[{id:'a05a6d7e-83e0-4cba-ae9f-cb994b4fbabb',title:'A greener balcony',notes:{type:'doc'}}]
let tasks:Task[]=['Choose herbs for the balcony','Take a quiet afternoon walk','Sketch a weekend breakfast'].map((title,i)=>({id:['0dd996fc-092d-4dbb-bac1-165e0d559c44','0dd996fc-092d-4dbb-bac1-165e0d559c45','0dd996fc-092d-4dbb-bac1-165e0d559c46'][i],title,completed:false,priority:i===0?'high':'none',schedule:{date:today,time:['10:00','14:00','16:30'][i],timezone:config.timezone},projectId:i===0?projects[0].id:undefined,notes:{type:'doc'}}))
tasks.push({id:'0dd996fc-092d-4dbb-bac1-165e0d559c47',title:'Find a frame for the hallway',completed:false,priority:'low',notes:{type:'doc'}})
function validate(value:Task|Project,kind:'tasks'|'projects') {
 if(!value || typeof value.id!=='string' || typeof value.title!=='string' || !value.title.trim()) return 'Give this resource a name.'
 if(!value.notes || value.notes.type!=='doc') return 'Notes must be a document.'
 if(value.references?.some(ref=>{try{return !['https:','http:'].includes(new URL(ref.url).protocol)}catch{return true}})) return 'References must use a valid http or https URL.'
 if(kind==='tasks') {
  const task=value as Task
  if(typeof task.completed!=='boolean' || !['none','low','medium','high'].includes(task.priority)) return 'Invalid task status or priority.'
  if(task.projectId && !projects.some(p=>p.id===task.projectId&&!p.archived)) return 'Choose an active project, or No project.'
  if(task.durationMinutes!==undefined && (!Number.isInteger(task.durationMinutes)||task.durationMinutes<1||task.durationMinutes>1440)) return 'Duration must be between 1 and 1440 minutes.'
  if(task.schedule) {
   if(!validDate(task.schedule.date)||typeof task.schedule.time!=='string'|| !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.schedule.time)) return 'Choose a valid scheduled date and time.'
   if(!validTimezone(task.schedule.timezone))return 'Choose a valid IANA timezone.'
  }
 } else if((value as Project).targetDate && !validDate((value as Project).targetDate!)) return 'Choose a valid target date.'
 return null
}
function validDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date}
const handlers=(['tasks','projects'] as const).flatMap(kind=>[
 http.get(`${config.apiBase}/${kind}`,()=>HttpResponse.json(kind==='tasks'?tasks:projects)),
 http.post(`${config.apiBase}/${kind}`,async({request})=>{
  const value=await request.json() as Task|Project; const error=validate(value,kind)
  if(error)return HttpResponse.json({error},{status:400})
  if((kind==='tasks'?tasks:projects).some(item=>item.id===value.id))return HttpResponse.json({error:'Resource already exists.'},{status:409})
  value.title=value.title.trim()
  if(kind==='tasks')tasks=[...tasks,value as Task];else projects=[...projects,value as Project]
  return HttpResponse.json(value,{status:201})
 }),
 ...(['put','patch'] as const).map(method=>http[method](`${config.apiBase}/${kind}/:id`,async({params,request})=>{
  const old=(kind==='tasks'?tasks:projects).find(item=>item.id===params.id)
  if(!old)return HttpResponse.json({error:'Resource not found.'},{status:404})
  const body=await request.json() as Task|Project
  const value=method==='patch'?{...old,...body,id:old.id}:{...body,id:old.id}
  const error=validate(value,kind);if(error)return HttpResponse.json({error},{status:400})
  value.title=value.title.trim()
  if(kind==='tasks')tasks=tasks.map(item=>item.id===old.id?value as Task:item)
  else {
   projects=projects.map(item=>item.id===old.id?value as Project:item)
   // Archiving a project deliberately detaches its tasks; it never deletes them.
   if(value.archived)tasks=tasks.map(task=>task.projectId===old.id?{...task,projectId:undefined}:task)
  }
  return HttpResponse.json(value)
 }))
])
const seedPeriod=weekPeriod(today,1)
const planner:{routines:Routine[];occurrences:Occurrence[];outcomes:WeeklyOutcome[];'period-notes':PeriodNote[]}={
 routines:[{id:'routine-morning',title:'Morning care',recurrenceIntent:interpretRecurrence('every day',today),timezone:config.timezone,durationIntent:'About 30 minutes',notes:{type:'doc'}},{id:'routine-evening',title:'Evening wind-down',recurrenceIntent:interpretRecurrence('every day',today),timezone:config.timezone,durationIntent:'About 20 minutes',notes:{type:'doc'}}],
 occurrences:[{id:'seed-morning',routineId:'routine-morning',date:today,title:'Morning care',completed:false,schedule:{date:today,time:'08:00',timezone:config.timezone},durationMinutes:30},{id:'seed-evening',routineId:'routine-evening',date:today,title:'Evening wind-down',completed:false,schedule:{date:today,time:'18:00',timezone:config.timezone},durationMinutes:20}],outcomes:[{id:'seed-outcome',taskId:tasks[0].id,period:seedPeriod,position:0}], 'period-notes':[],
}
tasks.push({id:'seed-completed',title:'Water the kitchen plants',completed:true,priority:'none',schedule:{date:today,time:'09:00',timezone:config.timezone},notes:{type:'doc'}})
tasks.push({id:'seed-archived',title:'Put away the summer blanket',completed:false,priority:'none',archived:true,notes:{type:'doc'}})
function plannerError(kind:keyof typeof planner,value:any):string|null {
 if(!value||typeof value.id!=='string'||!value.id)return 'A resource identity is required.'
 try {
  if(kind==='routines') {
   if(typeof value.title!=='string'||!value.title.trim())return 'Give this routine a name.'
   value.recurrenceIntent=interpretRecurrence(value.recurrenceIntent?.text,value.recurrenceIntent?.anchorDate)
   if(!validTimezone(value.timezone))return 'Choose a valid IANA timezone.'
  }
  if(kind==='occurrences') {
   assertDate(value.date)
   if(!planner.routines.some(r=>r.id===value.routineId)||typeof value.completed!=='boolean')return 'Invalid routine occurrence.'
   if(planner.occurrences.some(o=>o.id!==value.id&&o.routineId===value.routineId&&o.date===value.date))return 'Occurrence already exists.'
  }
  if(kind==='outcomes'||kind==='period-notes') {
   assertDate(value.period.start);assertDate(value.period.end)
   if(value.period.end<value.period.start)return 'Invalid period.'
  }
  if(kind==='outcomes') {
   if(!tasks.some(t=>t.id===value.taskId&&!t.archived))return 'Choose an active task.'
   if(!Number.isInteger(value.position)||value.position<0)return 'Invalid outcome order.'
   if(planner.outcomes.some(o=>o.id!==value.id&&o.taskId===value.taskId&&o.period.start===value.period.start&&o.period.end===value.period.end))return 'This task is already an outcome for this week.'
  }
  if(kind==='routines'||kind==='period-notes')if(value.notes?.type!=='doc')return 'Notes must be a document.'
  if(kind==='period-notes') {
   if(!['day','week'].includes(value.kind))return 'Invalid note kind.'
   if(planner['period-notes'].some(n=>n.id!==value.id&&n.kind===value.kind&&n.period.start===value.period.start&&n.period.end===value.period.end))return 'A note already exists for this period.'
  }
 } catch{return 'Choose valid calendar dates and timezone.'}
 return null
}
const plannerHandlers=(['routines','occurrences','outcomes','period-notes'] as const).flatMap(kind=>[
 http.get(`${config.apiBase}/${kind}`,()=>HttpResponse.json(planner[kind])),
 http.put(`${config.apiBase}/${kind}/:id`,async({request,params})=>{
  const value={...await request.json() as object,id:String(params.id)}
  const error=plannerError(kind,value);if(error)return HttpResponse.json({error},{status:400})
  const list=planner[kind] as Array<{id:string}>;const index=list.findIndex(item=>item.id===value.id)
  if(index<0)list.push(value);else list[index]=value
  return HttpResponse.json(value)
 }),
])
plannerHandlers.push(http.delete(`${config.apiBase}/outcomes/:id`,({params})=>{planner.outcomes=planner.outcomes.filter(o=>o.id!==params.id);return HttpResponse.json({ok:true})}))
const worker=setupWorker(...handlers,...plannerHandlers)
export const ready=worker.start({quiet:true,onUnhandledRequest:'bypass'})
