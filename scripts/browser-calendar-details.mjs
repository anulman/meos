// SPDX-License-Identifier: Apache-2.0
// Isolated synthetic UI: no application API, provider access or credentials.
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from 'playwright'
const event={id:'fixture',role:'primary',summary:'Cached appointment',location:'Room 2\nhttps://example.com/map',description:'Bring notes\n<script>window.injected=true</script>\nhttps://example.com/notes',start:{dateTime:'2026-09-27T01:30:00Z'},end:{dateTime:'2026-09-27T02:30:00Z'},recurring:false}
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{CalendarEventDetails}from'/src/components/CalendarEventDetails.tsx';import{CalendarAgenda}from'/src/components/CalendarAgenda.tsx';import'/src/styles.css';function App(){const[e,setE]=useState(null),[agenda,setAgenda]=useState(false);window.showEvent=setE;window.mountAgenda=()=>setAgenda(true);if(agenda)return React.createElement(CalendarAgenda,{period:{start:'2026-09-26',end:'2026-09-27'}});return React.createElement(React.Fragment,null,React.createElement('button',{id:'open',onClick:()=>setE(${JSON.stringify(event)})},'Open fixture'),e&&React.createElement(CalendarEventDetails,{event:e,timezone:'America/Toronto',onClose:()=>setE(null),onEdit:()=>window.editCalls=(window.editCalls||0)+1}))}createRoot(document.getElementById('root')).render(React.createElement(App));`
const mocks={
 '../lib/backend/session':`export const transport={request:async(path)=>{throw Error('Unexpected RPC '+path)}};`,
 '../lib/store':`export const queryClient={invalidateQueries:async()=>{}},calendarCacheCollection={};`,
 '@tanstack/react-db':`import {useEffect,useState} from 'react';export function useLiveQuery(){const[,set]=useState(0);useEffect(()=>{const changed=()=>set(n=>n+1);window.addEventListener('fixture-cache',changed);return()=>window.removeEventListener('fixture-cache',changed)},[]);return {data:window.calendarData?[window.calendarData]:[],isLoading:false,isError:false}}`,
 '../lib/config':`export const getConfig=()=>({demo:false});`,
 '../lib/planner-clock':`export const usePlannerClock=()=>({preferences:{timezone:'America/Toronto'}});`
}
const cacheDir=await mkdtemp(join(tmpdir(),'meos-calendar-detail-test-'))
const server=await createServer({configFile:false,cacheDir,server:{host:'127.0.0.1',port:0},plugins:[{name:'calendar-fixture',enforce:'pre',resolveId(id,importer){if(importer?.endsWith('/CalendarAgenda.tsx')&&mocks[id])return '\0mock:'+id;return id==='virtual:calendar-fixture'?'\0calendar-fixture':null},load:id=>id.startsWith('\0mock:')?mocks[id.slice(6)]:id==='\0calendar-fixture'?source:null,configureServer(server){server.middlewares.use('/fixture',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root"></div><script type="module" src="/@id/__x00__calendar-fixture"></script></body></html>')})}}]})
let browser
try{
 await server.listen();const base=server.resolvedUrls.local[0]
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
 for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:800},hasTouch:true,timezoneId:'Asia/Tokyo'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'fixture');const trigger=page.getByRole('button',{name:'Open fixture'});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:event.summary});await dialog.waitFor()
 assert.match(await dialog.innerText(),/Sep 26, 2026, 9:30 PM/);assert.match(await dialog.innerText(),/America\/Toronto/)
 assert.equal(await dialog.locator('input,textarea,select').count(),0);assert.equal(await dialog.getByRole('button').count(),1);assert.equal(await dialog.locator('script').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined)
 assert.equal(await dialog.getByRole('link').count(),2);assert.match(await dialog.innerText(),/<script>/)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true)
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
 // Native dialog backdrops retarget events to the dialog; its padding does too.
 // Require both ends of the gesture outside, and restore the opening control.
 await trigger.click();await dialog.waitFor();const bounds=await dialog.boundingBox();assert.ok(bounds)
 const inside={x:bounds.x+8,y:bounds.y+8},outside={x:2,y:2}
 assert.equal(await dialog.evaluate((el,p)=>document.elementFromPoint(p.x,p.y)===el,inside),true)
 await page.mouse.click(inside.x,inside.y);assert.equal(await dialog.isVisible(),true)
 await page.mouse.move(inside.x,inside.y);await page.mouse.down();await page.mouse.move(outside.x,outside.y);await page.mouse.up();assert.equal(await dialog.isVisible(),true)
 await page.mouse.move(outside.x,outside.y);await page.mouse.down();await page.mouse.move(inside.x,inside.y);await page.mouse.up();assert.equal(await dialog.isVisible(),true)
 await page.mouse.click(outside.x,outside.y);await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
 await trigger.click();await dialog.waitFor();await page.touchscreen.tap(inside.x,inside.y);assert.equal(await dialog.isVisible(),true)
 await page.touchscreen.tap(outside.x,outside.y);await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
 await page.evaluate(e=>window.showEvent({...e,start:{date:'2026-09-27'},end:{date:'2026-09-30'},location:'',description:''}),event);await dialog.waitFor();assert.match(await dialog.innerText(),/All day · 2026-09-27 – 2026-09-29/);assert.equal(await dialog.getByRole('heading',{name:'Location'}).count(),0);await page.keyboard.press('Escape')
 await page.evaluate(e=>window.showEvent({...e,role:'managed'}),event);await dialog.getByRole('button',{name:'Edit calendar event'}).click();assert.equal(await page.evaluate(()=>window.editCalls),1);await page.keyboard.press('Escape')
 await page.evaluate(e=>window.showEvent({...e,role:'managed',linked:true}),event);assert.equal(await dialog.getByRole('button',{name:'Edit calendar event'}).count(),0);await page.keyboard.press('Escape')
 // Exercise the real agenda's refreshed collection, not only the standalone dialog.
 await page.clock.install();await page.evaluate(e=>{window.calendarData={items:[{...e,role:'managed'}],drafts:[],status:'fresh'};window.mountAgenda()},event)
 await page.getByRole('button',{name:event.summary,exact:true}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Edit calendar event'}).count(),1)
 await page.evaluate(()=>{window.calendarData.items[0]={...window.calendarData.items[0],description:'Fresh cached description'};window.calendarData.drafts=[{id:'fixture',state:'pending'}]});await page.evaluate(()=>window.dispatchEvent(new Event('fixture-cache')));await dialog.getByText('Fresh cached description',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Edit calendar event'}).count(),0)
 await page.evaluate(()=>{window.calendarData.drafts=[];window.calendarData.items[0]={...window.calendarData.items[0],linked:true}});await page.evaluate(()=>window.dispatchEvent(new Event('fixture-cache')));assert.equal(await dialog.getByRole('button',{name:'Edit calendar event'}).count(),0)
 await page.evaluate(()=>{window.calendarData.items=[]});await page.evaluate(()=>window.dispatchEvent(new Event('fixture-cache')));await dialog.waitFor({state:'hidden'})
 assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS cached calendar details: read-only primary, managed edit, linked guard, safe text/links, date/time zones, exclusive all-day end, keyboard focus/Escape, mouse/touch backdrop dismissal, padding/drag protection, empty fields, mobile/desktop')
}finally{await browser?.close();await server.close();await rm(cacheDir,{recursive:true,force:true})}
