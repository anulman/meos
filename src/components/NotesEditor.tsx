import { useEffect, useRef, useState } from 'react'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { baseKeymap, chainCommands, exitCode, toggleMark } from 'prosemirror-commands'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import type { Notes } from '../lib/contracts'

/** ProseMirror owns its active document. Parent forms own the unsaved JSON draft. */
export function NotesEditor({value,onChange,label='Notes'}:{value:Notes;onChange:(value:Notes)=>void;label?:string}) {
 const [formatting,setFormatting]=useState({strong:false,em:false})
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
   state:EditorState.create({schema,doc,plugins:[
    history(),
    keymap({
     'Mod-b':toggleMark(schema.marks.strong),'Mod-i':toggleMark(schema.marks.em),
     'Mod-z':undo,'Shift-Mod-z':redo,'Mod-y':redo,
     'Shift-Enter':chainCommands(exitCode,(state,dispatch)=>{
      if(dispatch)dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
      return true
     }),
    }),
    keymap(baseKeymap),
   ]}),
   attributes:{role:'textbox','aria-label':label,'aria-multiline':'true',class:'notes-editor'},
   dispatchTransaction(transaction){
    const state=editor.state.apply(transaction);editor.updateState(state);updateFormatting(editor)
    if(transaction.docChanged)change.current(state.doc.toJSON() as Notes)
   },
   decorations(state){
    const blocks:Decoration[]=[]
    state.doc.descendants((node,pos)=>{
     // Agent append commands already store this explicit attribution. Decorate
     // its block without changing the document or treating human quotes as agents.
     if(node.type.name==='blockquote'&&node.firstChild?.textContent.startsWith('🤖 '))
      blocks.push(Decoration.node(pos,pos+node.nodeSize,{class:'agent-note'}))
    })
    return DecorationSet.create(state.doc,blocks)
   },
   handleDOMEvents:{focus:()=>{queueMicrotask(()=>updateFormatting(editor));return false},blur:()=>{queueMicrotask(()=>updateFormatting(editor));return false}},
   handleKeyDown(current,event){
    // ProseMirror suppresses native Escape; delegate to the modal's existing
    // cancel handler so dirty-draft confirmation and focus restoration still run.
    if(event.key==='Escape') {
     const dialog=current.dom.closest('dialog')
     if(dialog){event.preventDefault();dialog.requestClose();return true}
    }
    return false
   },
  })
  updateFormatting(editor)
  view.current=editor
  const selectionChange=()=>updateFormatting(editor)
  document.addEventListener('selectionchange',selectionChange)
  return()=>{document.removeEventListener('selectionchange',selectionChange);editor.destroy();view.current=null}
 },[label])
 function updateFormatting(editor:EditorView) {
  const state=editor.state,{from,to,empty}=state.selection
  const selection=window.getSelection()
  const selected=selection&&!selection.isCollapsed&&editor.dom.contains(selection.anchorNode)&&editor.dom.contains(selection.focusNode)
  if(!editor.hasFocus()&&!selected){setFormatting({strong:false,em:false});return}
  const active=(name:'strong'|'em')=>Boolean(empty
   ? schema.marks[name].isInSet(state.storedMarks??state.selection.$from.marks())
   : state.doc.rangeHasMark(from,to,schema.marks[name]))
  setFormatting({strong:active('strong'),em:active('em')})
 }
 function toggle(markName:'strong'|'em') {
  const editor=view.current;if(!editor)return
  toggleMark(schema.marks[markName])(editor.state,editor.dispatch,editor)
  editor.focus()
 }
 return <div className="notes-surface">
  <div className="notes-toolbar" aria-label="Note formatting">
   <button type="button" aria-label="Bold" aria-pressed={formatting.strong} onMouseDown={e=>e.preventDefault()} onClick={()=>toggle('strong')}><strong>B</strong></button>
   <button type="button" aria-label="Italic" aria-pressed={formatting.em} onMouseDown={e=>e.preventDefault()} onClick={()=>toggle('em')}><em>I</em></button>
  </div>
  <div ref={host}/>
 </div>
}
