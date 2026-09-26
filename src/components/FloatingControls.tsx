import {useEffect, useId, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {autoUpdate, flip, offset, shift, useFloating} from '@floating-ui/react-dom'

type Position = {x:number; y:number}
type Corner = 'top left'|'top right'|'bottom left'|'bottom right'
const corners:Corner[] = ['top left','top right','bottom left','bottom right']
const BUTTON_WIDTH=176, BUTTON_HEIGHT=56, CONTENT_WIDTH=716
// Page-memory only: survives route changes, intentionally resets on reload.
let rememberedPosition: Position | null = null
let rememberedCorner: Corner | null = null
/** Settings has no mounted floating control; the next mount uses the default. */
export function resetFloatingPositions(){rememberedPosition=null;rememberedCorner=null}
const constrain = (x:number, y:number):Position => ({
  x:Math.max(12, Math.min(x, window.innerWidth - BUTTON_WIDTH - 12)),
  y:Math.max(12, Math.min(y, window.innerHeight - BUTTON_HEIGHT - 12)),
})
const cornerPosition = (corner:Corner):Position => {
  const inset=Math.max(18,(window.innerWidth-CONTENT_WIDTH)/2)
  const bottom=Math.max(12,window.innerHeight-BUTTON_HEIGHT-98)
  return constrain(corner.includes('left')?inset:window.innerWidth-inset-BUTTON_WIDTH,corner.includes('top')?Math.min(110,bottom):bottom)
}
const track = (reference:Parameters<typeof autoUpdate>[0], floating:HTMLElement, update:()=>void) => autoUpdate(reference, floating, update, {animationFrame:true})

export function FloatingControls({kind,onAdd}:{kind:'task'|'outcome';onAdd:()=>void}) {
  const [position,setPosition] = useState<Position|null>(null)
  const [anchor,setAnchor] = useState<'hidden'|'visible'|'fading'>('hidden')
  const [menu,setMenu] = useState(false)
  const [help,setHelp] = useState(false)
  const [keyboard,setKeyboard] = useState(false)
  const [mounted,setMounted] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const menuElement = useRef<HTMLDivElement>(null)
  const anchorElement = useRef<HTMLButtonElement>(null)
  const drag = useRef<{startX:number;startY:number;x:number;y:number;moved:boolean}|null>(null)
  const suppressClick = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const menuId = useId(), helpId = useId()
  const target = useFloating({placement:'top-end',strategy:'fixed',middleware:[offset(8),flip(),shift({padding:12})],whileElementsMounted:track})
  const popup = useFloating({placement:'top-end',strategy:'fixed',middleware:[offset(60),flip(),shift({padding:12})],whileElementsMounted:track})
  const tooltip = useFloating({placement:'top-start',strategy:'fixed',middleware:[offset(8),flip(),shift({padding:12})],whileElementsMounted:track})
  const cancelHide = () => {timers.current.forEach(clearTimeout);timers.current=[]}
  const move = (next:Position,corner:Corner|null=null) => {rememberedPosition=next;rememberedCorner=corner;setPosition(next)}
  const closeMenu = (restore=false) => {setMenu(false);setAnchor('hidden');if(restore)primary.current?.focus()}
  const finishDrag = () => {
    const moved = drag.current?.moved ?? false
    suppressClick.current=moved;drag.current=null
    if(moved&&!menu){cancelHide();timers.current.push(setTimeout(()=>{
      setAnchor('fading');timers.current.push(setTimeout(()=>setAnchor('hidden'),150))
    },500))}
  }
  useEffect(()=>{
    setMounted(true)
    const resize=()=>{if(rememberedCorner)move(cornerPosition(rememberedCorner),rememberedCorner);else if(rememberedPosition)move(constrain(rememberedPosition.x,rememberedPosition.y))}
    resize()
    // The controls share one focus boundary even though the menu is portaled.
    // Moving between them must not remove a pointer target before its click.
    const focus=(event:FocusEvent)=>{const node=event.target as Node;if(!wrapper.current?.contains(node)&&!anchorElement.current?.contains(node)&&!menuElement.current?.contains(node)){cancelHide();setKeyboard(false);setHelp(false);setMenu(false);setAnchor('hidden')}}
    window.addEventListener('resize',resize)
    document.addEventListener('focusin',focus)
    return()=>{window.removeEventListener('resize',resize);document.removeEventListener('focusin',focus);cancelHide()}
  },[])
  useEffect(()=>{
    if(!menu)return
    menuElement.current?.querySelector('button')?.focus()
    const outside=(event:PointerEvent)=>{const node=event.target as Node;if(!menuElement.current?.contains(node)&&!anchorElement.current?.contains(node))closeMenu()}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeMenu(true)}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[menu])
  const showTarget=anchor!=='hidden'||menu||keyboard
  return <>
    <div ref={wrapper} className="floating-add" data-testid="floating-add" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
      <button ref={node=>{primary.current=node;target.refs.setReference(node);popup.refs.setReference(node);tooltip.refs.setReference(node)}} className="floating-primary"
        onFocus={event=>{if(event.currentTarget.matches(':focus-visible')){setKeyboard(true);setHelp(true)}}}
        onBlur={()=>{setHelp(false)}} onMouseEnter={()=>setHelp(true)} onMouseLeave={()=>setHelp(false)}
        onKeyDown={event=>{if(event.key==='Escape'){setKeyboard(false);setHelp(false)}if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();cancelHide();setMenu(true);setHelp(false)}}}
        onPointerDown={event=>{if(event.button!==0)return;const r=wrapper.current!.getBoundingClientRect();drag.current={startX:event.clientX,startY:event.clientY,x:r.x,y:r.y,moved:false};suppressClick.current=false;event.currentTarget.setPointerCapture(event.pointerId)}}
        onPointerMove={event=>{const d=drag.current;if(!d)return;if(!d.moved&&Math.hypot(event.clientX-d.startX,event.clientY-d.startY)>6){d.moved=true;cancelHide();setAnchor('visible');setHelp(false);setKeyboard(false)}if(d.moved)move(constrain(d.x+event.clientX-d.startX,d.y+event.clientY-d.startY))}}
        onPointerUp={finishDrag} onPointerCancel={()=>{finishDrag();suppressClick.current=true}} onLostPointerCapture={()=>{if(drag.current)finishDrag()}}
        onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onAdd()}} aria-describedby={helpId} aria-keyshortcuts="ArrowUp ArrowDown">
        <span aria-hidden="true">＋</span> Add {kind}
      </button>
      <span id={helpId} className="sr-only">Drag to move, or press the up or down arrow to choose a position.</span>
    </div>
    {mounted&&createPortal(<>
      {showTarget&&<button ref={node=>{anchorElement.current=node;target.refs.setFloating(node)}} className={`float-position floating-target ${anchor==='fading'&&!menu&&!keyboard?'is-fading':''}`} style={target.floatingStyles} data-placement={target.placement}
        aria-label="Move add button" aria-expanded={menu} aria-controls={menuId}
        onClick={()=>{cancelHide();setHelp(false);setKeyboard(false);if(menu)closeMenu(true);else{setAnchor('visible');setMenu(true)}}}>↔</button>}
      {menu&&<div ref={node=>{menuElement.current=node;popup.refs.setFloating(node)}} id={menuId} className="placement-menu floating-placement" style={popup.floatingStyles} data-placement={popup.placement} role="group" aria-label="Add button position">
        <p>Button position</p>{corners.map(c=><button key={c} onClick={()=>{move(cornerPosition(c),c);closeMenu(true)}}>{c}</button>)}
      </div>}
      {help&&!showTarget&&!menu&&<span ref={tooltip.refs.setFloating} className="floating-tooltip" style={tooltip.floatingStyles} data-placement={tooltip.placement} role="tooltip">Drag to move · ↑↓ to position</span>}
    </>,document.body)}
  </>
}
