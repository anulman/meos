import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { getConfig } from './config'
import type { Task, Project } from './contracts'
const config=getConfig()
const today=new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export let projects:Project[]=[{id:'a05a6d7e-83e0-4cba-ae9f-cb994b4fbabb',title:'A greener balcony',notes:{type:'doc'}}]
let tasks:Task[]=['Choose herbs for the balcony','Take a quiet afternoon walk','Sketch a weekend breakfast'].map((title,i)=>({id:['0dd996fc-092d-4dbb-bac1-165e0d559c44','0dd996fc-092d-4dbb-bac1-165e0d559c45','0dd996fc-092d-4dbb-bac1-165e0d559c46'][i],title,completed:false,priority:i===0?'high':'none',schedule:{date:today,time:i===0?'10:00':undefined,timezone:config.timezone},projectId:i===0?projects[0].id:undefined,notes:{type:'doc'}}))
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
   if(!validDate(task.schedule.date)||task.schedule.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.schedule.time)) return 'Choose a valid scheduled date and time.'
   try{new Intl.DateTimeFormat('en',{timeZone:task.schedule.timezone})}catch{return 'Choose a valid timezone.'}
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
const worker=setupWorker(...handlers)
export const ready=worker.start({quiet:true,onUnhandledRequest:'bypass'})
