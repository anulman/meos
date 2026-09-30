// SPDX-License-Identifier: Apache-2.0
// Exact built client with synthetic loopback APIs. No production data or credentials.
import http from 'node:http'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const day='2026-09-27',stamp=1790524800000,id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`
const envelope=value=>({value,revision:1,createdAt:day+'T00:00:00Z',updatedAt:day+'T00:00:00Z'})
const schedule=time=>({date:day,time,timezone:'America/Montreal'})
const tasks=[{id:id(1),title:'Ordinary task',schedule:schedule('09:00')},...['legacy','car','walk','bicycle','plane','boat'].map((mode,i)=>({id:id(i+2),title:`${mode} commute`,type:'commute',...(mode==='legacy'?{}:{transportMode:mode}),schedule:schedule(`${10+i}:00`),completed:true}))].map(t=>({notes:{type:'doc'},completed:false,priority:'none',durationMinutes:30,...t}))
const writes=[]
const routines=[{id:id(10),title:'Bedtime',notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day},timezone:'America/Montreal'},{id:id(11),title:'Morning care',notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day},timezone:'America/Montreal'}]
const occurrences=routines.map((r,i)=>({id:id(20+i),routineId:r.id,title:r.title,date:i?day:'2026-09-26',schedule:schedule(i?'08:00':'00:00'),durationMinutes:30,completed:false,notes:{type:'doc'}}))
const event=(name,start,end,extra={})=>({id:name,role:'primary',etag:'1',summary:name,location:'',description:'Bring your notes',start:{dateTime:`${day}T${start}:00-04:00`},end:{dateTime:`${day}T${end}:00-04:00`},linked:false,recurring:false,...extra})
const calendar=[event('Design conversation','10:30','11:30',{location:'Studio'}),event('Nested check-in','10:45','11:00'),event('Linked duplicate','09:00','09:30',{linked:true}),event('All day reference','00:00','23:59',{start:{date:day},end:{date:'2026-09-28'}})]
const prefs=envelope({timezone:'America/Montreal',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}})
const revisions={tasks:1,projects:0,routines:1,occurrences:1,outcomes:0,periodNotes:0,preferences:1}
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store')
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let body
  if(req.method!=='GET'){
   let raw='';for await(const part of req)raw+=part;const input=JSON.parse(raw);writes.push({path:u.pathname,input});
   const value=input.value;assert.equal(req.method,'PUT');assert.equal(u.pathname,`/api/meos/v1/resources/tasks/${value.id}`);
   const index=tasks.findIndex(t=>t.id===value.id);assert.notEqual(index,-1);tasks[index]=value;
   return res.end(JSON.stringify({...envelope(value),revision:input.expectedRevision+1}));
  }
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
  await agenda.getByRole('button',{name:'legacy commute',exact:true}).waitFor()
  assert.equal(await agenda.getByRole('button',{name:/^(Complete|Reopen).*commute/}).count(),0)
  assert.equal(await agenda.getByRole('button',{name:'Complete Ordinary task'}).count(),1)
  for(const mode of ['car','walk','bicycle','plane','boat'])assert.ok(await agenda.getByRole('img',{name:`Commute by ${mode}`,exact:true}).count()>=1)
  assert.equal(await agenda.locator('.done').count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await fs.promises.mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/commute-${width}.png`,fullPage:true})
  const title=agenda.getByRole('button',{name:'legacy commute',exact:true});await title.focus();await page.keyboard.press('Enter')
  const dialog=page.getByRole('dialog',{name:'Edit task',exact:true});await dialog.waitFor()
  assert.equal(await dialog.getByRole('button',{name:/Mark (incomplete|complete)/}).count(),0)
  const mode=dialog.getByLabel('Mode of transport');assert.equal(await mode.inputValue(),width===320?'car':'walk')
  assert.deepEqual(await mode.locator('option').allTextContents(),['Car','Walk','Bicycle','Plane','Boat'])
  await mode.selectOption('walk');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await dialog.waitFor({state:'hidden'})
  assert.equal(writes.at(-1).input.value.transportMode,'walk');assert.equal(writes.at(-1).input.value.completed,true)
  await page.reload();await agenda.getByRole('button',{name:'legacy commute',exact:true}).click();await dialog.waitFor()
  assert.equal(await dialog.getByLabel('Mode of transport').inputValue(),'walk')
  await dialog.getByLabel('Task type',{exact:true}).selectOption('')
  assert.equal(await dialog.getByLabel('Mode of transport').count(),0)
  assert.equal(await dialog.getByRole('button',{name:'Mark incomplete',exact:true}).count(),1)
  await dialog.getByLabel('Task type',{exact:true}).selectOption('commute')
  assert.equal(await dialog.getByRole('button',{name:/Mark (incomplete|complete)/}).count(),0)
  await page.screenshot({path:`artifacts/commute-editor-${width}.png`})
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS commute modes/default, no completion/status styling, retained ordinary task control, keyboard editor, mode PUT persistence/reload, unchanged legacy completion, 320/390/1280px without overflow')
}finally{await browser.close();await new Promise(r=>server.close(r))}
