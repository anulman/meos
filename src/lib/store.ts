import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { getConfig } from './config'
import type { Task, Project, Routine, Occurrence } from './contracts'
import type { WeeklyOutcome, PeriodNote } from './planner-contracts'
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}})
async function request(path:string, init?:RequestInit) {
 const {ready}=await import('./mock'); await ready
 const response=await fetch(getConfig().apiBase+path,init)
 if(!response.ok) { const data=await response.json().catch(()=>({})); throw new Error(data.error || `Demo request failed (${response.status})`) }
 return response.json()
}
const json=(method:string,body:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
export const tasksCollection=createCollection(queryCollectionOptions<Task>({
 id:'tasks',queryKey:['tasks'],queryClient,getKey:task=>task.id,
 queryFn:async()=>((await request('/tasks')) as Task[]).map(task=>({...task,projectId:task.projectId,schedule:task.schedule,durationMinutes:task.durationMinutes})),
 onUpdate:async({transaction})=>{for(const mutation of transaction.mutations) await request(`/tasks/${mutation.original.id}`,json('PATCH',mutation.modified))},
}))
export const projectsCollection=createCollection(queryCollectionOptions<Project>({
 id:'projects',queryKey:['projects'],queryClient,getKey:project=>project.id,
 queryFn:()=>request('/projects') as Promise<Project[]>,
 onUpdate:async({transaction})=>{for(const mutation of transaction.mutations) await request(`/projects/${mutation.original.id}`,json('PUT',mutation.modified))},
}))
/** Both UI and future agent clients share these resource operations. */
export async function saveTask(task:Task,isNew=false) {
 const saved=await request(isNew?'/tasks':`/tasks/${task.id}`,json(isNew?'POST':'PUT',task)) as Task
 await queryClient.invalidateQueries({queryKey:['tasks']}); return saved
}
export async function saveProject(project:Project,isNew=false) {
 const saved=await request(isNew?'/projects':`/projects/${project.id}`,json(isNew?'POST':'PUT',project)) as Project
 await queryClient.invalidateQueries({queryKey:['projects']})
 await queryClient.invalidateQueries({queryKey:['tasks']}); return saved
}
function plannerCollection<T extends {id:string}>(name:string) {
 return createCollection(queryCollectionOptions<T>({id:name,queryKey:[name],queryClient,getKey:item=>item.id,queryFn:()=>request('/'+name) as Promise<T[]>}))
}
export const routinesCollection=plannerCollection<Routine>('routines')
export const occurrencesCollection=plannerCollection<Occurrence>('occurrences')
export const outcomesCollection=plannerCollection<WeeklyOutcome>('outcomes')
export const periodNotesCollection=plannerCollection<PeriodNote>('period-notes')
export async function savePlanner<T extends {id:string}>(name:'routines'|'occurrences'|'outcomes'|'period-notes',value:T) {
 const saved=await request(`/${name}/${encodeURIComponent(value.id)}`,json('PUT',value)) as T
 await queryClient.invalidateQueries({queryKey:[name]});return saved
}
export async function removeOutcome(id:string) {
 await request(`/outcomes/${encodeURIComponent(id)}`,{method:'DELETE'})
 await queryClient.invalidateQueries({queryKey:['outcomes']})
}
