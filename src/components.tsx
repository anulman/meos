import {useEffect,useRef,useState} from 'react'
import {useLiveQuery} from '@tanstack/react-db'
import {Button} from '@base-ui/react/button'
import {tasksCollection} from './lib/store'

export function PreviewAction({children,label,className=''}:{children:React.ReactNode,label:string,className?:string}) {
 const [open,setOpen]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 return <><Button className={className} onClick={()=>setOpen(true)}>{children}</Button><dialog ref={dialog} className="preview-dialog" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-label={label}><h2>{label}</h2><p>This is the layout preview. Editing will arrive in the next build; nothing has been changed.</p><Button className="primary" onClick={()=>setOpen(false)}>Got it</Button></dialog></>
}
export function Tasks(){
 const {data:tasks,isLoading,isError}=useLiveQuery(q=>q.from({task:tasksCollection}))
 const[error,setError]=useState('')
 if(isLoading)return <p role="status">Gathering your day…</p>
 if(isError)return <p role="alert">Could not load the demo. Please reload to try again.</p>
 return <><ul className="tasks">{tasks.map(task=><li key={task.id} className={task.priority==='high'?'task priority':'task'}><Button aria-label={`${task.completed?'Reopen':'Complete'} ${task.title}`} aria-pressed={task.completed} className="check" onClick={async()=>{setError('');try{await tasksCollection.update(task.id,d=>{d.completed=!d.completed}).isPersisted.promise}catch{setError('Could not save the change. Please try again.')}}}>{task.completed?'✓':'○'}</Button><div className="task-body"><small className="task-kind">{task.priority==='high'?'Priority':'Task'}</small><span className={task.completed?'done task-title':'task-title'}>{task.title}</span><small>{task.schedule?.time || 'Anytime'}</small></div></li>)}</ul>{error&&<p role="alert">{error}</p>}<p className="muted completion">{tasks.filter(t=>t.completed).length} of {tasks.length} complete</p></>
}

export function FloatingAdd({kind}:{kind:'task'|'outcome'}) {
 const [position,setPosition]=useState<{x:number,y:number}|null>(null)
 const [menu,setMenu]=useState(false)
 const [open,setOpen]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null)
 const wrapper=useRef<HTMLDivElement>(null)
 const drag=useRef<{startX:number,startY:number,x:number,y:number,moved:boolean}|null>(null)
 const suppressClick=useRef(false)
 const constrain=(x:number,y:number)=>({x:Math.max(12,Math.min(x,window.innerWidth-188)),y:Math.max(72,Math.min(y,window.innerHeight-142))})
 useEffect(()=>{const resize=()=>setPosition(p=>p?constrain(p.x,p.y):p);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 const place=(corner:string)=>{setPosition(constrain(corner.includes('left')?16:window.innerWidth-192,corner.includes('top')?110:window.innerHeight-148));setMenu(false)}
 return <><div ref={wrapper} className="floating-add" data-testid="floating-add" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
 <Button className="float-position" aria-label="Move add button" aria-expanded={menu} aria-controls="placement-menu" onClick={()=>setMenu(!menu)}>↔<span className="sr-only">Position</span></Button>
 {menu&&<div id="placement-menu" className={`placement-menu ${position && position.y < 300 ? 'placement-below' : ''}`} aria-label="Add button position"><p>Button position</p>{['top left','top right','bottom left','bottom right'].map(c=><Button key={c} onClick={()=>place(c)}>{c}</Button>)}</div>}
 <Button className="floating-primary" onPointerDown={e=>{if(e.button!==0)return;const r=wrapper.current!.getBoundingClientRect();drag.current={startX:e.clientX,startY:e.clientY,x:r.x,y:r.y,moved:false};suppressClick.current=false;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6)d.moved=true;if(d.moved)setPosition(constrain(d.x+e.clientX-d.startX,d.y+e.clientY-d.startY))}} onPointerUp={()=>{suppressClick.current=drag.current?.moved??false;drag.current=null}} onPointerCancel={()=>{drag.current=null;suppressClick.current=true}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}setOpen(true)}} aria-describedby="float-help"><span aria-hidden="true">＋</span> Add {kind}</Button>
 <span id="float-help" className="sr-only">Drag to move, or use Move add button to choose a position.</span>
 </div><dialog ref={dialog} className="preview-dialog" aria-label={`Add ${kind}`} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><h2>Add {kind}</h2><p>Creation is coming in the next build. This preview demonstrates the floating control; no record has been created.</p><Button className="primary" onClick={()=>setOpen(false)}>Got it</Button></dialog></>
}
