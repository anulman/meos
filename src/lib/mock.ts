import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { getConfig } from './config'
import type { Task, Project } from './contracts'
const config = getConfig()
const today = new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export const projects: Project[] = [{id:'a05a6d7e-83e0-4cba-ae9f-cb994b4fbabb',title:'A greener balcony',notes:{type:'doc'}}]
let tasks: Task[] = ['Choose herbs for the balcony','Take a quiet afternoon walk','Sketch a weekend breakfast'].map((title,i)=>({id:['0dd996fc-092d-4dbb-bac1-165e0d559c44','0dd996fc-092d-4dbb-bac1-165e0d559c45','0dd996fc-092d-4dbb-bac1-165e0d559c46'][i],title,completed:false,priority:i===0?'high':'none',schedule:{date:today,time:i===0?'10:00':undefined,timezone:config.timezone},projectId:i===0?projects[0].id:undefined,notes:{type:'doc'}}))
const worker=setupWorker(
 http.get(`${config.apiBase}/tasks`,()=>HttpResponse.json(tasks)),
 http.patch(`${config.apiBase}/tasks/:id`,async({params,request})=>{
  const task=tasks.find(t=>t.id===params.id)
  if(!task) return HttpResponse.json({error:'Task not found'},{status:404})
  const patch=await request.json() as Partial<Task>
  if(typeof patch.completed!=='boolean') return HttpResponse.json({error:'Expected completion boolean'},{status:400})
  tasks=tasks.map(t=>t.id===task.id?{...t,completed:patch.completed!}:t)
  return HttpResponse.json(tasks.find(t=>t.id===task.id))
 }),
)
export const ready = worker.start({quiet:true,onUnhandledRequest:'bypass'})
