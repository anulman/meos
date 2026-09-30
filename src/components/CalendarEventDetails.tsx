// SPDX-License-Identifier: Apache-2.0
import {useEffect,useId,useRef} from 'react'
import {addDays} from '../lib/dates'

export type CalendarDetailEvent={id:string;role:'primary'|'managed';summary:string;location:string;description:string;start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string};linked?:boolean;recurring:boolean;selfResponseStatus?:'accepted'|'declined'|'tentative'|'needsAction'|'unknown'}

/** Date-only values are calendar dates, not UTC instants. Provider ends are exclusive. */
export function calendarDetailTime(event:CalendarDetailEvent,timezone:string):string {
 if(event.start?.date){
  const start=event.start.date
  const last=event.end?.date&&event.end.date>start?addDays(event.end.date,-1):start
  return `All day · ${start}${last>start?` – ${last}`:''}`
 }
 const format=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):null
 const start=format(event.start?.dateTime),end=format(event.end?.dateTime)
 return `${start??'Start time unavailable'}${end?` – ${end}`:''} (${timezone})`
}

/** Render provider text as text; only explicit HTTP(S) URLs become navigable. */
function CalendarText({text}:{text:string}){
 return <>{text.split(/(https?:\/\/[^\s<>"']+)/g).map((part,i)=>/^https?:\/\//.test(part)?<a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>:part)}</>
}
export function CalendarEventDetails({event,timezone,onClose,onEdit}:{event:CalendarDetailEvent;timezone:string;onClose:()=>void;onEdit?:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),title=useId(),backdrop=useRef(false)
 useEffect(()=>{const trigger=document.activeElement as HTMLElement|null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(trigger?.isConnected)trigger.focus()}},[])
 function outside(event:React.MouseEvent<HTMLDialogElement>){const r=event.currentTarget.getBoundingClientRect();return event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)}
 const editable=event.role==='managed'&&!event.linked&&!!event.start?.dateTime&&!!onEdit
 // Close on click, not pointer-up: a subsequent touch compatibility click must not hit the page underneath.
 return <dialog ref={ref} className="resource-dialog calendar-detail-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();onClose()}} onPointerDown={e=>{backdrop.current=outside(e)}} onPointerUp={e=>{backdrop.current=backdrop.current&&outside(e)}} onClick={e=>{const dismiss=backdrop.current&&outside(e);backdrop.current=false;if(dismiss)onClose()}} onPointerCancel={()=>{backdrop.current=false}}>
  <div className="resource-top"><h2 id={title}>{event.summary||'Untitled event'}</h2><button type="button" className="quiet-action" onClick={onClose} aria-label="Close event details">Close ×</button></div>
  <div className="resource-body">
   <p>{calendarDetailTime(event,timezone)}</p>
   {event.selfResponseStatus&&event.selfResponseStatus!=='unknown'&&<p>Your response: {{accepted:'Accepted',declined:'Declined — not attending',tentative:'Tentative',needsAction:'Not responded'}[event.selfResponseStatus]}</p>}
   {event.location?.trim()&&<section><h3>Location</h3><p className="calendar-detail-text"><CalendarText text={event.location}/></p></section>}
   {event.description?.trim()&&<section><h3>Description</h3><p className="calendar-detail-text"><CalendarText text={event.description}/></p></section>}
  </div>
  {editable&&<div className="resource-actions"><button type="button" className="quiet-button" onClick={onEdit}>Edit calendar event</button></div>}
 </dialog>
}
