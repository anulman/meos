import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { getConfig } from './config'
import type { Task } from './contracts'
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}})
async function request(path:string, init?:RequestInit) {
 const response=await fetch(getConfig().apiBase+path,init)
 if(!response.ok) throw new Error(`Demo request failed (${response.status})`)
 return response.json()
}
export const tasksCollection=createCollection(queryCollectionOptions<Task>({
 id:'tasks',queryKey:['tasks'],queryClient,getKey:task=>task.id,
 queryFn:async()=>{ const {ready}=await import('./mock'); await ready; return request('/tasks') as Promise<Task[]> },
 onUpdate:async({transaction})=>{for(const mutation of transaction.mutations) await request(`/tasks/${mutation.original.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:mutation.modified.completed})})},
}))
