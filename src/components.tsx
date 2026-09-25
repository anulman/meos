import {useEffect,useRef,useState,createContext,useContext} from 'react'
import {useLiveQuery} from '@tanstack/react-db'
import {Button} from '@base-ui/react/button'
import {tasksCollection,projectsCollection,saveTask,saveProject} from './lib/store'
import type {Task,Project} from './lib/contracts'
import {ResourceForm} from './components/ResourceForm'

type Selection={kind:'task',resource:Task,isNew?:boolean}|{kind:'project',resource:Project,isNew?:boolean}
const ResourceContext=createContext<(selection:Selection)=>void>(()=>{})
export function ResourceProvider({children}:{children:React.ReactNode}) {
 const[ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready?<ActiveResourceProvider>{children}</ActiveResourceProvider>:children
}
function ActiveResourceProvider({children}:{children:React.ReactNode}) {
 const[selected,setSelected]=useState<Selection|null>(null)
 const dirty=useRef(false);const [restoreError,setRestoreError]=useState('')
 const select=(value:Selection|null)=>{if(dirty.current&&!window.confirm('Discard unsaved changes?'))return;dirty.current=false;setRestoreError('');setSelected(value)}
 const saved=()=>{dirty.current=false;setSelected(null)}
 const dialog=useRef<HTMLDialogElement>(null)
 const {data:projects=[]}=useLiveQuery(q=>q.from({project:projectsCollection}))
 const {data:tasks=[]}=useLiveQuery(q=>q.from({task:tasksCollection}))
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();else if(!selected)dialog.current?.close()},[selected])
 return <ResourceContext.Provider value={select}>{children}<dialog ref={dialog} className="resource-dialog" aria-label={selected?`${selected.isNew?'Create':'Edit'} ${selected.kind}`:'Resource details'} onCancel={event=>{event.preventDefault();select(null)}} onClose={()=>setSelected(null)} onInputCapture={()=>{dirty.current=true}} onClickCapture={event=>{if((event.target as HTMLElement).closest('.status-icon,.notes-toolbar,.reference-row button'))dirty.current=true}}><div className="resource-top"><span className="eyebrow">{selected?.isNew?'New':'Edit'} {selected?.kind}</span><Button className="quiet-action" aria-label="Close details" onClick={()=>select(null)}>Close ×</Button></div>{selected?.resource.archived&&<div className="restore-banner"><p>This {selected.kind} is archived.</p><Button className="primary" onClick={async()=>{try{if(selected.kind==='task')await saveTask({...selected.resource,archived:false});else await saveProject({...selected.resource,archived:false});saved()}catch(error){setRestoreError(error instanceof Error?error.message:'Could not restore.')}}}>Restore {selected.kind}</Button>{restoreError&&<p role="alert">{restoreError}</p>}</div>}{selected&&<ResourceForm key={selected.kind+selected.resource.id} kind={selected.kind} resource={selected.resource} projects={projects.filter(p=>!p.archived)} isNew={selected.isNew} onSaved={saved}>{selected.kind==='project'&&!selected.isNew&&<section className="resource-tasks"><div className="section-heading"><h2>Tasks</h2><Button className="quiet-action" onClick={()=>select({kind:'task',resource:newTask(selected.resource.id),isNew:true})}>Add task</Button></div><TaskRows tasks={tasks.filter(t=>t.projectId===selected.resource.id&&!t.archived)}/></section>}</ResourceForm>}</dialog></ResourceContext.Provider>
}
function newTask(projectId?:string):Task{return{id:crypto.randomUUID(),title:'',completed:false,priority:'none',projectId,notes:{type:'doc'}}}
export function CreateResource({kind,children}:{kind:'task'|'project',children:React.ReactNode}){const open=useContext(ResourceContext);return <Button className="quiet-action" onClick={()=>open({kind,resource:kind==='task'?newTask():{id:crypto.randomUUID(),title:'',notes:{type:'doc'}},isNew:true} as Selection)}>{children}</Button>}
export function PreviewAction({children,label,className=''}:{children:React.ReactNode,label:string,className?:string}) {
 const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 return <><Button className={className} onClick={()=>setOpen(true)}>{children}</Button><dialog ref={dialog} className="preview-dialog" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-label={label}><h2>{label}</h2><p>This is the layout preview. Editing will arrive in the next build; nothing has been changed.</p><Button className="primary" onClick={()=>setOpen(false)}>Got it</Button></dialog></>
}
export function TaskRows({tasks}:{tasks:Task[]}){
 const open=useContext(ResourceContext);const[error,setError]=useState('')
 return <>{!tasks.length&&<p className="empty-state">Nothing here yet.</p>}<ul className="tasks">{tasks.map(task=><li key={task.id} className={task.priority==='high'?'task priority':'task'}><Button aria-label={`${task.completed?'Reopen':'Complete'} ${task.title}`} aria-pressed={task.completed} className="check" onClick={async()=>{setError('');try{await tasksCollection.update(task.id,d=>{d.completed=!d.completed}).isPersisted.promise}catch{setError('Could not save the change. Please try again.')}}}>{task.completed?'✓':'○'}</Button><div className="task-body"><small className="task-kind">{task.archived?'Archived':task.priority==='high'?'Priority':'Task'}</small><Button className={task.completed?'done task-title resource-link':'task-title resource-link'} onClick={()=>open({kind:'task',resource:task})}>{task.title}</Button><small>{task.schedule?`${task.schedule.date} · ${task.schedule.time||'Anytime'}`:'Unscheduled'}</small></div></li>)}</ul>{error&&<p role="alert">{error}</p>}</>
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
 return <><section className="settings-card"><div className="section-heading"><h2>Projects</h2><CreateResource kind="project">New project</CreateResource></div><ul className="resource-list">{projects.filter(p=>!p.archived).map(p=><li key={p.id}><Button className="resource-link" onClick={()=>open({kind:'project',resource:p})}>{p.completed?'✓':'○'} {p.title} <span aria-hidden="true">↗</span></Button></li>)}</ul></section><section className="settings-card"><div className="section-heading"><h2>No project</h2><CreateResource kind="task">New task</CreateResource></div><p className="muted">Standalone tasks, including those not yet scheduled.</p><TaskRows tasks={tasks.filter(t=>!t.projectId&&!t.archived)}/></section><details className="settings-card"><summary>Archived resources</summary><p className="muted">Open an item to restore it.</p><ul className="resource-list">{projects.filter(p=>p.archived).map(p=><li key={p.id}><Button className="resource-link" onClick={()=>open({kind:'project',resource:p})}>{p.title}</Button></li>)}</ul><TaskRows tasks={tasks.filter(t=>t.archived)}/></details></>
}
export function FloatingAdd({kind}:{kind:'task'|'outcome'}) {
 const open=useContext(ResourceContext)
 const [position,setPosition]=useState<{x:number,y:number}|null>(null);const [menu,setMenu]=useState(false)
 const wrapper=useRef<HTMLDivElement>(null);const drag=useRef<{startX:number,startY:number,x:number,y:number,moved:boolean}|null>(null);const suppressClick=useRef(false)
 const constrain=(x:number,y:number)=>({x:Math.max(12,Math.min(x,window.innerWidth-188)),y:Math.max(72,Math.min(y,window.innerHeight-142))})
 useEffect(()=>{const resize=()=>setPosition(p=>p?constrain(p.x,p.y):p);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
 const place=(corner:string)=>{setPosition(constrain(corner.includes('left')?16:window.innerWidth-192,corner.includes('top')?110:window.innerHeight-148));setMenu(false)}
 return <div ref={wrapper} className="floating-add" data-testid="floating-add" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
 <Button className="float-position" aria-label="Move add button" aria-expanded={menu} aria-controls="placement-menu" onClick={()=>setMenu(!menu)}>↔<span className="sr-only">Position</span></Button>
 {menu&&<div id="placement-menu" className={`placement-menu ${position && position.y < 300 ? 'placement-below' : ''}`} aria-label="Add button position"><p>Button position</p>{['top left','top right','bottom left','bottom right'].map(c=><Button key={c} onClick={()=>place(c)}>{c}</Button>)}</div>}
 <Button className="floating-primary" onPointerDown={e=>{if(e.button!==0)return;const r=wrapper.current!.getBoundingClientRect();drag.current={startX:e.clientX,startY:e.clientY,x:r.x,y:r.y,moved:false};suppressClick.current=false;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6)d.moved=true;if(d.moved)setPosition(constrain(d.x+e.clientX-d.startX,d.y+e.clientY-d.startY))}} onPointerUp={()=>{suppressClick.current=drag.current?.moved??false;drag.current=null}} onPointerCancel={()=>{drag.current=null;suppressClick.current=true}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}open({kind:'task',resource:{...newTask(),priority:kind==='outcome'?'high':'none'},isNew:true})}} aria-describedby="float-help"><span aria-hidden="true">＋</span> Add {kind}</Button>
 <span id="float-help" className="sr-only">Drag to move, or use Move add button to choose a position.</span>
 </div>
}
