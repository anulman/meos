import type { TransportMode } from '../lib/contracts'

export const transportModes: {value:TransportMode;label:string;path:string}[] = [
 {value:'car',label:'Car',path:'M5 10l2-5h10l2 5M4 10h16v8H4zM7 18v3m10-3v3M7 14h1m8 0h1'},
 {value:'walk',label:'Walk',path:'M14 4a2 2 0 1 0-4 0 2 2 0 0 0 4 0M7 13l3-5 4 1 3 4h3M10 8l-1 8-4 5m4-5 5 1 2 4'},
 {value:'bicycle',label:'Bicycle',path:'M9 17a4 4 0 1 0-8 0 4 4 0 0 0 8 0m14 0a4 4 0 1 0-8 0 4 4 0 0 0 8 0M5 17l4-8 5 8H5m4-8h8l-3 8m3-8 2 8M7 6h4m6 3-1-4h3'},
 {value:'plane',label:'Plane',path:'M10 9V4a2 2 0 0 1 4 0v5l7 5v3l-7-3v5l3 2H7l3-2v-5l-7 3v-3z'},
 {value:'boat',label:'Boat',path:'M8 11V6h8v5M12 3v3m-9 7 9-3 9 3-3 6H6zm9-3v9M2 22l3-1 4 1 3-1 3 1 4-1 3 1'},
]

export function TransportIcon({mode='car'}:{mode?:TransportMode}) {
 const transport=transportModes.find(item=>item.value===mode)!
 return <span className="calendar-mark" role="img" aria-label={`Commute by ${transport.label.toLowerCase()}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={transport.path}/></svg></span>
}
