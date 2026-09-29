import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3180'
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/week');const outcome=page.locator('.outcome-row').first();await outcome.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).waitFor()
  const today=await page.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:window.MEOS_CONFIG.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
  assert.equal(await outcome.locator('.task-kind').count(),0);assert.match(await outcome.locator('.task-meta').innerText(),/Priority.*A greener balcony.*10:00/)
  assert.ok((await outcome.locator('.task').boundingBox()).height<=110)
  for(const target of [outcome.locator('.check'),outcome.locator('.task-title')]){const box=await target.boundingBox();assert.ok(box.height>=44&&box.width>=44)}
  await page.getByRole('button',{name:`View ${today}`,exact:true}).click()
  const agenda=page.getByRole('region',{name:'Scheduled agenda'});const card=agenda.locator('.task').first()
  assert.ok((await card.boundingBox()).height<=80);assert.equal(await card.locator('.task-kind').count(),0)
  await agenda.getByText('10:00',{exact:true}).waitFor();assert.equal(await page.locator('.completed-tasks').count(),0)
  await agenda.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).click();await agenda.getByRole('button',{name:'Reopen Choose herbs for the balcony',exact:true}).waitFor()
  await page.locator('.timeline').getByRole('button',{name:'Reopen Choose herbs for the balcony',exact:true}).click();await agenda.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).waitFor()
  await outcome.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Edit task',exact:true});assert.equal(await sheet.getByLabel('Time (required when scheduled)',{exact:true}).inputValue(),'10:00');await page.keyboard.press('Escape')
  // Weekly outcomes remain independent of scheduling and absent from the daily agenda.
  await page.getByRole('button',{name:'Add outcome',exact:true}).click();const add=page.getByRole('dialog',{name:'Add outcome',exact:true});const title='Make space for a peaceful afternoon with a very long descriptive outcome title'
  await add.getByLabel('New outcome name').fill(title);await add.getByRole('button',{name:'Add to week',exact:true}).click();await add.waitFor({state:'hidden'})
  const created=page.locator('.outcome-row').filter({has:page.getByRole('button',{name:title,exact:true})});await created.getByRole('button',{name:title,exact:true}).waitFor();assert.match(await created.innerText(),/To be scheduled/)
  assert.equal(await agenda.getByRole('button',{name:title,exact:true}).count(),0)
  assert.equal(await created.locator('.task-title').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.equal(await page.getByRole('button',{name:/^Defer /}).count(),0)
  await page.screenshot({path:`artifacts/compact-week-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS Week density: compact outcomes/selected-day cards, readable time/metadata, long titles, 44px targets, editor access, completion/reopen, unscheduled outcome exclusion, mobile/desktop overflow')
} finally {await browser.close()}
