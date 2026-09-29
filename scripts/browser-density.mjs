import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3182'
try{
 for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).waitFor()
 assert.doesNotMatch(await page.locator('.today-view').innerText(),/Anytime|Tomorrow/)
 const fixtures=await page.evaluate(async()=>await(await fetch('/api/tasks')).json());assert.ok(fixtures.filter(t=>t.schedule).every(t=>/^\d{2}:\d{2}$/.test(t.schedule.time)))
 const task=fixtures.find(t=>t.schedule&&!t.completed);const rejected=await page.evaluate(async task=>{const copy=structuredClone(task);delete copy.schedule.time;return(await fetch('/api/tasks/'+copy.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(copy)})).status},task);assert.equal(rejected,400)
 assert.equal(await page.locator('.completed-tasks').count(),0)
 assert.equal(await page.locator('.agenda-progress').innerText(),'1 of 4 tasks completed')
 const card=page.locator('.timeline .task').first();assert.ok((await card.boundingBox()).height<=80);assert.equal(await card.locator('.task-kind').count(),0)
 await page.evaluate(()=>{const original=window.fetch;let fail=true;window.fetch=(input,init)=>{if(fail&&String(input).includes('/tasks/')&&['PUT','PATCH'].includes(init?.method)){fail=false;return Promise.resolve(new Response(JSON.stringify({error:'Simulated completion failure'}),{status:503,headers:{'Content-Type':'application/json'}}))}return original(input,init)}})
 await page.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Could not save/);await page.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).waitFor();assert.equal(await page.locator('.agenda-progress').innerText(),'1 of 4 tasks completed')
 const completion=page.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true});const box=await completion.boundingBox();assert.ok(box.width>=44&&box.height>=44);await completion.click();await page.getByText('2 of 4 tasks completed',{exact:true}).waitFor();await page.getByRole('button',{name:'Reopen Choose herbs for the balcony',exact:true}).click();await page.getByText('1 of 4 tasks completed',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Edit task',exact:true});await sheet.getByLabel('Time (required when scheduled)',{exact:true}).fill('');await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.getByRole('alert').waitFor();assert.match(await sheet.getByRole('alert').innerText(),/Choose a time/);assert.equal(await sheet.getByLabel('Task name').inputValue(),'Choose herbs for the balcony');await sheet.getByLabel('Time (required when scheduled)',{exact:true}).fill('11:15');await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.waitFor({state:'hidden'});await page.getByText('11:15',{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/compact-today-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS density: compact cards, timed fixtures/API/form, draft recovery, inline completion/reopen/progress, 44px targets, desktop/mobile overflow')
}finally{await browser.close()}
