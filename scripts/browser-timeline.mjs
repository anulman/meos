// SPDX-License-Identifier: Apache-2.0
// Exact built client with synthetic loopback APIs. No production data or credentials.
import http from 'node:http'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const day='2026-09-27',stamp=1790524800000,id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`
const envelope=value=>({value,revision:1,createdAt:day+'T00:00:00Z',updatedAt:day+'T00:00:00Z'})
const schedule=time=>({date:day,time,timezone:'America/Montreal'})
const tasks=[{id:id(1),title:'Write the first draft',schedule:schedule('09:00'),durationMinutes:30},{id:id(2),title:'Afternoon focus',schedule:schedule('12:31'),durationMinutes:30}].map(t=>({...t,notes:{type:'doc'},completed:false,priority:'none'}))
const routines=[{id:id(10),title:'Bedtime',notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day},timezone:'America/Montreal'},{id:id(11),title:'Morning care',notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day},timezone:'America/Montreal'}]
const occurrences=routines.map((r,i)=>({id:id(20+i),routineId:r.id,title:r.title,date:i?day:'2026-09-26',schedule:schedule(i?'08:00':'00:00'),durationMinutes:30,completed:false,notes:{type:'doc'}}))
const event=(name,start,end,extra={})=>({id:name,role:'primary',etag:'1',summary:name,location:'',description:'Bring your notes',start:{dateTime:`${day}T${start}:00-04:00`},end:{dateTime:`${day}T${end}:00-04:00`},linked:false,recurring:false,...extra})
const calendar=[event('Design conversation','10:30','11:30',{location:'Studio'}),event('Nested check-in','10:45','11:00'),event('Linked duplicate','09:00','09:30',{linked:true}),event('All day reference','00:00','23:59',{start:{date:day},end:{date:'2026-09-28'}})]
const prefs=envelope({timezone:'America/Montreal',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}})
const revisions={tasks:1,projects:0,routines:1,occurrences:1,outcomes:0,periodNotes:0,preferences:1}
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store')
 if(u.pathname.startsWith('/api/')){
  assert.equal(req.method,'GET','The fixture must remain read-only');res.setHeader('Content-Type','application/json');let body
  if(u.pathname.endsWith('/bootstrap'))body={user:{id:id(900)},csrf:'synthetic',preferences:prefs,revisions}
  else if(u.pathname.endsWith('/revisions'))body=revisions
  else if(u.pathname.includes('/resources/'))body={items:({tasks,routines,occurrences}[u.pathname.split('/').at(-1)]??[]).map(envelope)}
  else if(u.pathname.endsWith('/calendar-window'))body={id:'calendar',available:true,state:'connected',syncActive:true,lastSyncAt:stamp,plannerLastSyncAt:stamp,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:stamp,conflicts:[]},sequence:1,status:'fresh',unchanged:false,items:calendar}
  else body={state:'connected',syncActive:true}
  return res.end(JSON.stringify(body))
 }
 if(u.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.MEOS_CONFIG={demo:false,accessGated:true,timezone:"America/Montreal"}')}
 const file='dist/client/'+(u.pathname.startsWith('/assets/')?u.pathname.slice(1):'_shell.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))
 }catch(error){res.statusCode=500;res.end(String(error))}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
try{
 for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});await page.clock.install({time:new Date(day+'T16:00:00Z')})
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const agenda=page.getByRole('region',{name:'Scheduled agenda'})
  await agenda.getByRole('button',{name:'Design conversation',exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e})
  await agenda.getByRole('button',{name:'Complete Bedtime on 2026-09-26',exact:true}).waitFor()
  assert.deepEqual(await agenda.locator('.timeline-gap').allTextContents(),['7 hr 30 min gap','30 min gap','1 hr gap','1 hr 1 min gap'])
  assert.deepEqual(await agenda.locator('.timeline-gap-long').allTextContents(),['7 hr 30 min gap','1 hr 1 min gap'])
  assert.equal(await agenda.getByText('All day reference').count(),0);assert.equal(await agenda.getByText('Linked duplicate').count(),0)
  assert.deepEqual(await agenda.locator('.task-title,.routine-card h2 button>span').allTextContents(),['Bedtime','Morning care','Write the first draft30 min','Design conversation','Nested check-in','Afternoon focus30 min'])
  for(const button of await agenda.locator('.task-title,.agenda-card-details').all()){
   const title=await button.locator(':scope > span').boundingBox(),meta=await button.locator(':scope > small').boundingBox()
   assert.equal(await button.locator('small').evaluate(e=>getComputedStyle(e).marginTop),'4px')
   assert.ok(Math.abs(meta.y-title.y-title.height-5)<1)
   assert.ok((await button.boundingBox()).height>=44)
  }
  assert.equal(await agenda.getByRole('button',{name:'Edit instance Bedtime'}).locator('small').innerText(),'30 min · Routine')
  const gapBoxes=await agenda.locator('.timeline-gap').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height))
  assert.deepEqual(gapBoxes,[48,28,28,48])
  const card=agenda.locator('.calendar-card').first()
  const background=await card.evaluate(e=>getComputedStyle(e).backgroundColor)
  assert.notEqual(background,await agenda.locator('.routine-card:not(.calendar-card)').first().evaluate(e=>getComputedStyle(e).backgroundColor))
  const title=card.getByRole('button',{name:'Design conversation',exact:true});const box=await title.boundingBox();assert.ok(box.height>=44)
  await title.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Design conversation',exact:true});await dialog.waitFor()
  assert.equal(await dialog.getByRole('button',{name:'Edit calendar event'}).count(),0)
  await page.keyboard.press('Escape');assert.equal(await title.evaluate(e=>e===document.activeElement),true)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await fs.promises.mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/timeline-${width}.png`,fullPage:true})
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS exact built mixed timeline at 320/390/1280px: overnight, <=60/>60 boundary, nested overlaps, Calendar/all-day/linked filtering, chronological order, distinct surfaces, keyboard read-only details, focus restoration, bounded spacing, no overflow')
}finally{await browser.close();await new Promise(r=>server.close(r))}
