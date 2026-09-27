import {FloatingControls} from './components/FloatingControls'
import {useEffect,useRef,useState,createContext,useContext} from 'react'
import {useLiveQuery} from '@tanstack/react-db'
import {Button} from '@base-ui/react/button'
import {tasksCollection,projectsCollection,saveTask,saveProject} from './lib/store'
import type {Task,Project} from './lib/contracts'
import {usePlanning} from './components/Planning'
import {usePlannerClock} from './lib/planner-clock'
import {ResourceForm} from './components/ResourceForm'

type Selection={kind:'task',resource:Task,isNew?:boolean}|{kind:'project',resource:Project,isNew?:boolean}
const ResourceContext=createContext<(selection:Selection)=>void>(()=>{})
export function ResourceProvider({children}:{children:React.ReactNode}) {
 const[ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready?<ActiveResourceProvider>{children}</ActiveResourceProvider>:children
}
function ActiveResourceProvider({children}:{children:React.ReactNode}) {
 const[selected,setSelected]=useState<Selection|null>(null)
 const backdrop=useRef(false);const dirty=useRef(false);const [restoreError,setRestoreError]=useState('')
 const select=(value:Selection|null)=>{if(dirty.current&&!window.confirm('Discard unsaved changes?'))return;dirty.current=false;setRestoreError('');setSelected(value)}
 const saved=()=>{dirty.current=false;setSelected(null)}
 const dialog=useRef<HTMLDialogElement>(null)
 const {data:projects=[]}=useLiveQuery(q=>q.from({project:projectsCollection}))
 const {data:tasks=[]}=useLiveQuery(q=>q.from({task:tasksCollection}))
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();else if(!selected)dialog.current?.close()},[selected])
 return <ResourceContext.Provider value={select}>{children}<dialog ref={dialog} className="resource-dialog" onPointerDown={event=>{backdrop.current=outsideDialog(event)}} onPointerUp={event=>{if(backdrop.current&&outsideDialog(event))select(null);backdrop.current=false}} aria-label={selected?`${selected.isNew?'Create':'Edit'} ${selected.kind}`:'Resource details'} onCancel={event=>{event.preventDefault();select(null)}} onClose={()=>setSelected(null)} onInputCapture={()=>{dirty.current=true}} onClickCapture={event=>{if((event.target as HTMLElement).closest('.status-icon,.notes-toolbar,.reference-row button,.plan-fields button,.timezone-option'))dirty.current=true}}><div className="resource-top"><span className="eyebrow">{selected?.isNew?'New':'Edit'} {selected?.kind}</span><Button className="quiet-action" aria-label="Close details" onClick={()=>select(null)}>Close ×</Button></div>{selected?.resource.archived&&<div className="restore-banner"><p>This {selected.kind} is archived.</p><Button className="primary" onClick={async()=>{try{if(selected.kind==='task')await saveTask({...selected.resource,archived:false});else await saveProject({...selected.resource,archived:false});saved()}catch(error){setRestoreError(error instanceof Error?error.message:'Could not restore.')}}}>Restore {selected.kind}</Button>{restoreError&&<p role="alert">{restoreError}</p>}</div>}{selected&&<ResourceForm key={selected.kind+selected.resource.id} kind={selected.kind} resource={selected.resource} projects={projects.filter(p=>!p.archived)} isNew={selected.isNew} onSaved={saved} onNotesChange={()=>{dirty.current=true}}>{selected.kind==='project'&&!selected.isNew&&<section className="resource-tasks"><div className="section-heading"><h2>Tasks</h2><Button className="quiet-action" onClick={()=>select({kind:'task',resource:newTask(selected.resource.id),isNew:true})}>Add task</Button></div><TaskRows tasks={tasks.filter(t=>t.projectId===selected.resource.id&&!t.archived)}/></section>}</ResourceForm>}</dialog></ResourceContext.Provider>
}
function newTask(projectId?:string):Task{return{id:crypto.randomUUID(),title:'',completed:false,priority:'none',projectId,notes:{type:'doc'}}}
export function CreateResource({kind,children}:{kind:'task'|'project',children:React.ReactNode}){const open=useContext(ResourceContext);return <Button className="quiet-action" onClick={()=>open({kind,resource:kind==='task'?newTask():{id:crypto.randomUUID(),title:'',notes:{type:'doc'}},isNew:true} as Selection)}>{children}</Button>}

function outsideDialog(event:React.PointerEvent<HTMLDialogElement>) {
 const r=event.currentTarget.getBoundingClientRect()
 return event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)
}

