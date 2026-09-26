// SPDX-License-Identifier: Apache-2.0
import {transport,application} from './session'
import {RepositoryError} from '../backend-contracts'
import {addDays,dateInZone} from '../dates'
import type {Occurrence,Routine,Preferences} from './generated'
type Row={id:string;_revision?:number;[key:string]:any}
const archivedProjects=new Map<string,boolean>();const revisions=new Map<string,number>(),pending=new Map<string,string>()
export function clearRepository(){revisions.clear();pending.clear();archivedProjects.clear()}
const unwrap=(envelope:any)=>{if(envelope.value.id)archivedProjects.set(envelope.value.id,!!envelope.value.archived);revisions.set(envelope.value.id??'preferences',envelope.revision);return {...envelope.value,_revision:envelope.revision}}
function value(row:Row){const {_revision,$synced,$origin,$key,$collectionId,...clean}=row;return JSON.parse(JSON.stringify(clean))}
async function operation(name:any,input:any){const intent=JSON.stringify([name,input]);let key=pending.get(intent);if(!key){key=crypto.randomUUID();pending.set(intent,key)}try{const result=await application.call(name,{...input,idempotencyKey:key});pending.delete(intent);return result}catch(error){if(error instanceof RepositoryError&&error.code!=='unavailable'&&error.code!=='aborted'&&error.code!=='invalid_response')pending.delete(intent);throw error}}
async function list(kind:string){const items:Row[]=[];let cursor:string|undefined;do{const page:any=await transport.request('/resources/'+kind+'?limit=250'+(cursor?'&cursor='+cursor:''),x=>x);items.push(...page.items.map(unwrap));cursor=page.nextCursor}while(cursor);return items}
export async function realRequest(path:string,init?:RequestInit):Promise<any>{
 const [name,id]=path.slice(1).split('/');const kind=name==='period-notes'?'periodNotes':name
 const method=init?.method??'GET';if(method==='GET'){if(kind==='occurrences')await materializeRoutines(await list('routines') as Routine[]);return list(kind)}
 if(method==='DELETE'){const revision=revisions.get(id);if(!revision)throw Error('Reload this resource before deleting.');return transport.request(`/resources/${kind}/${id}?revision=${revision}`,x=>x,{method:'DELETE'})}
 const row=JSON.parse(String(init?.body)) as Row;const clean=value(row);const expectedRevision=row._revision??0
 try{
 let result:any
 if(kind==='tasks'&&method==='POST')result=await operation('create_task',{value:clean})
 else if(kind==='routines'&&expectedRevision)result=await operation('update_routine',{value:clean,expectedRevision})
 else if(kind==='occurrences'){
  if(!expectedRevision)throw Error('Reload to fetch this routine instance before editing.')
  result=await operation('complete_occurrence',{id:row.id,completed:row.completed,expectedRevision})
 }else if(kind==='periodNotes')result=await transport.request('/commands/period-note',x=>x,{method:'POST',body:{value:clean,expectedRevision}})
 else if(kind==='projects'&&clean.archived&&expectedRevision&&!archivedProjects.get(row.id)){const response:any=await transport.request('/commands/archive-project/'+id,x=>x,{method:'POST',body:{expectedRevision}});result=response.project}
 else result=await transport.request('/resources/'+kind+(expectedRevision?'/'+row.id:''),x=>x,{method:expectedRevision?'PUT':'POST',body:{value:clean,...(expectedRevision?{expectedRevision}:{})}})
 return unwrap(result)
 }catch(error){if(error instanceof RepositoryError&&error.code==='conflict'){const {queryClient}=await import('../store');await queryClient.invalidateQueries({queryKey:[name]});throw Error('This item changed elsewhere. Your draft is preserved; close and reopen it to compare the latest version before saving.')}throw error}
}
export async function moveOccurrence(row:Occurrence&{_revision?:number},changes:Record<string,unknown>){return unwrap(await operation('move_occurrence',{id:row.id,expectedRevision:row._revision,schedule:row.schedule??null,...changes}))}
export async function materializeRoutines(routines:Routine[]){
 for(const routine of routines){if(routine.archived||routine.recurrenceIntent?.kind==='flexible'||routine.recurrenceIntent?.kind==='unresolved')continue
  const today=dateInZone(Date.now(),routine.timezone),through=addDays(today,14),ids:Record<string,string>={};for(let i=0;i<=14;i++)ids[addDays(today,i)]=crypto.randomUUID()
  await operation('materialize_routine',{routineId:routine.id,through,ids})
 }
}
export async function getPreferences(){return unwrap(await transport.request('/preferences',x=>x)) as Preferences&{_revision:number}}
export async function putPreferences(row:Preferences&{_revision:number}){const {_revision,...clean}=row;return unwrap(await transport.request('/preferences',x=>x,{method:'PUT',body:{value:clean,expectedRevision:_revision}}))}
