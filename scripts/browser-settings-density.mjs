import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3180'
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/settings');const title='Find a frame for the hallway';const card=page.locator('.settings-view .task').filter({has:page.getByRole('button',{name:title,exact:true})});await card.waitFor()
  assert.ok((await card.boundingBox()).height<=100);assert.equal(await card.locator('.task-kind').count(),0);assert.match(await card.locator('.task-meta').innerText(),/To be scheduled/)
  const timed=page.locator('.settings-view .task').filter({has:page.getByRole('button',{name:'Take a quiet afternoon walk',exact:true})});assert.match(await timed.locator('.task-meta').innerText(),/14:00/)
  for(const target of [card.locator('.check'),card.locator('.task-title')]){const box=await target.boundingBox();assert.ok(box.height>=44&&box.width>=44)}
  await card.getByRole('button',{name:`Complete ${title}`,exact:true}).click();await card.getByRole('button',{name:`Reopen ${title}`,exact:true}).waitFor();await card.getByRole('button',{name:`Reopen ${title}`,exact:true}).click()
  await card.getByRole('button',{name:title,exact:true}).click();const sheet=page.getByRole('dialog',{name:'Edit task',exact:true});assert.equal(await sheet.getByLabel('Scheduled date',{exact:true}).inputValue(),'');await sheet.getByLabel('Duration (minutes)',{exact:true}).fill('25');await sheet.getByRole('button',{name:'Save changes',exact:true}).click();await sheet.waitFor({state:'hidden'});await card.getByText('25 min · To be scheduled',{exact:true}).waitFor()
  await page.getByText('Archived resources',{exact:true}).click();const archived=page.locator('.settings-view .task').filter({has:page.getByRole('button',{name:'Put away the summer blanket',exact:true})});assert.ok((await archived.boundingBox()).height<=100)
  await archived.getByRole('button',{name:'Put away the summer blanket',exact:true}).click();await sheet.getByRole('button',{name:'Restore task',exact:true}).click();await sheet.waitFor({state:'hidden'})
  const routine=page.getByRole('button',{name:/^Morning care/});assert.ok((await routine.boundingBox()).height<=80)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/compact-settings-${width}.png`,fullPage:true})
  await page.getByRole('link',{name:'Today',exact:true}).click();await page.getByRole('heading',{name:'Today',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:title,exact:true}).count(),0)
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS Settings density: compact active/archived tasks and routines, schedule labels, 44px targets, completion/edit/restore, unscheduled discovery and daily exclusion, mobile/desktop overflow')
} finally {await browser.close()}
