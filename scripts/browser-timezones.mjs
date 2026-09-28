import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3180'
async function search(page,label,query){await page.getByRole('combobox',{name:label,exact:true}).click();const input=page.getByRole('combobox',{name:`Search ${label.toLowerCase()}`,exact:true});await input.fill(query);return input}
async function choose(page,label,zone){await search(page,label,zone);await page.getByRole('option').filter({has:page.getByText(zone,{exact:true})}).click()}
try {
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles',hasTouch:width===390});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-07-15T12:00:00Z')})
  await page.goto(base+'/settings');const display=page.getByRole('combobox',{name:'Display timezone',exact:true});await display.waitFor()
  for(const query of ['Montreal','Toronto','America/Toronto']){
   await search(page,'Display timezone',query);const option=page.getByRole('option').filter({has:page.getByText('America/Toronto',{exact:true})});await option.waitFor();assert.match(await option.innerText(),/Toronto \/ Montreal/);assert.match(await option.innerText(),/UTC-04:00/);assert.match(await option.innerText(),/08:00 local/)
   assert.ok((await option.boundingBox()).height>=44);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   await page.screenshot({path:`artifacts/timezone-search-${width}.png`,fullPage:true});await page.keyboard.press('Escape')
  }
  const input=await search(page,'Display timezone','Montreal');await input.press('ArrowDown');await input.press('Enter');assert.equal(await display.getAttribute('data-timezone'),'America/Toronto')
  await page.getByRole('button',{name:'Save preferences',exact:true}).click();await page.getByRole('link',{name:'Today',exact:true}).click();await page.getByRole('heading',{name:'Today',exact:true}).waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();assert.equal(await display.getAttribute('data-timezone'),'America/Toronto')
  await search(page,'Display timezone','not/a_timezone');await page.getByText('No matching timezone. Try a city or IANA name.').waitFor();assert.equal(await page.locator('.timezone-list').getByRole('option').count(),0);await page.keyboard.press('Escape');assert.equal(await display.getAttribute('data-timezone'),'America/Toronto')
  // A saved task retains its own IANA zone; display projection crosses the date boundary.
  await page.getByRole('button',{name:'New task',exact:true}).click();let sheet=page.getByRole('dialog',{name:'Create task',exact:true});await sheet.getByLabel('Task name').fill('Timezone projection test');await sheet.getByLabel('Scheduled date',{exact:true}).fill('2026-07-16');await sheet.getByLabel('Time (required when scheduled)',{exact:true}).fill('00:30')
  await choose(page,'Timezone','Asia/Tokyo');await sheet.getByRole('button',{name:'Create task',exact:true}).click();await sheet.waitFor({state:'hidden'})
  const readTask=()=>page.evaluate(async()=> (await(await fetch('/api/tasks')).json()).find(t=>t.title==='Timezone projection test'))
  assert.equal((await readTask()).schedule.timezone,'Asia/Tokyo');await page.getByRole('button',{name:'Timezone projection test',exact:true}).click();sheet=page.getByRole('dialog',{name:'Edit task',exact:true});assert.equal(await sheet.getByRole('combobox',{name:'Timezone',exact:true}).getAttribute('data-timezone'),'Asia/Tokyo');await page.keyboard.press('Escape')
  await page.getByRole('link',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'Timezone projection test',exact:true}).waitFor();await page.getByText('11:30',{exact:true}).waitFor()
  await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Use device timezone',exact:true}).click();assert.equal(await display.getAttribute('data-timezone'),'America/Los_Angeles');await page.getByRole('button',{name:'Save preferences',exact:true}).click()
  await page.getByRole('link',{name:'Today',exact:true}).click();await page.getByText('08:30',{exact:true}).waitFor();assert.equal((await readTask()).schedule.timezone,'Asia/Tokyo')
  await page.getByRole('link',{name:'Settings',exact:true}).click();assert.equal(await display.getAttribute('data-timezone'),'America/Los_Angeles')
  await page.getByRole('button',{name:'New routine',exact:true}).click();sheet=page.getByRole('dialog',{name:'Routine details',exact:true});await sheet.getByLabel('Routine name').fill('London rhythm');await sheet.getByLabel('Frequency intent',{exact:true}).fill('Every day');await choose(page,'Routine timezone','Europe/London');await sheet.getByRole('button',{name:'Save routine',exact:true}).click();await sheet.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(async()=> (await(await fetch('/api/routines')).json()).find(r=>r.title==='London rhythm').timezone),'Europe/London')
  const rejected=await page.evaluate(async()=>{const task=(await(await fetch('/api/tasks')).json()).find(t=>t.schedule);task.schedule.timezone='+04:00';return(await fetch('/api/tasks/'+task.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(task)})).status});assert.equal(rejected,400)
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS timezone selector: city/IANA/alias search, current offset/time, keyboard selection/Escape, no arbitrary entry, explicit device selection, task/routine API readback, display navigation retention and cross-date projection, mobile/desktop')
}finally{await browser.close()}
