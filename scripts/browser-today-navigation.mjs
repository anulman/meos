import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

const base=process.env.PREVIEW_URL||'http://127.0.0.1:3187'
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local demo')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'})
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
  // Toronto is still March 7 although both UTC and the device are on March 8.
  await page.clock.install({time:new Date('2026-03-08T02:30:00Z')})
  await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.MEOS_CONFIG={demo:true,timezone:'America/Toronto'}"}))
  await page.goto(base);const agenda=page.getByRole('region',{name:'Scheduled agenda'})
  await page.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).waitFor()
  const date=page.locator('.day-navigation .eyebrow')
  assert.equal(await date.textContent(),'Saturday, Mar 7')
  const rowTitles=()=>agenda.locator('.task-title,.routine-card h2').allTextContents()
  const before=await rowTitles()
  await agenda.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).click()
  const reopen=agenda.getByRole('button',{name:'Reopen Choose herbs for the balcony',exact:true});await reopen.waitFor()
  assert.equal(await reopen.getAttribute('aria-pressed'),'true');assert.equal(await reopen.innerText(),'✓')
  assert.deepEqual(await rowTitles(),before);assert.equal(await page.locator('.completed-tasks').count(),0)
  await page.getByText('2 of 4 tasks completed',{exact:true}).waitFor()
  await reopen.click();await agenda.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).waitFor()
  await page.getByText('1 of 4 tasks completed',{exact:true}).waitFor()
  await agenda.getByRole('button',{name:'Complete Morning care on 2026-03-07',exact:true}).click()
  const routine=agenda.getByRole('button',{name:'Reopen Morning care on 2026-03-07',exact:true});await routine.waitFor()
  assert.equal(await routine.innerText(),'✓');assert.deepEqual(await rowTitles(),before)
  await routine.click();await agenda.getByRole('button',{name:'Complete Morning care on 2026-03-07',exact:true}).waitFor()
  const previous=page.getByRole('button',{name:'Previous day',exact:true});const next=page.getByRole('button',{name:'Next day',exact:true})
  for(const button of [previous,next]){const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44)}
  await next.focus();await page.keyboard.press('Enter');assert.equal(await date.textContent(),'Sunday, Mar 8')
  await next.click();assert.equal(await date.textContent(),'Monday, Mar 9')
  await page.getByRole('button',{name:'Day Notes'}).click();const notes=page.getByRole('dialog',{name:'Day Notes',exact:true})
  await notes.getByText('2026-03-09',{exact:true}).waitFor();await page.keyboard.press('Escape')
  assert.equal(await agenda.locator('.task').count(),0)
  await previous.click();await previous.click();assert.equal(await date.textContent(),'Saturday, Mar 7')
  await agenda.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true}).waitFor()
  assert.deepEqual(await rowTitles(),before)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/today-navigation-${width}.png`,fullPage:true})
  assert.deepEqual(errors,[]);await context.close()
 }
 for(const [instant,expected,nextDay] of [['2026-12-31T17:00:00Z','Thursday, Dec 31','Friday, Jan 1'],['2028-02-28T17:00:00Z','Monday, Feb 28','Tuesday, Feb 29']]){
  const page=await browser.newPage()
  await page.clock.install({time:new Date(instant)})
  await page.goto(base);const date=page.locator('.day-navigation .eyebrow');await date.waitFor()
  assert.equal(await date.textContent(),expected)
  await page.getByRole('button',{name:'Next day',exact:true}).click();assert.equal(await date.textContent(),nextDay)
  await page.getByRole('button',{name:'Previous day',exact:true}).click();assert.equal(await date.textContent(),expected)
  await page.close()
 }
 console.log('PASS Today: inline completion/reopen/order/progress, accessible day navigation, planner timezone vs device, DST, selected-day notes/agenda, mobile/desktop')
}finally{await browser.close()}
