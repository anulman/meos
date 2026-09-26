import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import {usePlannerClock} from '../lib/planner-clock'
import {addDays,dayPeriod} from '../lib/dates'
import {PlannerAgenda,PeriodNotesButton,RoutineManager,WeeklyOutcomes,usePlanning} from '../components/Planning'
export const Route=createFileRoute('/week')({component:Week})
function Week(){
 const clock=usePlannerClock();const {next,setNext}=usePlanning();const period=next?clock.nextWeek:clock.thisWeek;const [selected,setSelected]=useState<string|null>(null)
 const days=Array.from({length:7},(_,i)=>addDays(period.start,i));const active=selected&&days.includes(selected)?selected:null
 const format=(date:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
 return <><header className="page-heading"><div><p className="eyebrow">{format(period.start,{month:'short',day:'numeric'})} – {format(period.end,{month:'short',day:'numeric'})}</p><h1>{next?'Next week':'This week'}</h1></div><PeriodNotesButton kind="week" period={period}/></header><div className="week-switch" aria-label="Week selection"><button aria-pressed={!next} onClick={()=>setNext(false)}>This week</button><button aria-pressed={next} onClick={()=>setNext(true)}>Next week</button></div><section className="week-glance" aria-labelledby="glance-heading"><h2 className="section-label" id="glance-heading">Week at a glance</h2><ol>{days.map(date=><li key={date}><button aria-label={`View ${date}`} aria-pressed={active===date} onClick={()=>setSelected(active===date?null:date)}><span>{format(date,{weekday:'short'})}</span><strong>{Number(date.slice(-2))}</strong><span className="day-mark" aria-hidden="true"/></button></li>)}</ol><p className="muted">Choose a day to see its schedule.</p></section>{active&&<section className="week-section"><div className="section-heading"><h2>{format(active,{weekday:'long',month:'short',day:'numeric'})}</h2><PeriodNotesButton kind="day" period={dayPeriod(active)}/></div><PlannerAgenda period={dayPeriod(active)}/></section>}<section className="week-section"><h2>Priorities</h2><p className="muted">Your chosen weekly outcomes. Task priority and schedule stay independent.</p><WeeklyOutcomes period={period}/></section><section className="week-section"><RoutineManager/></section></>
}
