import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3180'
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 // Simulate legacy server data that cannot be newly saved under the current contract.
 await page.addInitScript(()=>{const original=window.fetch;window.fetch=async(input,init)=>{
  const response=await original(input,init)
  if(String(input).endsWith('/api/tasks')&&(!init?.method||init.method==='GET')&&response.ok){
   const tasks=await response.json();const schedule=tasks.find(t=>t.schedule).schedule
   for(const [id,broken] of [['legacy-untimed',{...schedule,time:undefined}],['legacy-invalid',{...schedule,time:'25:00'}],['legacy-zone',{...schedule,timezone:'invalid/zone'}]])
    tasks.push({id,title:id,completed:true,priority:'high',schedule:broken,notes:{type:'doc'}})
   return new Response(JSON.stringify(tasks),{status:200,headers:{'Content-Type':'application/json'}})
  }return response
 }})
 await page.goto(base);await page.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).waitFor()
 const today=await page.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:window.MEOS_CONFIG.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
 const absent=async()=>{assert.doesNotMatch(await page.locator('main').innerText(),/legacy-|Optional schedule regression/);assert.equal(await page.getByRole('region',{name:'Tasks needing a time'}).count(),0)}
 await absent();assert.equal(await page.locator('.agenda-progress').innerText(),'1 of 4 tasks completed')
 await page.getByRole('link',{name:'Settings',exact:true}).click()
 await page.getByRole('button',{name:'legacy-untimed',exact:true}).waitFor()
 await page.getByRole('button',{name:'New task',exact:true}).click()
 let sheet=page.getByRole('dialog',{name:'Create task',exact:true})
 await sheet.getByLabel('Task name').fill('Optional schedule regression');await sheet.getByLabel('Priority').selectOption('high')
 await sheet.getByRole('button',{name:'Create task',exact:true}).click();await sheet.waitFor({state:'hidden'})
 const getTask=()=>page.evaluate(async()=> (await(await fetch('/api/tasks')).json()).find(t=>t.title==='Optional schedule regression'))
 let task=await getTask();assert.ok(task);assert.equal(task.schedule,undefined)
 await page.getByRole('button',{name:task.title,exact:true}).click();sheet=page.getByRole('dialog',{name:'Edit task',exact:true})
 await sheet.getByLabel('Duration (minutes)',{exact:true}).fill('20');await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.waitFor({state:'hidden'});assert.equal((await getTask()).schedule,undefined)
 await page.getByRole('link',{name:'Today',exact:true}).click();await absent()
 await page.getByRole('link',{name:'Week',exact:true}).click();await page.getByRole('button',{name:`View ${today}`,exact:true}).click();await absent()
 await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:task.title,exact:true}).click()
 await sheet.getByLabel('Scheduled date',{exact:true}).fill(today);await sheet.getByLabel('Time (required when scheduled)',{exact:true}).fill('12:34');await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.waitFor({state:'hidden'})
 assert.equal((await getTask()).schedule.time,'12:34')
 await page.getByRole('link',{name:'Week',exact:true}).click();await page.getByRole('button',{name:`View ${today}`,exact:true}).click()
 await page.getByRole('region',{name:'Scheduled agenda'}).getByRole('button',{name:task.title,exact:true}).waitFor()
 const otherDay=page.getByRole('button',{name:/^View /});const labels=await otherDay.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))
 await page.getByRole('button',{name:labels.find(label=>label!==`View ${today}`),exact:true}).click();await absent()

 await page.getByRole('link',{name:'Today',exact:true}).click();await page.getByRole('button',{name:task.title,exact:true}).waitFor()
 await page.getByRole('button',{name:`Complete ${task.title}`,exact:true}).click();await page.getByText('2 of 5 tasks completed',{exact:true}).waitFor()
 await page.locator('.completed-tasks summary').click();await page.getByRole('button',{name:task.title,exact:true}).click()
 await sheet.getByRole('button',{name:'Clear schedule',exact:true}).click();await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.waitFor({state:'hidden'})
 await page.getByText('1 of 4 tasks completed',{exact:true}).waitFor();await absent();task=await getTask();assert.equal(task.schedule,undefined);assert.equal(task.completed,true)
 await page.getByRole('link',{name:'Week',exact:true}).click();await page.getByRole('button',{name:`View ${today}`,exact:true}).click();await absent()
 await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:task.title,exact:true}).waitFor()
 assert.deepEqual(errors,[])
 console.log('PASS scheduling: unscheduled create/edit/readback, legacy invalid/high-priority/completed daily exclusion, resource discovery, schedule/unschedule transitions, selected day and Today counts')
} finally {await browser.close()}
