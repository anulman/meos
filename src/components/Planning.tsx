import {CalendarAgenda,type CalendarTimelineItem} from './CalendarAgenda'
import {getConfig} from '../lib/config'
import {lazy,Suspense} from 'react'
const OccurrenceEditor=lazy(()=>import('./OccurrenceEditor').then(m=>({default:m.OccurrenceEditor})))
import type {Occurrence} from '../lib/contracts'
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {useLiveQuery} from '@tanstack/react-db'
import {tasksCollection,routinesCollection,occurrencesCollection,outcomesCollection,periodNotesCollection,savePlanner,saveTask} from '../lib/store'
import {usePlannerClock,projectScheduledTasks} from '../lib/planner-clock'
import {type DatePeriod} from '../lib/dates'
import type {Routine,Task} from '../lib/contracts'
import type {PeriodNote} from '../lib/planner-contracts'
import {TimezoneSelect} from './TimezoneSelect'
const NotesEditor=lazy(()=>import('./NotesEditor').then(m=>({default:m.NotesEditor})))
import {TaskRows} from '../components'
import {timelineWithGaps,timelineDuration} from '../lib/timeline'

const PlanningContext=createContext<{next:boolean;setNext:(v:boolean)=>void;openOutcome:()=>void;openPeriodNote:(note:PeriodNote)=>void}>({next:false,setNext:()=>{},openOutcome:()=>{},openPeriodNote:()=>{}})
export const usePlanning=()=>useContext(PlanningContext)
export function PlanningProvider({children}:{children:ReactNode}) {
 const [next,setNext]=useState(false);const [outcomePeriod,setOutcomePeriod]=useState<DatePeriod|null>(null);const [noteDraft,setNoteDraft]=useState<PeriodNote|null>(null);const clock=usePlannerClock()
 return <PlanningContext.Provider value={{next,setNext,openPeriodNote:setNoteDraft,openOutcome:()=>setOutcomePeriod(Object.freeze({...next?clock.nextWeek:clock.thisWeek}))}}>{children}{outcomePeriod&&<OutcomeEditor period={outcomePeriod} onClose={()=>setOutcomePeriod(null)}/ >}{noteDraft&&<PeriodNoteEditor key={noteDraft.id} initial={noteDraft} onClose={()=>setNoteDraft(null)}/>}</PlanningContext.Provider>
}
export function Sheet({title,onClose,dirty=false,note=false,subtitle,children}:{title:string;onClose:()=>void;dirty?:boolean;note?:boolean;subtitle?:string;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);const backdrop=useRef(false);const trigger=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null)
 const close=()=>{if(!dirty||window.confirm('Discard unsaved changes?'))onClose()}
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();trigger.current?.focus()}},[])
 function outside(event:React.PointerEvent<HTMLDialogElement>){const r=event.currentTarget.getBoundingClientRect();return event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)}
 return <dialog ref={ref} className={`resource-dialog${note?' period-note-dialog':''}`} aria-label={title} onCancel={e=>{e.preventDefault();close()}} onPointerDown={e=>{backdrop.current=outside(e)}} onPointerUp={e=>{if(backdrop.current&&outside(e))close();backdrop.current=false}}><div className="resource-top"><div><h2 tabIndex={note?-1:undefined} autoFocus={note}>{title}</h2>{subtitle&&<p className="muted">{subtitle}</p>}</div><button className="quiet-action" onClick={close} aria-label="Close planner details">Close ×</button></div>{children}</dialog>
}
export function PeriodNotesButton({kind,period}:{kind:'day'|'week';period:DatePeriod}) {
 const {data:notes=[],isLoading,isError}=useLiveQuery(q=>q.from({note:periodNotesCollection}));const {openPeriodNote}=usePlanning()
 return <><button className="quiet-action" aria-label={`${kind==='day'?'Day':'Week'} Notes`} disabled={isLoading||isError} onClick={()=>{const existing=notes.find(n=>n.kind===kind&&samePeriod(n.period,period));openPeriodNote(existing?{...existing,period:Object.freeze({...existing.period})}:{id:crypto.randomUUID(),kind,period:Object.freeze({...period}),notes:{type:'doc'}})}}>{kind==='day'?'Notes':'Week Notes'} <span aria-hidden="true">{kind==='day'?'📝':'↗'}</span></button>{isError&&<span role="alert">Notes unavailable</span>}</>
}
function PeriodNoteEditor({initial,onClose}:{initial:PeriodNote;onClose:()=>void}) {
 const [status,setStatus]=useState<'saved'|'saving'|'error'>('saved');const [error,setError]=useState('')
 const draft=useRef(initial.notes),saved=useRef(initial),pending=useRef(false)
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const flight=useRef<Promise<boolean>|null>(null)
 // One writer per open note. Each write uses the revision returned by the last,
 // never a refreshed collection row that could mask another author's update.
 function flush():Promise<boolean> {
  clearTimeout(timer.current)
  if(flight.current)return flight.current
  if(!pending.current)return Promise.resolve(true)
  setStatus('saving');setError('')
  const run=async()=>{
   try {
    while(pending.current){
     const notes=draft.current
     saved.current=await savePlanner('period-notes',{...saved.current,notes})
     pending.current=draft.current!==notes
    }
    setStatus('saved');return true
   }catch(e){setError(String(e));setStatus('error');return false}
   finally{flight.current=null}
  }
  flight.current=run();return flight.current
 }
 function change(notes:PeriodNote['notes']) {
  draft.current=notes;pending.current=true;setStatus('saving');setError('')
  clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),500)
 }
 async function close(){if(await flush())onClose()}
 useEffect(()=>{
  const guard=(event:BeforeUnloadEvent)=>{if(pending.current){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',guard)
  return()=>{clearTimeout(timer.current);window.removeEventListener('beforeunload',guard)}
 },[])
 return <Sheet title={`${initial.kind==='day'?'Day':'Week'} Notes`} onClose={()=>void close()} note subtitle={initial.period.start+(initial.kind==='week'?` – ${initial.period.end}`:'')}><div className="resource-form"><div className="resource-body"><Suspense fallback={<p role="status">Opening notes…</p>}><NotesEditor value={initial.notes} onChange={change} label="Period notes"/></Suspense></div><div className="notes-save-state" role={status==='error'?'alert':'status'}>{status==='error'?<>{error} Your draft is preserved. <button type="button" onClick={()=>void flush()}>Retry</button><button type="button" onClick={()=>{if(window.confirm('Discard unsaved changes?'))onClose()}}>Discard draft</button></>:status==='saving'?'Saving…':'Saved'}</div></div></Sheet>
}
export const samePeriod=(a:DatePeriod,b:DatePeriod)=>a.start===b.start&&a.end===b.end
export function OutcomeEditor({period,onClose}:{period:DatePeriod;onClose:()=>void}) {
 const {data:tasks=[]}=useLiveQuery(q=>q.from({task:tasksCollection}));const {data:outcomes=[]}=useLiveQuery(q=>q.from({outcome:outcomesCollection}))
 const [taskId,setTaskId]=useState('');const [title,setTitle]=useState('');const [error,setError]=useState('');const [saving,setSaving]=useState(false);const created=useRef<Task|null>(null);const taskIdentity=useRef(crypto.randomUUID());const outcomeIdentity=useRef(crypto.randomUUID())
 const eligible=tasks.filter(t=>!t.archived&&!outcomes.some(o=>o.taskId===t.id&&samePeriod(o.period,period)))
 return <Sheet title="Add outcome" onClose={onClose} dirty={!!(taskId||title)}><form className="resource-form" onSubmit={async e=>{e.preventDefault();setError('');setSaving(true);try{
 let id=taskId
 if(!id){if(!title.trim())throw Error('Choose a task or name a new one.');if(!created.current)created.current=await saveTask({id:taskIdentity.current,title,completed:false,priority:'none',notes:{type:'doc'}},true);id=created.current.id}
 await savePlanner('outcomes',{id:outcomeIdentity.current,taskId:id,period,position:outcomes.filter(o=>samePeriod(o.period,period)).length});onClose()
 }catch(e){setError(String(e))}finally{setSaving(false)}}}><div className="resource-body"><p className="muted">{period.start} – {period.end}</p><p className="muted">An outcome links a task to this week. It does not change its priority or scheduled date.</p><label>Choose an existing task<select value={taskId} disabled={saving||!!created.current} onChange={e=>{setTaskId(e.target.value);setTitle('')}}><option value="">Create a new task instead</option>{eligible.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>{!taskId&&<label>New outcome name<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} disabled={saving||!!created.current}/></label>}{created.current&&<p className="muted">Your task has been created. Retry to link it to this week.</p>}{error&&<p role="alert">{error} Your draft is preserved.</p>}</div><div className="resource-actions"><button className="save-button" disabled={saving}>Add to week</button></div></form></Sheet>
}
export function WeeklyOutcomes({period}:{period:DatePeriod}) {
 const {data:tasks=[]}=useLiveQuery(q=>q.from({task:tasksCollection}));const {data:outcomes=[],isLoading,isError}=useLiveQuery(q=>q.from({outcome:outcomesCollection}))
 const rows=outcomes.filter(o=>samePeriod(o.period,period)&&tasks.some(t=>t.id===o.taskId&&!t.archived)).sort((a,b)=>a.position-b.position)
 return <>{isLoading?<p role="status">Gathering outcomes…</p>:isError?<p role="alert">Could not load outcomes.</p>:!rows.length?<p className="empty-state">Choose a few things that would make this week feel good.</p>:rows.map(o=><div className="outcome-row" key={o.id}><TaskRows tasks={[tasks.find(t=>t.id===o.taskId)!]} compact showSchedule/></div>)}</>
}
export function PlannerAgenda({period,compact=false}:{period:DatePeriod;compact?:boolean}) {
 const clock=usePlannerClock();const {data:tasks=[],isLoading,isError}=useLiveQuery(q=>q.from({task:tasksCollection}));const {data:routines=[],isLoading:routinesLoading,isError:routineError}=useLiveQuery(q=>q.from({routine:routinesCollection}));const {data:occurrences=[],isLoading:occurrencesLoading,isError:occurrenceError}=useLiveQuery(q=>q.from({occurrence:occurrencesCollection}));const [error,setError]=useState('')
 const projectedTasks=projectScheduledTasks(tasks,period,clock.preferences.timezone)
 const [selectedInstance,setSelectedInstance]=useState<Occurrence|null>(null)

 const projectedRoutines=projectScheduledTasks(occurrences.filter(o=>!o.skipped),period,clock.preferences.timezone).map(({task:o,displayDate,instant})=>({routine:{...routines.find(r=>r.id===o.routineId),id:o.routineId,timezone:o.schedule?.timezone??clock.preferences.timezone,title:o.title??'Routine instance',durationMinutes:o.durationMinutes},date:o.date,displayDate,instant,completed:o.completed}))
 const items=[...projectedTasks.map(t=>({...t,kind:'task' as const,key:t.task.id})),...projectedRoutines.map(r=>({...r,kind:'routine' as const,key:r.routine.id+r.date}))].sort((a,b)=>a.displayDate.localeCompare(b.displayDate)||(a.instant??-Infinity)-(b.instant??-Infinity))
 const row=(item:typeof items[number])=><div className="routine-row agenda-row" key={item.key}><span className="time">{item.instant===undefined?'Anytime':new Intl.DateTimeFormat('en-GB',{timeZone:clock.preferences.timezone,hour:'2-digit',minute:'2-digit',hour12:clock.preferences.timeFormat==='12-hour'}).format(item.instant)}</span><div>{item.kind==='task'?<TaskRows tasks={[item.task]} compact={compact} onError={setError}/>:<div className="routine-card routine-live"><button className="check" aria-label={`${item.completed?'Reopen':'Complete'} ${item.routine.title} on ${item.date}`} aria-pressed={item.completed} onClick={async()=>{try{const existing=occurrences.find(o=>o.routineId===item.routine.id&&o.date===item.date);await savePlanner('occurrences',{...existing,id:existing?.id??crypto.randomUUID(),routineId:item.routine.id,date:item.date,completed:!item.completed})}catch(e){setError(String(e))}}}>{item.completed?'✓':'○'}</button><div><h2 className={item.completed?'done':''}><button type="button" className="agenda-card-details" disabled={getConfig().demo} aria-label={`Edit instance ${item.routine.title}`} aria-describedby={`routine-meta-${item.key}`} onClick={()=>setSelectedInstance(occurrences.find(o=>o.routineId===item.routine.id&&o.date===item.date)!)}><span>{item.routine.title}</span><small id={`routine-meta-${item.key}`}>{item.routine.durationMinutes?`${item.routine.durationMinutes} min · `:''}Routine</small></button></h2></div></div>}</div></div>
 const agenda=(calendarItems:CalendarTimelineItem[]=[],calendarAvailable=true)=>{
 const timeline=[...items.map(item=>{
  const duration=item.kind==='task'?item.task.durationMinutes:item.routine.durationMinutes
  return {key:item.key,displayDate:item.displayDate,instant:item.instant,end:duration===undefined?undefined:item.instant+duration*60000,content:row(item)}
 }),...calendarItems.map(item=>({...item,displayDate:new Intl.DateTimeFormat('en-CA',{timeZone:clock.preferences.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(item.instant)}))].sort((a,b)=>a.displayDate.localeCompare(b.displayDate)||(a.instant??-Infinity)-(b.instant??-Infinity))
 return <>{isLoading&&<p role="status">Loading tasks…</p>}{occurrencesLoading&&<p role="status">Loading routine instances…</p>}{(isError||occurrenceError||routineError)&&<p role="alert">Some planner data could not be refreshed. Available items remain visible.</p>}{selectedInstance&&<Suspense fallback={<p role="status">Opening editor…</p>}><OccurrenceEditor initial={selectedInstance} onClose={()=>setSelectedInstance(null)}/></Suspense>}<section className="timeline" aria-label="Scheduled agenda">{compact?timelineWithGaps(timeline).map(entry=>'item' in entry?entry.item.content:<div key={`gap:${entry.gap.start}:${entry.gap.end}`} className={`timeline-gap${entry.gap.end-entry.gap.start>3600000?' timeline-gap-long':''}`}><span>{timelineDuration(entry.gap.end-entry.gap.start)} gap</span></div>):timeline.map(item=>item.content)}{!isLoading&&!occurrencesLoading&&!routinesLoading&&!isError&&!occurrenceError&&!routineError&&!items.length&&!calendarItems.length&&calendarAvailable&&<div className="open-time"><span className="time">Open</span><div><h2>A little breathing room</h2><p>Nothing scheduled. Leave it open.</p></div></div>}</section>{error&&<p role="alert">{error}</p>}</>
 }
 return compact?<CalendarAgenda period={period} showChrome={false}>{agenda}</CalendarAgenda>:<><CalendarAgenda period={period}/>{agenda()}</>

}
export function RoutineManager() {
 const clock=usePlannerClock();const {data:routines=[],isLoading,isError}=useLiveQuery(q=>q.from({routine:routinesCollection}));const [selected,setSelected]=useState<Routine|null>(null)
 return <><div className="section-heading"><h2>Routines</h2><button className="quiet-action" onClick={()=>setSelected({id:crypto.randomUUID(),title:'',recurrenceIntent:{text:'',anchorDate:clock.today},timezone:clock.preferences.timezone,notes:{type:'doc'}})}>New routine</button></div>{isLoading&&<p role="status">Gathering routines…</p>}{isError&&<p role="alert">Could not load routines.</p>}{!isLoading&&!isError&&!routines.some(r=>!r.archived)&&<p className="empty-state">Make room for a small daily rhythm.</p>}{routines.filter(r=>!r.archived).map(r=><button key={r.id} className="routine-card routine-edit" onClick={()=>setSelected(r)}><strong>{r.title}</strong><span>{r.recurrenceIntent.text} · {r.durationIntent??'Duration not specified'}</span></button>)}{selected&&<RoutineEditor initial={selected} onClose={()=>setSelected(null)}/>}</>
}
export function ArchivedRoutines() {
 const {data:routines=[]}=useLiveQuery(q=>q.from({routine:routinesCollection}));const [selected,setSelected]=useState<Routine|null>(null)
 const archived=routines.filter(r=>r.archived)
 if(!archived.length)return null
 return <><details className="settings-card"><summary>Archived routines</summary>{archived.map(r=><button key={r.id} className="resource-link" onClick={()=>setSelected(r)}>{r.title}</button>)}</details>{selected&&<RoutineEditor initial={selected} onClose={()=>setSelected(null)}/>}</>
}
export function UnscheduledRoutineInstances() {
 const {data:instances=[]}=useLiveQuery(q=>q.from({instance:occurrencesCollection}));const [instance,setInstance]=useState<Occurrence|null>(null)
 const unscheduled=instances.filter(o=>!o.schedule&&!o.skipped)
 if(getConfig().demo||!unscheduled.length)return null
 return <><details className="settings-card"><summary>Unscheduled routine instances</summary>{unscheduled.map(o=><button key={o.id} className="resource-link" onClick={()=>setInstance(o)}>{o.title} · {o.date}</button>)}</details>{instance&&<Suspense fallback={<p role="status">Opening editor…</p>}><OccurrenceEditor initial={instance} onClose={()=>setInstance(null)}/></Suspense>}</>
}
export function RoutineEditor({initial,onClose}:{initial:Routine;onClose:()=>void}) {
 const [draft,setDraft]=useState(initial);const [dirty,setDirty]=useState(false);const [error,setError]=useState('');const [saving,setSaving]=useState(false)
 const update=(part:Partial<Routine>)=>{setDraft(d=>({...d,...part}));setDirty(true)}
 async function save(value:Routine){setSaving(true);setError('');try{await savePlanner('routines',value);onClose()}catch(e){setError(String(e))}finally{setSaving(false)}}
 return <Sheet title="Routine details" onClose={onClose} dirty={dirty}><form className="resource-form" onSubmit={e=>{e.preventDefault();void save(draft)}}><div className="resource-body"><label>Routine name<input value={draft.title} required maxLength={200} onChange={e=>update({title:e.target.value})}/></label><label>Frequency intent<input required maxLength={500} placeholder="Three times a week…" value={draft.recurrenceIntent.text} onChange={e=>update({recurrenceIntent:{text:e.target.value,anchorDate:draft.recurrenceIntent.anchorDate}})}/></label><label>Recurrence anchor date<input type="date" required value={draft.recurrenceIntent.anchorDate} onChange={e=>update({recurrenceIntent:{text:draft.recurrenceIntent.text,anchorDate:e.target.value}})}/></label><p className="muted">The anchor defines the first eligible day and alternating-week alignment. Frequency targets do not choose dates.</p>{draft.recurrenceIntent.status&&<p>Interpretation: {draft.recurrenceIntent.status} ({draft.recurrenceIntent.kind}).</p>}<div className="plan-fields"><TimezoneSelect label="Routine timezone" value={draft.timezone} onChange={timezone=>update({timezone})}/><label>Routine location<input value={draft.location??''} maxLength={1000} onChange={e=>update({location:e.target.value})}/></label><label>Routine duration intent<input value={draft.durationIntent??''} maxLength={500} onChange={e=>update({durationIntent:e.target.value})}/></label></div><label>Preferred time<input value={draft.preferredTime?.text??''} placeholder="Before lunch…" onChange={e=>update({preferredTime:e.target.value?{text:e.target.value}:undefined})}/></label>{draft.preferredTime?.status&&<p>{draft.preferredTime.status}: {draft.preferredTime.interpretation?.value}</p>}<p className="muted">Time preferences guide scheduling; they do not assign a time.</p><h3>Notes</h3><Suspense fallback={<p role="status">Opening notes…</p>}><NotesEditor value={draft.notes} onChange={notes=>update({notes})}/></Suspense>{error&&<p role="alert">{error} Your draft is preserved.</p>}</div><div className="resource-actions"><button className="save-button" disabled={saving}>Save routine</button><button type="button" className="archive-button" disabled={saving} onClick={()=>{if(draft.archived||window.confirm('Archive this routine? Past completions are kept.'))void save({...draft,archived:!draft.archived})}}>{draft.archived?'Restore':'Archive'} routine</button></div></form></Sheet>
}