export function PreviewAction({children,label,className=''}:{children:React.ReactNode,label:string,className?:string}) {
 const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const backdrop=useRef(false)
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 return <><Button className={className} onClick={()=>setOpen(true)}>{children}</Button><dialog ref={dialog} className="preview-dialog" onPointerDown={event=>{backdrop.current=outsideDialog(event)}} onPointerUp={event=>{if(backdrop.current&&outsideDialog(event))setOpen(false);backdrop.current=false}} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-label={label}><h2>{label}</h2><p>This is the layout preview. Editing will arrive in the next build; nothing has been changed.</p><Button className="primary" onClick={()=>setOpen(false)}>Got it</Button></dialog></>
}
export function TaskRows({tasks,compact=false,showSchedule=false,onError}:{tasks:Task[];compact?:boolean;showSchedule?:boolean;onError?:(message:string)=>void}){
 const open=useContext(ResourceContext);const[error,setError]=useState('');const {data:projects=[]}=useLiveQuery(q=>q.from({project:projectsCollection}))
 return <>{!tasks.length&&<p className="empty-state">Nothing here yet.</p>}<ul className="tasks">{tasks.map(task=><li key={task.id} className={task.priority==='high'?'task priority':'task'}><Button aria-label={`${task.completed?'Reopen':'Complete'} ${task.title}`} aria-pressed={task.completed} className="check" onClick={async()=>{(onError??setError)('');try{await tasksCollection.update(task.id,d=>{d.completed=!d.completed}).isPersisted.promise}catch{(onError??setError)('Could not save the change. Please try again.')}}}>{task.completed?'✓':'○'}</Button><div className="task-body">{!compact&&<small className="task-kind">{task.archived?'Archived':task.priority==='high'?'Priority':'Task'}</small>}<Button aria-label={task.title} className={task.completed?'done task-title resource-link':'task-title resource-link'} onClick={()=>open({kind:'task',resource:task})}><span>{task.title}</span>{compact&&<small className="task-meta">{[task.priority==='high'?'Priority':null,projects.find(p=>p.id===task.projectId)?.title,task.durationMinutes?`${task.durationMinutes} min`:null,showSchedule?(task.schedule?`${task.schedule.date} · ${task.schedule.time?`${task.schedule.time} ${task.schedule.timezone}`:'Time required'}`:'To be scheduled'):null].filter(Boolean).join(' · ')}</small>}</Button>{!compact&&<small>{task.schedule?`${task.schedule.date} · ${task.schedule.time?`${task.schedule.time} ${task.schedule.timezone}`:'Time required'}`:'Unscheduled'}</small>}</div></li>)}</ul>{error&&<p role="alert">{error}</p>}</>
}
export function Tasks(){
 const {data:tasks=[],isLoading,isError}=useLiveQuery(q=>q.from({task:tasksCollection}))
 if(isLoading)return <p role="status">Gathering your day…</p>
 if(isError)return <p role="alert">Could not load the demo. Please reload to try again.</p>
 const active=tasks.filter(t=>!t.archived)
 return <><TaskRows tasks={active}/><p className="muted completion">{active.filter(t=>t.completed).length} of {active.length} complete</p></>
}
export function ResourceLists(){
 const open=useContext(ResourceContext)
 const {data:projects=[]}=useLiveQuery(q=>q.from({project:projectsCollection}))
 const {data:tasks=[]}=useLiveQuery(q=>q.from({task:tasksCollection}))
 return <><section className="settings-card"><div className="section-heading"><h2>Projects</h2><CreateResource kind="project">New project</CreateResource></div><ul className="resource-list">{projects.filter(p=>!p.archived).map(p=><li key={p.id}><Button className="resource-link" onClick={()=>open({kind:'project',resource:p})}>{p.completed?'✓':'○'} {p.title} <span aria-hidden="true">↗</span></Button></li>)}</ul></section><section className="settings-card"><div className="section-heading"><h2>No project</h2><CreateResource kind="task">New task</CreateResource></div><p className="muted">Standalone tasks, including those not yet scheduled.</p><TaskRows tasks={tasks.filter(t=>!t.projectId&&!t.archived)} compact showSchedule/></section><details className="settings-card"><summary>Archived resources</summary><p className="muted">Open an item to restore it.</p><ul className="resource-list">{projects.filter(p=>p.archived).map(p=><li key={p.id}><Button className="resource-link" onClick={()=>open({kind:'project',resource:p})}>{p.title}</Button></li>)}</ul><TaskRows tasks={tasks.filter(t=>t.archived)} compact showSchedule/></details></>
}
export function FloatingAdd({kind}:{kind:'task'|'outcome'}) {
 const open=useContext(ResourceContext);const planning=usePlanning();const clock=usePlannerClock()
 return <FloatingControls kind={kind} onAdd={()=>kind==='outcome'?planning.openOutcome():open({kind:'task',resource:{...newTask(),schedule:{date:clock.today,time:'',timezone:clock.preferences.timezone}},isNew:true})}/>
}
