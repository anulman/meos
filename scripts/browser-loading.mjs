// SPDX-License-Identifier: Apache-2.0
// Built SPA against loopback synthetic APIs; invoked only by the isolated launcher.
import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const delay=ms=>new Promise(r=>setTimeout(r,ms)),id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const day='2026-09-27',stamp=1790524800000,envelope=value=>({value,revision:1,createdAt:day+'T00:00:00Z',updatedAt:day+'T00:00:00Z'});
const prefs=envelope({timezone:'America/Montreal',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}});
let requests=[],count=0,occurrenceDelay=0,owner=900,authenticated=true,demo=false,revision=1,failTaskOnce=false,prefRevision=1;
const revisions=()=>({tasks:revision,projects:0,routines:0,occurrences:0,outcomes:0,periodNotes:0,preferences:prefRevision});
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),rec={path:u.pathname+u.search,method:req.method,start:performance.now()};requests.push(rec);res.setHeader('Cache-Control','no-store');let body;
 if(u.pathname.startsWith('/api/')){
  await delay(100+(u.pathname.endsWith('/occurrences')?occurrenceDelay:0));res.setHeader('Content-Type','application/json');
  if(!authenticated){res.statusCode=401;body={error:{code:'unauthenticated',message:'Sign in'}}}
  else if(u.pathname.endsWith('/bootstrap'))body={user:{id:id(owner)},csrf:'isolated-fixture',preferences:prefs,revisions:revisions()};
  else if(u.pathname.endsWith('/session'))body={user:{id:id(owner)},csrf:'isolated-fixture'};
  else if(u.pathname.endsWith('/revisions'))body=revisions();
  else if(u.pathname.endsWith('/preferences'))body=prefs;
  else if(u.pathname.endsWith('/resources/tasks')&&failTaskOnce){failTaskOnce=false;res.statusCode=503;body={error:{code:'unavailable',message:'Synthetic transient failure'}}}
  else if(u.pathname.includes('/resources/')){const k=u.pathname.split('/').at(-1);body={items:k==='routines'?Array.from({length:count},(_,i)=>envelope({id:id(i+10),title:'Fixture routine '+i,notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:day,status:'validated',kind:'fixed',weekdays:[0,1,2,3,4,5,6],intervalWeeks:1},timezone:'America/Montreal'})):k==='tasks'?[envelope({id:id(1),title:`Fixture task ${owner}`,notes:{type:'doc'},completed:false,priority:'none',schedule:{date:day,time:'12:00',timezone:'America/Montreal'}})]:[]}}
  else if(u.pathname.endsWith('/operations/plan_routines')){let text='';for await(const part of req)text+=part;rec.body=JSON.parse(text);body={routines:rec.body.routines.length,created:0,preserved:0}}
  else if(u.pathname.endsWith('/calendar-window'))body={id:'calendar',available:true,state:'connected',syncActive:true,lastSyncAt:stamp,plannerLastSyncAt:stamp,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:stamp,conflicts:[]},sequence:1,status:'fresh',unchanged:u.searchParams.has('sequence'),items:u.searchParams.has('sequence')?[]:[{id:'fixture',role:'primary',etag:'1',summary:'Fixture calendar',location:'',description:'',start:{dateTime:day+'T18:00:00Z'},end:{dateTime:day+'T19:00:00Z'},linked:false,recurring:false}]};
  else body={state:'connected',syncActive:true};res.end(JSON.stringify(body));
 }else if(u.pathname==='/mockServiceWorker.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('public/mockServiceWorker.js'))}
 else if(u.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.MEOS_CONFIG={demo:${demo},accessGated:true,timezone:"America/Montreal"}`)}
 else{const file='dist/client/'+(u.pathname.startsWith('/assets/')?u.pathname.slice(1):'_shell.html');if(u.pathname.startsWith('/assets/'))res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}rec.end=performance.now();
 }catch(error){res.statusCode=500;res.end(String(error))}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']}),results=[];
let activePage;
try{
 for(const n of [0,3,6]){
  count=n;const context=await browser.newContext(),page=await context.newPage(),errors=[];activePage=page;page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
  await page.addInitScript(()=>{const OriginalDate=Date,realStart=OriginalDate.now();window.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:[1790524800000+OriginalDate.now()-realStart]))}static now(){return 1790524800000+OriginalDate.now()-realStart}};window.milestones={};new MutationObserver(()=>{const text=document.body?.innerText??'';for(const [key,match]of Object.entries({task:'Fixture task',calendar:'Fixture calendar'}))if(text.includes(match)&&!window.milestones[key])window.milestones[key]=performance.now()}).observe(document,{subtree:true,childList:true,characterData:true})});
  for(const mode of ['cold','http-cache']){
   requests=[];const start=performance.now();if(mode==='cold')await page.goto(origin);else await page.reload();
   await page.getByRole('button',{name:'Fixture calendar',exact:true}).waitFor();await page.getByRole('button',{name:'Fixture task 900',exact:true}).waitFor();await delay(150);
   assert.equal(requests.filter(r=>r.method!=='GET').length,0,'read path writes');assert.equal(requests.filter(r=>r.path.endsWith('/bootstrap')).length,1);assert.equal(requests.filter(r=>r.path.endsWith('/preferences')||r.path.endsWith('/session')).length,0);
   const starts=['/resources/tasks','/resources/occurrences','/calendar-window'].map(part=>requests.find(r=>r.path.startsWith('/api/')&&r.path.includes(part))?.start);assert.ok(starts.every(Number.isFinite));assert.ok(Math.max(...starts)-Math.min(...starts)<35,'independent wave skew');
   const metrics=await page.evaluate(()=>({milestones:window.milestones,assets:performance.getEntriesByType('resource').filter(r=>/\/assets\/.*\.(js|css)$/.test(r.name)).map(r=>({name:r.name,transfer:r.transferSize}))}));if(mode==='http-cache')assert.ok(metrics.assets.every(r=>r.transfer===0),'HTTP asset cache');
   results.push({n,mode,...metrics,requests:requests.map(r=>({...r,start:r.start-start,end:r.end-start}))});
  }
  requests=[];await page.getByRole('link',{name:'Week',exact:true}).hover();await delay(180);await page.getByRole('link',{name:'Week',exact:true}).click();await page.getByRole('heading',{name:'This week',exact:true}).waitFor();
  await page.getByRole('link',{name:'Today',exact:true}).hover();await delay(100);
  const warm=await page.evaluate(async()=>{const start=performance.now();document.querySelector('a[href="/"]').click();await new Promise(resolve=>{const check=()=>{if(document.querySelector('h1')?.textContent==='Today'&&document.body.innerText.includes('Fixture task'))resolve();else requestAnimationFrame(check)};check()});return performance.now()-start});assert.ok(warm<100,`warm render ${warm}`);assert.equal(requests.filter(r=>r.method!=='GET').length,0);results.push({n,mode:'warm',ms:warm});
  await page.goBack();await page.getByRole('heading',{name:'This week',exact:true}).waitFor();assert.equal(requests.filter(r=>r.method!=='GET').length,0);
  assert.equal(await page.getByText('Plan routine instances',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:/Choose routines to plan|Plan selected routines/}).count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();await page.addInitScript(()=>{const D=Date,start=D.now();window.Date=class extends D{constructor(...a){super(...(a.length?a:[1790524800000+D.now()-start]))}static now(){return 1790524800000+D.now()-start}}});
 activePage=page;occurrenceDelay=1200;requests=[];await page.goto(origin);await page.getByRole('button',{name:'Fixture task 900',exact:true}).waitFor();await page.getByRole('button',{name:'Fixture calendar',exact:true}).waitFor();assert.ok(requests.find(r=>r.path.includes('/occurrences'))&&!requests.find(r=>r.path.includes('/occurrences')).end,'occurrence delay must not gate useful rows');occurrenceDelay=0;
 await delay(1300);requests=[];revision++;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await delay(400);assert.equal(requests.filter(r=>r.path.includes('/resources/tasks')).length,1);requests=[];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await delay(350);assert.equal(requests.filter(r=>r.path.includes('/resources/tasks')).length,0);
 failTaskOnce=true;revision++;requests=[];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await delay(400);assert.equal(requests.filter(r=>r.path.includes('/resources/tasks')).length,1);requests=[];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await delay(400);assert.equal(requests.filter(r=>r.path.includes('/resources/tasks')).length,1,'failed refresh remains pending');
 prefRevision++;prefs.revision=prefRevision;prefs.value.timezone='UTC';requests=[];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await delay(450);assert.equal(requests.filter(r=>r.path.endsWith('/preferences')).length,1,'external preferences must fetch');assert.ok(requests.some(r=>r.path.includes('timezone=UTC')),'clock consumes shared preference update');
 owner=901;await page.evaluate(()=>window.dispatchEvent(new Event('meos-session-ended')));await page.getByRole('button',{name:'Fixture task 901',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Fixture task 900',exact:true}).count(),0);
 authenticated=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Connecting to MeOS'}).waitFor();assert.equal(await page.getByRole('button',{name:'Fixture task 901',exact:true}).count(),0);await context.close();
 demo=true;authenticated=true;const dc=await browser.newContext(),dp=await dc.newPage();activePage=dp;const demoErrors=[];dp.on('pageerror',e=>demoErrors.push(e.message));requests=[];await dp.goto(origin);await dp.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).waitFor();await dp.getByRole('link',{name:'Week',exact:true}).click();await dp.getByRole('heading',{name:'This week',exact:true}).waitFor();await dp.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).click();await dp.getByRole('dialog',{name:'Edit task'}).waitFor();await dp.getByRole('textbox',{name:'Notes',exact:true}).waitFor();await dp.keyboard.press('Escape');assert.deepEqual(demoErrors,[]);assert.equal(requests.filter(r=>r.path.startsWith('/api/meos/')).length,0);await dc.close();
 fs.writeFileSync('loading-evidence.json',JSON.stringify({results,delayedOccurrenceIndependent:true,revisionDeduplication:true,ownerIsolation:true,expiredSessionHidden:true},null,2));console.log(JSON.stringify(results.map(r=>({n:r.n,mode:r.mode,ms:r.ms,milestones:r.milestones}))));
}catch(error){console.log('DEBUG',JSON.stringify({requests,text:await activePage?.locator('body').innerText().catch(()=>''),errors:await activePage?.evaluate(()=>window.milestones).catch(()=>null)}));throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
