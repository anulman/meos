// SPDX-License-Identifier: Apache-2.0
import {useRef,useState} from 'react'
import type {Routine} from '../lib/contracts'
import type {Operations} from '../lib/backend/generated'
import {application} from '../lib/backend/session'
import {RepositoryError} from '../lib/backend-contracts'
import {queryClient} from '../lib/store'
import {addDays,dateInZone} from '../lib/dates'
type Plan=Operations['plan_routines']['input']
export function RoutinePlanning({routines}:{routines:Routine[]}){
 const retained=queryClient.getQueryData<Plan>(['pending-routine-plan'])
 const [open,setOpen]=useState(!!retained),[selected,setSelected]=useState<string[]>(retained?.routines.map(r=>r.routineId)??[]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(!!retained)
 const pending=useRef<Plan|null>(retained??null)
 const eligible=routines.filter(r=>!r.archived&&(!r.recurrenceIntent||r.recurrenceIntent.kind==='fixed'))
 async function plan(){
  const client=queryClient
  setBusy(true);setMessage('')
  try{
   if(!pending.current){
    if(!selected.length||selected.length>100)throw Error('Select between 1 and 100 routines.')
    const now=Date.now()
    pending.current={idempotencyKey:crypto.randomUUID(),routines:selected.map(id=>{
     const routine=eligible.find(r=>r.id===id);if(!routine)throw Error('A selected routine changed. Reopen planning.')
     const start=dateInZone(now,routine.timezone),end=addDays(start,14)
     return {routineId:id,expectedRevision:(routine as Routine&{_revision:number})._revision,period:{start,end},ids:Object.fromEntries(Array.from({length:15},(_,i)=>[addDays(start,i),crypto.randomUUID()]))}
    })}
   }
   client.setQueryDefaults(['pending-routine-plan'],{gcTime:Infinity})
   client.setQueryData(['pending-routine-plan'],pending.current)
   const result=await application.call('plan_routines',pending.current)
   client.removeQueries({queryKey:['pending-routine-plan']});pending.current=null;setUncertain(false);setMessage(`Planned ${result.routines} routines: ${result.created} instances created; ${result.preserved} existing instances kept.`)
   await client.invalidateQueries({queryKey:['occurrences']})
  }catch(error){
   const retry=error instanceof RepositoryError&&['unavailable','aborted','invalid_response'].includes(error.code)
   if(!retry){pending.current=null;client.removeQueries({queryKey:['pending-routine-plan']})}
   setUncertain(retry);setMessage(retry?'Planning may have completed. Retry the same request to retrieve its receipt.':error instanceof Error?error.message:'Planning failed.')
   if(error instanceof RepositoryError&&error.code==='conflict')void client.invalidateQueries({queryKey:['routines']})
  }finally{setBusy(false)}
 }
 return <section className="settings-card"><h3>Plan routine instances</h3><p>Planning creates fixed routine instances once, from today through 14 days ahead in each routine’s timezone. Existing instances—including edits and skips—stay unchanged. Browsing does not create instances.</p>{!open?<button onClick={()=>{setOpen(true);setSelected(eligible.slice(0,100).map(r=>r.id))}}>Choose routines to plan</button>:<><fieldset disabled={busy||uncertain}><legend>Routines for this planning operation (maximum 100)</legend>{eligible.map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/>{r.title} · {r.timezone}</label>)}{eligible.length>100&&<p>Select up to 100 routines; the remaining routines are not included automatically.</p>}</fieldset><button disabled={busy||!selected.length||selected.length>100} onClick={()=>void plan()}>{busy?'Planning…':uncertain?'Retry same planning request':'Plan selected routines'}</button></>}{message&&<p role="status">{message}</p>}</section>
}
