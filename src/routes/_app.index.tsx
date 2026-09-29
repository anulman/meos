import {startRouteReads} from '../lib/loading'
import {relativeDay} from '../lib/relative-day'
import {createFileRoute} from '@tanstack/react-router'
import {PlannerAgenda,PeriodNotesButton} from '../components/Planning'
import {usePlannerClock} from '../lib/planner-clock'
import {useState} from 'react'
import {addDays,dayPeriod} from '../lib/dates'
export const Route=createFileRoute('/_app/')({loader:({context})=>{if(context.ready)startRouteReads('today')},component:Today})
function Today(){
 const clock=usePlannerClock();const [selectedDay,setSelectedDay]=useState<string|null>(null)
 const day=selectedDay??clock.today;const period=dayPeriod(day)
 const date=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')).replace(',', '')
 const moveDay=(offset:number)=>setSelectedDay(current=>{const next=addDays(current??clock.today,offset);return next===clock.today?null:next})
 return <div className="today-view"><header className="today-heading"><div className="today-title-row"><div className="today-header-side today-return">{day!==clock.today&&<button type="button" className="quiet-action" onClick={()=>setSelectedDay(null)}><span aria-hidden="true">↪️</span> Today</button>}</div><h1 aria-live="polite">{relativeDay(day,clock.today)}</h1><div className="today-header-side today-notes"><PeriodNotesButton kind="day" period={period}/></div></div><div className="today-date-row"><div className="day-navigation"><button type="button" aria-label="Previous day" onClick={()=>moveDay(-1)}><span aria-hidden="true">👈</span></button><p className="day-label">{date}</p><button type="button" aria-label="Next day" onClick={()=>moveDay(1)}><span aria-hidden="true">👉</span></button></div></div></header><PlannerAgenda period={period} compact/></div>
}
