import { useEffect, useRef } from 'react'
import { schema } from 'prosemirror-schema-basic'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import type { Notes } from '../lib/contracts'

/** ProseMirror owns its active document. Parent forms own the unsaved JSON draft. */
export function NotesEditor({value,onChange,label='Notes'}:{value:Notes;onChange:(value:Notes)=>void;label?:string}) {
 const host=useRef<HTMLDivElement>(null)
 const view=useRef<EditorView|null>(null)
 const change=useRef(onChange);change.current=onChange
 const initial=useRef(value)
 useEffect(()=>{
  if(!host.current)return
  let doc
  try{doc=schema.nodeFromJSON(initial.current)}catch{doc=schema.topNodeType.createAndFill()!}
  if(!doc.childCount)doc=schema.topNodeType.createAndFill()!
  const editor=new EditorView(host.current,{
   state:EditorState.create({schema,doc}),
   attributes:{role:'textbox','aria-label':label,'aria-multiline':'true',class:'notes-editor'},
   dispatchTransaction(transaction){
    const state=editor.state.apply(transaction);editor.updateState(state)
    if(transaction.docChanged)change.current(state.doc.toJSON() as Notes)
   },
   handleKeyDown(current,event){
    if(event.key==='Enter'&&!event.shiftKey){
     const {state}=current
     if(state.selection instanceof TextSelection){
      try{current.dispatch(state.tr.split(state.selection.from).scrollIntoView());return true}catch{return false}
     }
    }
    return false
   },
  })
  view.current=editor
  return()=>{editor.destroy();view.current=null}
 },[label])
 function toggle(markName:'strong'|'em') {
  const editor=view.current;if(!editor)return
  const {state}=editor;const mark=schema.marks[markName];const {from,to,empty}=state.selection
  const active=empty?mark.isInSet(state.storedMarks||state.selection.$from.marks()):state.doc.rangeHasMark(from,to,mark)
  let transaction=state.tr
  transaction=empty?(active?transaction.removeStoredMark(mark):transaction.addStoredMark(mark.create())):(active?transaction.removeMark(from,to,mark):transaction.addMark(from,to,mark.create()))
  editor.dispatch(transaction);editor.focus()
 }
 return <div className="notes-surface">
  <div className="notes-toolbar" aria-label="Note formatting">
   <button type="button" aria-label="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>toggle('strong')}><strong>B</strong></button>
   <button type="button" aria-label="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>toggle('em')}><em>I</em></button>
  </div>
  <div ref={host}/>
 </div>
}
