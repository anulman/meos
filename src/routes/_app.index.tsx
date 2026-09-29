import {startRouteReads} from '../lib/loading'
import {relativeDay} from '../lib/relative-day'
import {createFileRoute} from '@tanstack/react-router'
import {PlannerAgenda,PeriodNotesButton} from '../components/Planning'
import {usePlannerClock} from '../lib/planner-clock'
import {useLayoutEffect,useRef,useState} from 'react'
import {addDays,dayPeriod} from '../lib/dates'
export const Route=createFileRoute('/_app/')({loader:({context})=>{if(context.ready)startRouteReads('today')},component:Today})
function Today(){
 const [selectedDay,setSelectedDay]=useState<string|null>(null)
 const clock=usePlannerClock()
 const day=selectedDay??clock.today;const period=dayPeriod(day)
 const isToday=day===clock.today
 const titleRow=useRef<HTMLDivElement>(null)
 // Flex items cannot share intrinsic minimum widths. Measure only the two
 // controls, so both sides reserve the larger width without duplicating UI.
 useLayoutEffect(()=>{
  const row=titleRow.current!
  const controls=Array.from(row.querySelectorAll<HTMLElement>('.today-header-side > *'))
  const resize=()=>row.style.setProperty('--header-side-width',`${Math.max(0,...controls.map(control=>control.getBoundingClientRect().width))}px`)
  const observer=new ResizeObserver(resize)
  controls.forEach(control=>observer.observe(control));resize()
  return ()=>observer.disconnect()
 },[isToday])
 const date=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')).replace(',', '')
 const moveDay=(offset:number)=>setSelectedDay(current=>{const next=addDays(current??clock.today,offset);return next===clock.today?null:next})
 return <div className="today-view"><header className="today-heading"><div ref={titleRow} className="today-title-row"><div className="today-header-side today-return">{!isToday&&<button type="button" className="quiet-action" onClick={()=>setSelectedDay(null)}><span aria-hidden="true">↪️</span> Today</button>}</div><h1 aria-live="polite">{relativeDay(day,clock.today)}</h1><div className="today-header-side today-notes"><PeriodNotesButton kind="day" period={period}/></div></div><div className="today-date-row"><div className="day-navigation"><button type="button" aria-label="Previous day" onClick={()=>moveDay(-1)}><span aria-hidden="true">👈</span></button><p className="day-label">{date}</p><button type="button" aria-label="Next day" onClick={()=>moveDay(1)}><span aria-hidden="true">👉</span></button></div></div></header><PlannerAgenda period={period} compact/></div>
}
