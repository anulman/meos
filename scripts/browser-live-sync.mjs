// SPDX-License-Identifier: Apache-2.0
// Built SPA against loopback synthetic APIs; invoked only by the isolated launcher.
import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const delay=ms=>new Promise(r=>setTimeout(r,ms)),id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const day='2026-09-27',stamp=1790524800000,envelope=value=>({value,revision:1,createdAt:day+'T00:00:00Z',updatedAt:day+'T00:00:00Z'});
const prefs=envelope({timezone:'America/Montreal',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}});
let taskTitle='Original task',taskDeleted=false,calendarTitle='Original calendar',calendarSequence=1,taskDelay=0,rejectStreamOnce=false,rejectStream=false;const streams=new Set();
const notify=kind=>{for(const stream of streams)stream.write('data: '+JSON.stringify({Update:{kind},seq:1})+'\n\n')};
let requests=[],count=0,occurrenceDelay=0,owner=900,authenticated=true,demo=false,revision=1,failTaskOnce=false,prefRevision=1;
const revisions=()=>({tasks:revision,projects:0,routines:0,occurrences:0,outcomes:0,periodNotes:0,preferences:prefRevision});
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),rec={path:u.pathname+u.search,method:req.method,start:performance.now()};requests.push(rec);res.setHeader('Cache-Control','no-store');let body;
 if(u.pathname==='/api/meos/v1/changes'&&(rejectStreamOnce||rejectStream)){rejectStreamOnce=false;res.writeHead(503);res.end();return}
 if(u.pathname==='/api/meos/v1/changes'&&authenticated){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': connected\nretry: 100\n\n');streams.add(res);res.on('close',()=>streams.delete(res));return}
 if(u.pathname.startsWith('/api/')){
  await delay(100+(u.pathname.endsWith('/occurrences')?occurrenceDelay:0));res.setHeader('Content-Type','application/json');
  if(!authenticated){res.statusCode=401;body={error:{code:'unauthenticated',message:'Sign in'}}}
  else if(u.pathname.endsWith('/bootstrap'))body={user:{id:id(owner)},csrf:'isolated-fixture',preferences:prefs,revisions:revisions()};
  else if(u.pathname.endsWith('/session'))body={user:{id:id(owner)},csrf:'isolated-fixture'};
  else if(u.pathname.endsWith('/revisions'))body=revisions();
  else if(u.pathname.endsWith('/preferences'))body=prefs;
  else if(u.pathname.endsWith('/resources/tasks')&&failTaskOnce){failTaskOnce=false;res.statusCode=503;body={error:{code:'unavailable',message:'Synthetic transient failure'}}}
  else if(u.pathname.includes('/resources/')){const k=u.pathname.split('/').at(-1);body={items:k==='routines'?Array.from({length:count},(_,i)=>envelope({id:id(i+10),title:'Fixture routine '+i,notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day,status:'validated',kind:'fixed',weekdays:[0,1,2,3,4,5,6],intervalWeeks:1},timezone:'America/Montreal'})):k==='tasks'&&!taskDeleted?[envelope({id:id(1),title:taskTitle,notes:{type:'doc'},completed:false,priority:'none',schedule:{date:day,time:'12:00',timezone:'America/Montreal'}})]:[]}}
  else if(u.pathname.endsWith('/operations/plan_routines')){let text='';for await(const part of req)text+=part;rec.body=JSON.parse(text);body={routines:rec.body.routines.length,created:0,preserved:0}}
  else if(u.pathname.endsWith('/calendar-window'))body={id:'calendar',available:true,state:'connected',syncActive:true,lastSyncAt:stamp,plannerLastSyncAt:stamp,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:stamp,conflicts:[]},sequence:calendarSequence,status:'fresh',unchanged:Number(u.searchParams.get('sequence'))===calendarSequence,items:Number(u.searchParams.get('sequence'))===calendarSequence?[]:[{id:'fixture',role:'primary',etag:'1',summary:calendarTitle,location:'',description:'',start:{dateTime:day+'T18:00:00Z'},end:{dateTime:day+'T19:00:00Z'},linked:false,recurring:false}]};
  else body={state:'connected',syncActive:true};if(u.pathname.endsWith('/resources/tasks')&&taskDelay)await delay(taskDelay);res.end(JSON.stringify(body));
 }else if(u.pathname==='/mockServiceWorker.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('public/mockServiceWorker.js'))}
 else if(u.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.MEOS_CONFIG={demo:${demo},accessGated:true,timezone:"America/Montreal"}`)}
 else{const file='dist/client/'+(u.pathname.startsWith('/assets/')?u.pathname.slice(1):'_shell.html');if(u.pathname.startsWith('/assets/'))res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}rec.end=performance.now();
 }catch(error){res.statusCode=500;res.end(String(error))}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']}),results=[];
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-09-27T12:00:00Z')});
 await page.goto(origin);
 await page.getByRole('button',{name:'Original task',exact:true}).waitFor();
 await page.getByRole('button',{name:'Original calendar',exact:true}).waitFor();
 await delay(400);assert.equal(streams.size,1);
 const navigation=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
 let start=performance.now();taskTitle='External task update';revision++;notify('tasks');
 await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:3000});results.push({promptTaskMs:performance.now()-start});
 calendarTitle='External calendar update';calendarSequence++;notify('calendar-window');
 await page.getByRole('button',{name:calendarTitle,exact:true}).waitFor({timeout:3000});
 // Loaded editor stays a draft while its read-only task projection changes.
 await page.getByRole('button',{name:taskTitle,exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit task'});await dialog.waitFor();
 const title=dialog.getByRole('textbox',{name:'Task name',exact:true});await title.fill('Unsaved draft');
 taskTitle='Remote during draft';revision++;notify('tasks');await delay(400);assert.equal(await title.inputValue(),'Unsaved draft');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:3000});
 // A second notification during a deliberately stale read must trigger a trailing read.
 taskDelay=500;taskTitle='Intermediate update';notify('tasks');await delay(250);taskTitle='Trailing update';notify('tasks');
 await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:3000});taskDelay=0;
 // A terminal EventSource error during a read must still renew and reopen.
 taskDelay=600;taskTitle='Read across closed stream';notify('tasks');await delay(200);rejectStreamOnce=true;for(const stream of streams)stream.end();await delay(1100);taskDelay=0;
 taskTitle='After terminal reconnect';notify('tasks');await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:4000});assert.equal(streams.size,1);
 // Terminal endpoint failures use Query backoff, not a reconnect busy loop.
 rejectStream=true;for(const stream of streams)stream.end();await delay(400);const attemptCount=()=>requests.filter(r=>r.path==='/api/meos/v1/changes').length;const before=attemptCount();await page.clock.runFor(900);await delay(100);assert.ok(attemptCount()-before<=1,'bounded terminal reconnect attempts');rejectStream=false;await page.clock.runFor(2500);await delay(200);taskTitle='After bounded reconnect';notify('tasks');await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:4000});
 // Retry a failed authoritative read without requiring another server notification.
 failTaskOnce=true;taskTitle='Recovered after read error';notify('tasks');await delay(250);await page.clock.runFor(1500);
 await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:3000});
 // Missed changes while disconnected are reconciled on open (native has no replay).
 for(const stream of streams)stream.end();taskTitle='Missed while disconnected';calendarTitle='Missed calendar';calendarSequence++;revision++;
 await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({timeout:4000});await page.getByRole('button',{name:calendarTitle,exact:true}).waitFor({timeout:4000});
 taskDeleted=true;notify('tasks');await page.getByRole('button',{name:taskTitle,exact:true}).waitFor({state:'hidden',timeout:3000});
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),navigation);assert.equal(requests.filter(r=>r.path.endsWith('/revisions')).length,0);
 // Session loss closes the stream and hides all previous-owner records.
 authenticated=false;for(const stream of streams)stream.end();await page.getByRole('heading',{name:'Connecting to MeOS'}).waitFor();await delay(200);assert.equal(streams.size,0);
 assert.deepEqual(errors,[]);
 const result={syntheticBackend:true,noNavigation:true,promptTaskAndCalendar:true,trailingRefresh:true,failedReadRetry:true,reconnectRecovery:true,deletion:true,draftPreserved:true,sessionFenced:true,results};
 fs.writeFileSync('live-sync-evidence.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();for(const stream of streams)stream.end();server.closeAllConnections();await new Promise(r=>server.close(r))}
