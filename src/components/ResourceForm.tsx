import { useState, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import type { Notes, Project, Task, Priority, LinkedReference } from '../lib/contracts'
import { usePlannerClock } from '../lib/planner-clock'
import { saveProject, saveTask } from '../lib/store'
import { TimezoneSelect } from './TimezoneSelect'
import { NotesEditor } from './NotesEditor'

export function ResourceForm({kind,resource,projects=[],isNew=false,onSaved,onNotesChange,children}:{kind:'task'|'project';resource:Task|Project;projects?:Project[];isNew?:boolean;onSaved:(resource:Task|Project)=>void;onNotesChange?:()=>void;children?:ReactNode}) {
 const clock=usePlannerClock()
 const [error,setError]=useState('')
 const [saving,setSaving]=useState(false)
 const task=resource as Task;const project=resource as Project
 const form=useForm({defaultValues:{
  title:resource.title,completed:resource.completed??false,notes:resource.notes,
  references:resource.references??[] as LinkedReference[],
  type:task.type??'' as ''|'commute',projectId:task.projectId??'',priority:task.priority??'none' as Priority,
  date:task.schedule?.date??'',time:task.schedule?.time??'',timezone:task.schedule?.timezone??clock.preferences.timezone,
  preferredTime:task.preferredTime?.text??'',offset:task.schedule?.offsetMinutes?.toString()??'',
  location:task.location??'',durationIntent:task.durationIntent??'',actualDuration:task.actualDurationMinutes?.toString()??'',
  duration:task.durationMinutes?.toString()??'',targetDate:project.targetDate??'',
 },onSubmit:async({value})=>{
  setError('');setSaving(true)
  try{
   if(kind==='task'&&value.time&&!value.date)throw new Error('Choose a scheduled date before adding a time.')
   if(kind==='task'&&value.date&&!value.time)throw new Error('Choose a time for this scheduled task.');
   const base={_revision:resource._revision,id:resource.id,title:value.title,completed:value.completed,notes:value.notes,references:value.references,archived:resource.archived??false}
   const saved=kind==='task'?await saveTask({...base,type:value.type||undefined,location:value.location,durationIntent:value.durationIntent,actualDurationMinutes:value.actualDuration?Number(value.actualDuration):undefined,preferredTime:value.preferredTime?{text:value.preferredTime}:undefined,priority:value.priority,projectId:value.projectId||undefined,schedule:value.date?{date:value.date,time:value.time,timezone:value.timezone,...(value.offset?{offsetMinutes:Number(value.offset)}:{})}:undefined,durationMinutes:value.duration?Number(value.duration):undefined},isNew):await saveProject({...base,targetDate:value.targetDate||undefined},isNew)
   onSaved(saved)
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save. Your draft is still here.')}
  finally{setSaving(false)}
 }})
 async function archive(){
  if(!window.confirm(kind==='project'?'Archive this project? Its tasks will be kept in No project.':'Archive this task?'))return
  setSaving(true);setError('')
  try{const saved=kind==='task'?await saveTask({...resource as Task,archived:true}):await saveProject({...resource as Project,archived:true});onSaved(saved)}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not archive.')}
  finally{setSaving(false)}
 }
 return <form className="resource-form" onSubmit={event=>{event.preventDefault();event.stopPropagation();void form.handleSubmit()}}>
  <div className="resource-body"><div className="resource-title-row">
   <form.Field name="completed">{field=><button className="status-icon" type="button" aria-label={field.state.value?'Mark incomplete':'Mark complete'} aria-pressed={field.state.value} onClick={()=>field.handleChange(!field.state.value)}>{field.state.value?'✓':'○'}</button>}</form.Field>
   <form.Field name="title">{field=><input className="resource-title-input" aria-label={`${kind==='task'?'Task':'Project'} name`} placeholder={`Name this ${kind}`} value={field.state.value} onChange={e=>field.handleChange(e.target.value)} required maxLength={200}/>}</form.Field>
  </div>
  <details className="resource-section" open>
   <summary>Plan</summary>
   <div className="plan-fields">
    {kind==='task'?<>
     <form.Field name="type">{field=><label>Task type<select aria-label="Task type" value={field.state.value} onChange={e=>field.handleChange(e.target.value as ''|'commute')}><option value="">Task</option><option value="commute">Commute</option></select></label>}</form.Field>
     <p className="muted">Commutes stay on the calendar and in their project, but not in No project.</p>
     <form.Field name="projectId">{field=><label>Project<select value={field.state.value} onChange={e=>field.handleChange(e.target.value)}><option value="">No project</option>{projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}</form.Field>
     <p className="muted">Scheduling is optional. Tasks without a date and time stay in the task lists in Settings, outside daily views.</p>
     <button type="button" className="quiet-action" onClick={()=>{form.setFieldValue('date','');form.setFieldValue('time','')}}>Clear schedule</button>
     <form.Field name="date">{field=><label>Scheduled date<input type="date" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>
     <form.Field name="time">{field=><label>Time (required when scheduled)<input type="time" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>
     <form.Field name="timezone">{field=><TimezoneSelect label="Timezone" value={field.state.value} onChange={field.handleChange}/>}</form.Field>
     <form.Field name="offset">{field=><label>UTC offset in minutes (required for repeated DST times)<input type="number" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>
     <form.Field name="preferredTime">{field=><label>Preferred time<input value={field.state.value} placeholder="In the morning, before lunch…" onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>
     <p className="muted">Preferred times guide scheduling; they do not assign a time.{task.preferredTime?.status?` Interpretation: ${task.preferredTime.status}.`:null}</p><form.Field name="location">{field=><label>Location<input maxLength={1000} value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field><form.Field name="durationIntent">{field=><label>Duration intent<input maxLength={500} placeholder="About an hour…" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field><form.Field name="actualDuration">{field=><label>Actual duration (minutes)<input type="number" min="1" max="10080" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field><form.Field name="duration">{field=><label>Duration (minutes)<input type="number" min="1" max="1440" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>
     <form.Field name="priority">{field=><label>Priority<select value={field.state.value} onChange={e=>field.handleChange(e.target.value as Priority)}>{(['none','low','medium','high'] as const).map(p=><option key={p}>{p}</option>)}</select></label>}</form.Field>
    </>:<form.Field name="targetDate">{field=><label>Target date (optional)<input type="date" value={field.state.value} onChange={e=>field.handleChange(e.target.value)}/></label>}</form.Field>}
   </div>
  </details>
  <section className="resource-section"><h2>Notes</h2><form.Field name="notes">{field=><NotesEditor value={field.state.value} onChange={(notes:Notes)=>{field.handleChange(notes);onNotesChange?.()}}/>}</form.Field></section>
  <section className="resource-section"><h2>Linked references</h2>
   <form.Field name="references">{field=><>
    {field.state.value.map((reference,index)=><div className="reference-row" key={reference.id}>
     <label>Label<input aria-label={`Reference ${index+1} label`} value={reference.label} onChange={e=>field.handleChange(field.state.value.map((r,i)=>i===index?{...r,label:e.target.value}:r))}/></label>
     <label>URL<input type="url" aria-label={`Reference ${index+1} URL`} placeholder="https://…" value={reference.url} onChange={e=>field.handleChange(field.state.value.map((r,i)=>i===index?{...r,url:e.target.value}:r))} required/></label>
     <button type="button" className="quiet-button" aria-label={`Remove reference ${index+1}`} onClick={()=>field.handleChange(field.state.value.filter((_,i)=>i!==index))}>Remove</button>
    </div>)}
    <button type="button" className="quiet-button" onClick={()=>field.handleChange([...field.state.value,{id:crypto.randomUUID(),label:'',url:''}])}>+ Add reference</button>
   </>}</form.Field>
  </section>
  {children}
  {error&&<p role="alert" className="save-error">{error} Your unsaved changes are preserved.</p>}
  </div><div className="resource-actions"><button className="save-button" type="submit" disabled={saving}>{saving?'Saving…':isNew?`Create ${kind}`:'Save changes'}</button>{!isNew&&<button type="button" className="archive-button" onClick={()=>void archive()} disabled={saving}>Archive {kind}</button>}</div>
 </form>
}
