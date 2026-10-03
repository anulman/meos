// SPDX-License-Identifier: Apache-2.0
import {QueryObserver,onlineManager} from '@tanstack/react-query'
import {queryClient} from './store'
import {loadSession,session} from './backend/session'

const keys=['tasks','projects','routines','occurrences','outcomes','period-notes','preferences','calendar-window']
let stopCurrent=()=>{}
export function stopLiveSync(){stopCurrent()}
/** Notifications contain no records. Query remains the authoritative read/retry layer. */
export function startLiveSync(onUnavailable:(unavailable:boolean)=>void){
 stopCurrent()
 const client=queryClient,owner=session?.user.id,pending=new Set<string>()
 let stopped=false,source:EventSource|undefined,verifySession=false,opened=Promise.resolve(),rejectConnection=(_error:Error)=>{}
 const alive=()=>!stopped&&session?.user.id===owner
 const observer=new QueryObserver(client,{
  queryKey:['live-sync'],staleTime:Infinity,gcTime:0,retry:true,
  retryDelay:attempt=>Math.min(1000*2**attempt,30000),refetchOnWindowFocus:false,
  queryFn:async({signal})=>{
   while(alive()&&!signal.aborted&&(pending.size||verifySession)){
    if(verifySession){
     verifySession=false
     try{
      const current=await loadSession()
      if(!current){window.dispatchEvent(new Event('meos-session-ended'));throw Error('Session unavailable')}
     }catch(error){verifySession=true;throw error}
     if(alive()&&source?.readyState===EventSource.CLOSED){connect();await opened}
    }
    const batch=[...pending];pending.clear()
    // An event during a read stays pending for a trailing read. Failed reads are
    // retried by Query, without another polling loop or a lost acknowledgement.
    const results=await Promise.allSettled(batch.map(async key=>{await client.cancelQueries({queryKey:[key]});if(alive()&&!signal.aborted)await client.invalidateQueries({queryKey:[key]},{throwOnError:true})}))
    results.forEach((result,index)=>{if(result.status==='rejected')pending.add(batch[index])})
    if(results.some(result=>result.status==='rejected'))throw Error('Updates unavailable')
   }
   return 0
  }
 })
 const unsubscribe=observer.subscribe(result=>{if(alive())onUnavailable(result.failureCount>0||source?.readyState!==EventSource.OPEN)})
 function refresh(kind?:string){
  if(!alive())return
  for(const key of kind&&keys.includes(kind)?[kind]:keys)pending.add(key)
  void observer.refetch({cancelRefetch:false})
 }
 function connect(){
  if(!alive())return
  source?.close();source=new EventSource('/api/meos/v1/changes')
  opened=new Promise<void>((resolve,reject)=>{
   rejectConnection=reject
   source!.onopen=()=>{resolve();if(alive()){onUnavailable(false);refresh()}}
   source!.onerror=()=>{reject(Error('Connection unavailable'));if(alive()){onUnavailable(true);verifySession=true;refresh()}}
  })
  void opened.catch(()=>{})
  source.onmessage=event=>{
   if(!alive())return
   try{
    const message=JSON.parse(event.data),row=message.Insert??message.Update??message.Delete
    refresh(row?.kind==='periodNotes'?'period-notes':row?.kind)
   }catch{refresh()}
  }
 }
 const online=onlineManager.subscribe(connected=>{if(connected&&alive()){verifySession=true;refresh()}})
 const stop=()=>{if(stopped)return;stopped=true;source?.close();rejectConnection(Error('Session ended'));online();unsubscribe();observer.destroy();client.removeQueries({queryKey:['live-sync'],exact:true});pending.clear()}
 stopCurrent=stop
 connect()
 return {stop,refresh}
}
