import {differenceInCalendarDays, parseISO} from 'date-fns'

const relative = new Intl.RelativeTimeFormat('en', {numeric:'auto'})
/** Compare calendar dates already resolved in the planner timezone, not elapsed hours. */
export function relativeDay(day:string, today:string):string {
 const days=differenceInCalendarDays(parseISO(day),parseISO(today))
 if(days===0)return 'Today'
 if(days===-1)return 'Yesterday'
 if(days===1)return 'Tomorrow'
 if(Math.abs(days)<7)return relative.format(days,'day')
 return relative.format(Math.trunc(days/7),'week')
}
