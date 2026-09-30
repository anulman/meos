// Exact built client, synthetic revisioned API. No production identity or data.
import http from 'node:http'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const day='2026-09-30',id='00000000-0000-4000-8000-000000000001',time=day+'T12:00:00Z'
const doc=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
let row={value:{id,kind:'day',period:{start:day,end:day},notes:doc('Existing note')},revision:7,createdAt:time,updatedAt:time}
const preferences={value:{timezone:'UTC',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}},revision:1,createdAt:time,updatedAt:time}
const revisions=()=>({tasks:0,projects:0,routines:0,occurrences:0,outcomes:0,periodNotes:row.revision,preferences:1})
let delay=0,fail=false,inFlight=0,maxFlight=0;const writes=[]
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store')
 if(url.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let body
  if(url.pathname.endsWith('/commands/period-note')){
   assert.equal(req.method,'POST');let text='';for await(const chunk of req)text+=chunk
   const input=JSON.parse(text);writes.push(input);inFlight++;maxFlight=Math.max(maxFlight,inFlight)
   await new Promise(r=>setTimeout(r,delay));inFlight--
   if(fail){fail=false;res.statusCode=503;body={code:'unavailable',message:'Synthetic unavailable'}}
   else if(input.expectedRevision!==row.revision){res.statusCode=409;body={code:'conflict',message:'Synthetic conflict'}}
   else {row={...row,value:input.value,revision:row.revision+1};body=row}
  }else{
   assert.equal(req.method,'GET')
   if(url.pathname.endsWith('/bootstrap'))body={user:{id},csrf:'synthetic',preferences,revisions:revisions()}
   else if(url.pathname.endsWith('/revisions'))body=revisions()
   else if(url.pathname.includes('/resources/'))body={items:url.pathname.endsWith('/periodNotes')?[row]:[]}
   else if(url.pathname.endsWith('/calendar-window'))body={id:'calendar',available:false,state:'disconnected',syncActive:false,lastSyncAt:null,plannerLastSyncAt:null,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:null,conflicts:[]},sequence:1,status:'fresh',unchanged:false,items:[]}
   else body={state:'disconnected',syncActive:false}
  }
  return res.end(JSON.stringify(body))
 }
 if(url.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.MEOS_CONFIG={demo:false,accessGated:true,timezone:"UTC"}')}
 const file='dist/client/'+(url.pathname.startsWith('/assets/')?url.pathname.slice(1):'_shell.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))
}catch(error){res.statusCode=500;res.end(String(error))}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.clock.install({time:new Date(time)});await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByRole('button',{name:'Day Notes',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'Day Notes',exact:true}),editor=sheet.getByRole('textbox',{name:'Period notes'})
 assert.equal((await editor.innerText()).trim(),'Existing note')
 delay=700;await editor.fill('First revision');await page.waitForResponse(r=>r.url().endsWith('/commands/period-note'));await sheet.getByRole('status').filter({hasText:'Saved'}).waitFor()
 await editor.fill('Second revision');await sheet.getByRole('button',{name:'Close planner details'}).click();await sheet.waitFor({state:'hidden'})
 assert.deepEqual(writes.map(w=>w.expectedRevision),[7,8]);assert.equal(row.revision,9)
 await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.equal((await editor.innerText()).trim(),'Second revision')
 // Another author commits after the editor opens. Neither autosave nor Retry may
 // substitute the collection's refreshed revision for the editor's captured one.
 row={...row,revision:10,value:{...row.value,notes:doc('Another author')}}
 await editor.fill('My conflicting draft');await sheet.getByRole('button',{name:'Close planner details'}).click();await sheet.getByRole('alert').filter({hasText:'changed elsewhere'}).waitFor()
 assert.equal(row.value.notes.content[0].content[0].text,'Another author');assert.equal((await editor.innerText()).trim(),'My conflicting draft')
 await sheet.getByRole('button',{name:'Retry',exact:true}).click();await sheet.getByRole('alert').waitFor();assert.equal(writes.at(-1).expectedRevision,9);assert.equal(row.revision,10)
 await Promise.all([page.waitForEvent('dialog').then(d=>d.accept()),sheet.getByRole('button',{name:'Discard draft'}).click()]);await sheet.waitFor({state:'hidden'})
 await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.equal((await editor.innerText()).trim(),'Another author')
 fail=true;await editor.fill('Recoverable failure');await sheet.getByRole('button',{name:'Close planner details'}).click();await sheet.getByRole('alert').waitFor();assert.equal(row.revision,10)
 await sheet.getByRole('button',{name:'Retry',exact:true}).click();await sheet.getByRole('status').filter({hasText:'Saved'}).waitFor();assert.equal(row.revision,11)
 assert.equal(maxFlight,1);assert.deepEqual(errors,[])
 console.log('PASS notes revisions: real repository chains 7→8→9, refuses external revision10 overwrite including retry, preserves failed draft and retries without stale writes')
}finally{await browser.close();server.close()}
