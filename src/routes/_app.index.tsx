import {startRouteReads} from '../lib/loading'
import {WeatherStatus} from '../components/WeatherStatus'
import {createFileRoute} from '@tanstack/react-router'
import {PlannerAgenda,PeriodNotesButton} from '../components/Planning'
import {usePlannerClock} from '../lib/planner-clock'
import {useState} from 'react'
import {addDays,dayPeriod} from '../lib/dates'
export const Route=createFileRoute('/_app/')({loader:({context})=>{if(context.ready)startRouteReads('today')},component:Today})
function Today(){
 const clock=usePlannerClock();const [selectedDay,setSelectedDay]=useState<string|null>(null)
 const day=selectedDay??clock.today;const period=dayPeriod(day)
 const date=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))
 const moveDay=(offset:number)=>setSelectedDay(current=>{const next=addDays(current??clock.today,offset);return next===clock.today?null:next})
 return <div className="today-view"><header className="page-heading"><div><div className="day-navigation"><button type="button" aria-label="Previous day" onClick={()=>moveDay(-1)}><span aria-hidden="true">👈</span></button><p className="eyebrow" aria-live="polite">{date}</p><button type="button" aria-label="Next day" onClick={()=>moveDay(1)}><span aria-hidden="true">👉</span></button></div><h1>{day===clock.today?'Today':'Day'}</h1></div><PeriodNotesButton kind="day" period={period}/></header><WeatherStatus/><PlannerAgenda period={period} compact/></div>
}
