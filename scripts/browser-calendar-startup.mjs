// SPDX-License-Identifier: Apache-2.0
// Real auth gate + range hook + Calendar UI; all HTTP is synthetic and loopback-only.
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from 'playwright'
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'/src/lib/store';import{SessionGate}from'/src/components/SessionGate';import{CalendarAgenda}from'/src/components/CalendarAgenda';import{usePlannerClock}from'/src/lib/planner-clock';function App(){const[day,setDay]=useState('2026-09-27');const clock=usePlannerClock();return React.createElement(React.Fragment,null,React.createElement('h1',null,'Planner shell'),React.createElement('button',{onClick:()=>setDay('2026-09-28')},'Next day'),React.createElement('button',{onClick:()=>clock.setPreferences({timezone:'Asia/Tokyo'})},'Tokyo'),React.createElement(CalendarAgenda,{period:{start:day,end:day}}))}createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(SessionGate,null,React.createElement(App))));`
const cacheDir=await mkdtemp(join(tmpdir(),'meos-calendar-startup-'))
const server=await createServer({configFile:false,cacheDir,server:{host:'127.0.0.1',port:0},plugins:[{name:'startup-fixture',resolveId:id=>id==='virtual:startup.tsx'?'\0startup.tsx':null,load:id=>id==='\0startup.tsx'?source:null,configureServer(server){server.middlewares.use('/fixture',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root"></div><script>window.MEOS_CONFIG={demo:false,accessGated:true,timezone:"America/Montreal"}</script><script type="module" src="/@id/__x00__startup.tsx"></script></body></html>')})}}]})
const event=(summary,day)=>({id:summary,role:'primary',etag:'synthetic',summary,location:'',description:'',start:{dateTime:day+'T14:00:00Z'},end:{dateTime:day+'T15:00:00Z'},linked:false,recurring:false})
const metadata={id:'calendar',available:true,state:'connected',syncActive:true,lastSyncAt:1790524800000,plannerLastSyncAt:null,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:null,conflicts:[]},status:'fresh'}
let browser
try{
 await server.listen();const base=server.resolvedUrls.local[0];browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message)});await page.clock.install({time:new Date('2026-09-27T16:00Z')})
 let allowSession,allowCalendar;const sessionBarrier=new Promise(r=>allowSession=r),calendarBarrier=new Promise(r=>allowCalendar=r);let sequence=1,stale=false,fail=false,conflict=false;const calls=[]
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,new URL(base).origin);assert.equal(route.request().method(),'GET');calls.push(url.pathname+url.search)
  const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  if(url.pathname.endsWith('/session')){await sessionBarrier;return send({user:{id:'11111111-1111-4111-8111-111111111111'},csrf:'synthetic'})}
  if(url.pathname.endsWith('/preferences'))return send({value:{timezone:'America/Montreal',weekStartsOn:1},revision:1})
  assert.equal(url.pathname,'/api/meos/v1/calendar-window');await calendarBarrier
  if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{}'})
  const day=url.searchParams.get('start'),zone=url.searchParams.get('timezone');assert.equal(day,url.searchParams.get('end'))
  const cursor=url.searchParams.get('cursor');if(cursor&&conflict){conflict=false;sequence++;return route.fulfill({status:409,contentType:'application/json',body:'{}'})}
  const unchanged=!cursor&&Number(url.searchParams.get('sequence'))===sequence
  return send({...metadata,status:stale?'stale':'fresh',sequence,unchanged,...(!unchanged&&!cursor&&day==='2026-09-27'?{nextCursor:'primary:first'}:{}),items:unchanged?[]:[event((cursor?'Second page ':zone==='Asia/Tokyo'?'Tokyo ':day==='2026-09-28'?'Tomorrow ':'Today ')+sequence,day)]})
 })
 await page.goto(base+'fixture');await page.getByText('Opening your space…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Planner shell'}).count(),0);assert.equal(calls.filter(x=>x.includes('calendar-window')).length,0)
 allowSession();await page.getByRole('heading',{name:'Planner shell'}).waitFor();await page.getByText('Loading your saved calendar…',{exact:true}).waitFor();assert.equal(await page.getByText('No calendar events in this period.').count(),0)
 allowCalendar();await page.getByRole('button',{name:'Today 1',exact:true}).waitFor();await page.getByRole('button',{name:'Second page 1',exact:true}).waitFor();assert.ok(calls.some(x=>x.includes('start=2026-09-27')&&x.includes('timezone=America%2FMontreal')))
 await Promise.all([page.waitForResponse(r=>r.url().includes('sequence=1')),page.clock.runFor(31000)]);assert.ok(calls.some(x=>x.includes('sequence=1')));assert.equal(await page.getByRole('button',{name:'Today 1',exact:true}).count(),1)
 sequence=2;conflict=true;await page.clock.runFor(31000);await page.getByRole('button',{name:'Today 3',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Today 1',exact:true}).count(),0)
 stale=true;await page.clock.runFor(31000);await page.getByText('Showing saved calendar events; sync is not current.').waitFor()
 fail=true;await page.clock.runFor(31000);await page.getByText('Could not refresh Calendar; showing the last saved events.').waitFor();assert.equal(await page.getByRole('button',{name:'Today 3',exact:true}).count(),1)
 fail=false;await page.getByRole('button',{name:'Next day',exact:true}).click();await page.getByRole('button',{name:'Tomorrow 3',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Today 3',exact:true}).count(),0)
 await page.getByRole('button',{name:'Tokyo',exact:true}).click();await page.getByRole('button',{name:'Tokyo 3',exact:true}).waitFor();assert.ok(calls.some(x=>x.includes('timezone=Asia%2FTokyo')))
 assert.equal(calls.some(x=>x.includes('calendar-cache')),false);assert.deepEqual(errors,[])
 console.log('PASS actual SessionGate stays closed until authenticated; shell renders while Calendar is unresolved; range/zone navigation, conditional polls, publication changes, stale/error preservation, no full-cache requests. Synthetic browser proof, not production latency.')
 await page.close()
}finally{await browser?.close();await server.close();await rm(cacheDir,{recursive:true,force:true})}
