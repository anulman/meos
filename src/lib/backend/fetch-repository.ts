// SPDX-License-Identifier: Apache-2.0
import { validatePreferences, validateResource } from '../../../backend/domain.mjs'
import { RepositoryError } from '../backend-contracts'
import type { ListOptions, Page, PeriodNote, Preferences, ReadOptions, Resources, Stored, UpdateOptions, WeatherSnapshot } from '../backend-contracts'
import type { MeosRepository } from '../repository'
import { assertRevision, decodeStored, uuidToBase64 } from './codecs'
import { JsonTransport } from './transport'
import { decodeWeather } from './weather-codec'

const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new RepositoryError('invalid_response','Expected an object')
 return value as Record<string,unknown>
}
const id=(value:string)=>{uuidToBase64(value);return value}
/** Same adapter for production and real-backend acceptance; no environment-specific implementation. */
export class FetchMeosRepository implements MeosRepository {
 private readonly http:JsonTransport
 constructor(http:JsonTransport){this.http=http}
 list<K extends keyof Resources>(resource:K,options:ListOptions={}):Promise<Page<Resources[K]>> {
  const query=new URLSearchParams()
  if(options.cursor!==undefined)query.set('cursor',id(options.cursor))
  if(options.limit!==undefined){if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>250)throw new RepositoryError('validation','Invalid page size');query.set('limit',String(options.limit))}
  return this.http.request(`/resources/${resource}${query.size?'?'+query:''}`,raw=>{
   const data=object(raw)
   if(!Array.isArray(data.items)||data.nextCursor!==undefined&&typeof data.nextCursor!=='string')throw new RepositoryError('invalid_response','Invalid page')
   const items=data.items.map(item=>decodeStored(item,value=>validateResource(resource,value)))
   const ids=items.map(item=>item.value.id)
   if(new Set(ids).size!==ids.length)throw new RepositoryError('invalid_response','Duplicate page record')
   if(data.nextCursor!==undefined){try{id(data.nextCursor as string)}catch{throw new RepositoryError('invalid_response','Invalid cursor')}}
   return {items,...(data.nextCursor===undefined?{}:{nextCursor:data.nextCursor as string})}
  },{signal:options.signal})
 }
 get<K extends keyof Resources>(resource:K,recordId:string,options:ReadOptions={}):Promise<Stored<Resources[K]>> {
  return this.http.request(`/resources/${resource}/${id(recordId)}`,raw=>decodeStored(raw,value=>validateResource(resource,value)),{signal:options.signal})
 }
 create<K extends keyof Resources>(resource:K,value:Resources[K],options:ReadOptions={}):Promise<Stored<Resources[K]>> {
  return this.http.request(`/resources/${resource}`,raw=>decodeStored(raw,value=>validateResource(resource,value)),{method:'POST',body:{value},signal:options.signal})
 }
 update<K extends keyof Resources>(resource:K,value:Resources[K],options:UpdateOptions):Promise<Stored<Resources[K]>> {
  assertRevision(options.expectedRevision)
  return this.http.request(`/resources/${resource}/${id(value.id)}`,raw=>decodeStored(raw,value=>validateResource(resource,value)),{method:'PUT',body:{value,expectedRevision:options.expectedRevision},signal:options.signal})
 }
 archiveProject(recordId:string,options:UpdateOptions):Promise<{project:Stored<Resources['projects']>;affectedTaskIds:string[]}> {
  assertRevision(options.expectedRevision)
  return this.http.request(`/commands/archive-project/${id(recordId)}`,raw=>{
   const data=object(raw)
   if(!Array.isArray(data.affectedTaskIds)||data.affectedTaskIds.some(value=>typeof value!=='string'))throw new RepositoryError('invalid_response','Invalid affected tasks')
   for(const value of data.affectedTaskIds)id(value)
   return {project:decodeStored(data.project,value=>validateResource('projects',value)),affectedTaskIds:data.affectedTaskIds as string[]}
  },{method:'POST',body:{expectedRevision:options.expectedRevision},signal:options.signal})
 }
 setOccurrenceCompletion(value:Resources['occurrences'],options:UpdateOptions):Promise<Stored<Resources['occurrences']>> {
  assertRevision(options.expectedRevision,true)
  return this.http.request('/commands/occurrence',raw=>decodeStored(raw,value=>validateResource('occurrences',value)),{method:'POST',body:{value,expectedRevision:options.expectedRevision},signal:options.signal})
 }
 savePeriodNote(value:PeriodNote,options:UpdateOptions):Promise<Stored<PeriodNote>> {
  assertRevision(options.expectedRevision,true)
  return this.http.request('/commands/period-note',raw=>decodeStored(raw,value=>validateResource('periodNotes',value)),{method:'POST',body:{value,expectedRevision:options.expectedRevision},signal:options.signal})
 }
 removeOutcome(recordId:string,options:UpdateOptions):Promise<void> {
  assertRevision(options.expectedRevision)
  return this.http.request(`/resources/outcomes/${id(recordId)}?revision=${options.expectedRevision}`,raw=>{if(raw!==null)throw new RepositoryError('invalid_response','Expected empty response')},{method:'DELETE',signal:options.signal})
 }
 getPreferences(options:ReadOptions={}):Promise<Stored<Preferences>> {
  return this.http.request('/preferences',raw=>decodeStored(raw,validatePreferences),{signal:options.signal})
 }
 savePreferences(value:Preferences,options:UpdateOptions):Promise<Stored<Preferences>> {
  assertRevision(options.expectedRevision,true)
  return this.http.request('/preferences',raw=>decodeStored(raw,validatePreferences),{method:'PUT',body:{value,expectedRevision:options.expectedRevision},signal:options.signal})
 }
 getWeather(options:ReadOptions={}):Promise<WeatherSnapshot> {
  return this.http.request('/weather',decodeWeather,{signal:options.signal})
 }
}
