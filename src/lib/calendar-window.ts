// SPDX-License-Identifier: Apache-2.0
import {useQuery} from '@tanstack/react-query'
import {schemas,validateSchema} from '../../backend/contract.mjs'
import type {CalendarCache,CalendarWindow} from './backend/generated'
import {transport} from './backend/session'
import {RepositoryError} from './backend-contracts'
import {queryClient} from './store'
import {getConfig} from './config'
import type {DatePeriod} from './dates'

/** Keyed by period and zone: navigation never presents another period as empty. */
export function calendarWindowOptions(period:DatePeriod,timezone:string){
 const queryKey=['calendar-window',period.start,period.end,timezone]
 return {queryKey,enabled:!getConfig().demo,staleTime:30000,refetchInterval:30000,refetchOnWindowFocus:true,
  // A completed sync between pages restarts this read once, never a mutation.
  retry:(count:number,error:Error)=>count<1&&error instanceof RepositoryError&&error.code==='conflict',retryDelay:0,
  queryFn:async({signal}:{signal:AbortSignal}):Promise<CalendarCache>=>{
   const previous=queryClient.getQueryData<CalendarCache>(queryKey)
   let cursor:string|undefined,sequence=previous?.sequence,cache:CalendarWindow|undefined
   const items:CalendarCache['items']=[]
   do {
    const params=new URLSearchParams({start:period.start,end:period.end,timezone})
    if(cursor)params.set('cursor',cursor)
    if(sequence!==undefined)params.set('sequence',String(sequence))
    const page=await transport.request('/calendar-window?'+params.toString().replace(/\+/g,'%20'),value=>{validateSchema(schemas.CalendarWindow,value);return value as CalendarWindow},{signal})
    if(page.unchanged){if(!previous||cursor)throw Error('Unexpected Calendar version');const {unchanged,nextCursor,...metadata}=page;return {...metadata,items:previous.items}}
    if(cursor&&page.sequence!==sequence)throw Error('Calendar changed while paging')
    items.push(...page.items);sequence=page.sequence;cursor=page.nextCursor;cache=page
    if(items.length>200000)throw Error('Calendar window too large')
   }while(cursor)
   const {unchanged,nextCursor,...metadata}=cache!
   return {...metadata,items}
  }
 }
}
export function useCalendarWindow(period:DatePeriod,timezone:string){return useQuery(calendarWindowOptions(period,timezone))}
