import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { getConfig } from './config'
import type { Task, Project, Routine, Occurrence } from './contracts'
import type { WeeklyOutcome, PeriodNote } from './planner-contracts'

async function request(path:string, init?:RequestInit) {
 if(!getConfig().demo){const {realRequest}=await import('./backend/ui-repository');return realRequest(path,init)}
 const {ready}=await import('./mock');await ready
 const response=await fetch(getConfig().apiBase+path,init)
 if(!response.ok)throw new Error(`Demo request failed (${response.status})`)
 return response.json()
}
const json=(method:string,body:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
/** Loaders and DB observers share exactly the same Query entry and freshness budget. */
export const resourceOptions=(name:string)=>({queryKey:[name],staleTime:30_000,queryFn:({signal}:{signal:AbortSignal})=>request('/'+name,{signal}) as Promise<any[]>})
function createStore(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,staleTime:30_000}}})
 const planner=<T extends {id:string}>(name:string)=>createCollection(queryCollectionOptions<T>({id:name,...resourceOptions(name),queryClient:client,getKey:item=>item.id}))
 return {queryClient:client,
 tasksCollection:createCollection(queryCollectionOptions<Task>({id:'tasks',...resourceOptions('tasks'),queryClient:client,getKey:item=>item.id,onUpdate:async({transaction})=>{for(const m of transaction.mutations)await request(`/tasks/${m.original.id}`,json('PATCH',{...m.modified,_revision:(m.original as any)._revision}))}})),
 projectsCollection:createCollection(queryCollectionOptions<Project>({id:'projects',...resourceOptions('projects'),queryClient:client,getKey:item=>item.id,onUpdate:async({transaction})=>{for(const m of transaction.mutations)await request(`/projects/${m.original.id}`,json('PUT',{...m.modified,_revision:(m.original as any)._revision}))}})),
 routinesCollection:planner<Routine>('routines'),occurrencesCollection:planner<Occurrence>('occurrences'),outcomesCollection:planner<WeeklyOutcome>('outcomes'),periodNotesCollection:planner<PeriodNote>('period-notes')}
}
// The initial registry is empty. No private query starts before bootstrap binds an owner.
let registry=createStore(),owner:string|undefined
export let {queryClient,tasksCollection,projectsCollection,routinesCollection,occurrencesCollection,outcomesCollection,periodNotesCollection}=registry
export function bindStore(identity:string){
 if(owner===identity)return
 disposeStore();owner=identity;registry=createStore()
 ;({queryClient,tasksCollection,projectsCollection,routinesCollection,occurrencesCollection,outcomesCollection,periodNotesCollection}=registry)
}
export function disposeStore(){
 owner=undefined;void registry.queryClient.cancelQueries();registry.queryClient.clear()
 for(const [key,value]of Object.entries(registry))if(key!=='queryClient')void (value as typeof tasksCollection).cleanup()
}
export async function saveTask(task:Task,isNew=false){const saved=await request(isNew?'/tasks':`/tasks/${task.id}`,json(isNew?'POST':'PUT',task)) as Task;await queryClient.invalidateQueries({queryKey:['tasks']});return saved}
export async function saveProject(project:Project,isNew=false){const saved=await request(isNew?'/projects':`/projects/${project.id}`,json(isNew?'POST':'PUT',project)) as Project;await Promise.all(['projects','tasks'].map(name=>queryClient.invalidateQueries({queryKey:[name]})));return saved}
export async function savePlanner<T extends {id:string}>(name:'routines'|'occurrences'|'outcomes'|'period-notes',value:T){const saved=await request(`/${name}/${encodeURIComponent(value.id)}`,json('PUT',value)) as T;await queryClient.invalidateQueries({queryKey:[name]});return saved}
export async function removeOutcome(id:string){await request(`/outcomes/${encodeURIComponent(id)}`,{method:'DELETE'});await queryClient.invalidateQueries({queryKey:['outcomes']})}
