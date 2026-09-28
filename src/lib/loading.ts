// SPDX-License-Identifier: Apache-2.0
import {getConfig} from './config'
import {bindStore,disposeStore,queryClient,resourceOptions} from './store'
import {loadBootstrap,fenceSession,transport} from './backend/session'
import {clearRepository} from './backend/ui-repository'
import {schemas,validateSchema} from '../../backend/contract.mjs'
import type {ContentRevisions,Preferences} from './backend/generated'
import {addDays,dateInZone,dayPeriod,weekPeriod,type DatePeriod} from './dates'
import {calendarWindowOptions} from './calendar-window'
export type SharedPreferences=Preferences&{_revision:number}
type BootstrapState={ready:boolean;error?:string;preferences?:SharedPreferences}
let generation=0,boot:Promise<BootstrapState>|undefined,baseline:ContentRevisions|undefined,refreshing:Promise<void>|undefined
export function endDataSession(){generation++;boot=undefined;baseline=undefined;refreshing=undefined;fenceSession();clearRepository();disposeStore()}
export function establishDataSession():Promise<BootstrapState>{
 if(typeof window==='undefined')return Promise.resolve({ready:false})
 if(boot)return boot
 const current=generation
 boot=(async()=>{
  if(getConfig().demo){bindStore('demo');return {ready:true}}
  try{
   const data=await loadBootstrap();if(current!==generation)throw Error('Session changed')
   bindStore(data.user.id+':'+generation)
   const preferences={...data.preferences.value,_revision:data.preferences.revision}
   queryClient.setQueryData(['preferences'],preferences);baseline=data.revisions
   return {ready:true,preferences}
  }catch(error){if(current===generation)boot=undefined;return {ready:false,error:error instanceof Error?error.message:'Connection unavailable'}}
 })()
 return boot
}
export function sharedPreferences(){return queryClient.getQueryData<SharedPreferences>(['preferences'])}
/** One owner-scoped coordinator. Initial observation is a baseline, not a change. */
export function refreshRevisions():Promise<void>{
 if(refreshing)return refreshing
 const pending=refreshChangedResources();refreshing=pending;void pending.finally(()=>{if(refreshing===pending)refreshing=undefined}).catch(()=>{});return pending
}
async function refreshChangedResources(){
 if(getConfig().demo||!baseline)return
 const current=generation,client=queryClient
 const next=await client.fetchQuery({queryKey:['content-revisions'],staleTime:0,queryFn:({signal})=>transport.request('/revisions',value=>{validateSchema(schemas.ContentRevisions,value);return value as ContentRevisions},{signal})})
 if(current!==generation||!baseline)return
 const previous=baseline
 await Promise.all(Object.entries(next).filter(([kind,revision])=>revision>(previous[kind as keyof ContentRevisions]??0)).map(async([kind,revision])=>{
  await client.invalidateQueries({queryKey:[kind==='periodNotes'?'period-notes':kind]},{throwOnError:true})
  if(current===generation&&baseline===previous)baseline[kind as keyof ContentRevisions]=revision
 }))
}
export function routePeriod(search:{week?:'this'|'next';day?:string}={}):DatePeriod{
 const prefs=sharedPreferences()??{timezone:getConfig().timezone,weekStartsOn:1}
 const today=dateInZone(Date.now(),prefs.timezone)
 const week=weekPeriod(search.week==='next'?addDays(today,7):today,prefs.weekStartsOn as 0|1)
 return search.day&&search.day>=week.start&&search.day<=week.end?dayPeriod(search.day):week
}
/** Start reads without turning missing optional regions into a route-wide barrier. */
export function startRouteReads(route:'today'|'week'|'settings',search:{week?:'this'|'next';day?:string}={}){
 const names=route==='settings'?['tasks','projects','routines','occurrences']:route==='week'?['tasks','projects','routines','occurrences','outcomes','period-notes']:['tasks','projects','routines','occurrences','period-notes']
 for(const name of names)void queryClient.prefetchQuery(resourceOptions(name))
 if(getConfig().demo)return
 const prefs=sharedPreferences();if(!prefs)return
 const period=route==='today'?dayPeriod(dateInZone(Date.now(),prefs.timezone)):routePeriod(search)
 if(route==='today'||route==='week')void queryClient.prefetchQuery(calendarWindowOptions(period,prefs.timezone))
}
