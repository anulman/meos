import {createFileRoute} from '@tanstack/react-router'
import {PlannerAgenda,PeriodNotesButton} from '../components/Planning'
import {usePlannerClock} from '../lib/planner-clock'
export const Route=createFileRoute('/')({component:Today})
function Today(){const clock=usePlannerClock();const date=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric',timeZone:clock.preferences.timezone}).format(clock.now);return <div className="today-view"><header className="page-heading"><div><p className="eyebrow">{date}</p><h1>Today</h1></div><PeriodNotesButton kind="day" period={clock.todayPeriod}/></header><PlannerAgenda period={clock.todayPeriod} compact/></div>}
