// SPDX-License-Identifier: Apache-2.0
// Generate factual offsets from the build host's ICU. No runtime Intl dependency.
import {readFileSync,writeFileSync} from 'node:fs'
const source=readFileSync(new URL('../backend/timezones.mjs',import.meta.url),'utf8')
const zones=JSON.parse(source.match(/new Set\((\[[^\n]+\])\)/)[1])
const start=Date.UTC(2020,0,1),end=Date.UTC(2041,0,1),rules={}
for(const zone of zones){
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'})
 const offset=t=>{const s=fmt.formatToParts(t).find(x=>x.type==='timeZoneName').value;if(s==='GMT')return 0;const m=s.match(/^GMT([+-])(\d\d):(\d\d)$/);if(!m)throw Error(s);return (m[1]==='-'?-1:1)*(+m[2]*60 + +m[3])}
 const rows=[[start,offset(start)]]
 for(let t=start+86400000;t<end;t+=86400000){const n=offset(t);if(n!==rows.at(-1)[1]){let a=t-86400000,b=t;while(b-a>60000){const mid=Math.floor((a+b)/120000)*60000;if(offset(mid)===rows.at(-1)[1])a=mid;else b=mid}rows.push([b,n])}}
 rules[zone]=rows
}
writeFileSync(new URL('../backend/timezone-rules.mjs',import.meta.url),'// SPDX-License-Identifier: Apache-2.0\n// Generated factual ICU '+process.versions.icu+' / tz '+process.versions.tz+' offsets. Range 2020–2040, fail closed outside range.\nexport const range='+JSON.stringify([start,end])+'\nexport const rules='+JSON.stringify(rules)+'\n')
