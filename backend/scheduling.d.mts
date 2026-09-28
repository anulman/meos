export function scheduledInstant(schedule:{date:string;time:string;timezone:string;offsetMinutes?:number}):number
export function localDay(instant:number,zone:string):string
export function interpretRecurrence(text:string,anchorDate:string):import('../src/lib/backend/generated').RecurrenceIntent
