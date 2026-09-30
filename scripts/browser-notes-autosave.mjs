import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3194'
const artifacts=process.env.ARTIFACT_DIR||'artifacts'
try {
 await mkdir(artifacts,{recursive:true})
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390})
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base);await page.getByRole('button',{name:'Day Notes',exact:true}).click()
  const sheet=page.getByRole('dialog',{name:'Day Notes',exact:true}),editor=sheet.getByRole('textbox',{name:'Period notes'})
  await editor.waitFor();assert.equal(await sheet.evaluate(e=>e===document.activeElement),true)
  assert.equal(await sheet.getByRole('button',{name:'Save notes'}).count(),0)
  await editor.fill('Human thoughts');await editor.press('Control+a');await editor.press('Control+b')
  const bold=sheet.getByRole('button',{name:'Bold',exact:true})
  assert.equal(await bold.getAttribute('aria-pressed'),'true')
  await sheet.evaluate(e=>e.focus()) // genuine selected text remains active when editor loses focus
  assert.equal(await bold.getAttribute('aria-pressed'),'true')
  await page.evaluate(()=>window.getSelection().removeAllRanges())
  await page.waitForFunction(()=>document.querySelector('[aria-label="Bold"]').getAttribute('aria-pressed')==='false')
  await editor.click();await editor.press('Control+a');await bold.click();assert.equal(await bold.getAttribute('aria-pressed'),'false')
  await sheet.getByRole('button',{name:'Close planner details'}).click();await sheet.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('button',{name:'Day Notes',exact:true}).evaluate(e=>e===document.activeElement),true)
  await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.match(await editor.innerText(),/Human thoughts/)
  // Delay writes, record exact snapshots, and reject one request. This exercises
  // the real editor/store boundary without production data or credentials.
  await page.evaluate(()=>{const original=window.fetch;window.noteWrites=[];window.activeWrites=0;window.maxWrites=0;window.failNote=false;window.fetch=async(input,init)=>{if(String(input).includes('/period-notes/')&&init?.method==='PUT'){window.activeWrites++;window.maxWrites=Math.max(window.maxWrites,window.activeWrites);window.noteWrites.push(JSON.parse(init.body));await new Promise(r=>setTimeout(r,700));try{if(window.failNote){window.failNote=false;return new Response('{}',{status:503})}return await original(input,init)}finally{window.activeWrites--}}return original(input,init)}})
  await editor.fill('First in flight');await page.waitForFunction(()=>window.activeWrites===1)
  await editor.fill('Newest queued');await sheet.getByRole('button',{name:'Close planner details'}).click()
  await sheet.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.maxWrites),1)
  assert.deepEqual(await page.evaluate(()=>window.noteWrites.map(n=>n.notes.content[0].content[0].text)),['First in flight','Newest queued'])
  await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.equal((await editor.innerText()).trim(),'Newest queued')
  await page.evaluate(()=>{window.failNote=true});await editor.fill('Keep this failed draft')
  await sheet.getByRole('button',{name:'Close planner details'}).click();await sheet.getByRole('alert').waitFor();assert.match(await editor.innerText(),/failed draft/);assert.equal(await sheet.isVisible(),true)
  await sheet.getByRole('button',{name:'Retry',exact:true}).click();await sheet.getByRole('status').filter({hasText:'Saved'}).waitFor()
  await editor.fill('');await editor.evaluate(e=>{const data=new DataTransfer();data.setData('text/html','<p>My own words.</p><blockquote><p><em>🤖 Clawy</em></p><p>A quieter agent observation that remains clearly attributed.</p><p>Source: Test fixture</p></blockquote><blockquote><p>A human quotation.</p></blockquote>');e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})
  await sheet.locator('.agent-note').waitFor();assert.equal(await sheet.locator('.agent-note').count(),1)
  assert.equal(await sheet.locator('.agent-note').evaluate(e=>getComputedStyle(e).fontStyle),'italic')
  const title=await sheet.getByRole('heading').boundingBox(),date=await sheet.locator('p.muted').boundingBox();assert.ok(date.y-title.y-title.height<=3)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await sheet.getByRole('status').filter({hasText:'Saved'}).waitFor();await sheet.evaluate(e=>{getSelection().removeAllRanges();e.focus()})
  await page.screenshot({path:`${artifacts}/notes-${width}.png`,fullPage:true})
  await editor.press('Escape');await sheet.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'Next day',exact:true}).click();await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.equal((await editor.innerText()).trim(),'');await editor.press('Escape')
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS notes: neutral dialog focus/restore, selection and toolbar, serialized rapid autosave, close/reopen/date isolation, failed-save retry, attribution, compact mobile/desktop layout')
}finally{await browser.close()}
