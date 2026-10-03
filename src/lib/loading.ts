// SPDX-License-Identifier: Apache-2.0
import {getConfig} from './config'
import {bindStore,disposeStore,queryClient,resourceOptions} from './store'
import {loadBootstrap,fenceSession} from './backend/session'
import {clearRepository} from './backend/ui-repository'
import {stopLiveSync} from './live-sync'
import type {Preferences} from './backend/generated'
import {addDays,dateInZone,dayPeriod,weekPeriod,type DatePeriod} from './dates'
import {calendarWindowOptions} from './calendar-window'
export type SharedPreferences=Preferences&{_revision:number}
type BootstrapState={ready:boolean;error?:string;preferences?:SharedPreferences}
let generation=0,boot:Promise<BootstrapState>|undefined
export function endDataSession(){stopLiveSync();generation++;boot=undefined;fenceSession();clearRepository();disposeStore()}
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
   queryClient.setQueryData(['preferences'],preferences)
   return {ready:true,preferences}
  }catch(error){if(current===generation)boot=undefined;return {ready:false,error:error instanceof Error?error.message:'Connection unavailable'}}
 })()
 return boot
}
export function sharedPreferences(){return queryClient.getQueryData<SharedPreferences>(['preferences'])}
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
