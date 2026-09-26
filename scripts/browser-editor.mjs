import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3182'
try {
 await mkdir('artifacts',{recursive:true})
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile})
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base);await page.getByRole('button',{name:'Day Notes',exact:true}).click()
  const sheet=page.getByRole('dialog',{name:'Day Notes',exact:true}),editor=sheet.getByRole('textbox',{name:'Period notes'})
  await editor.fill('First');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Second');assert.equal(await editor.locator('p').count(),2)
  await page.keyboard.press('Shift+Enter');await page.keyboard.type('soft');assert.equal(await editor.locator('p').count(),2);assert.ok(await editor.locator('br').count())
  await page.keyboard.press('Control+a');await page.keyboard.press('Control+b');assert.equal(await sheet.getByRole('button',{name:'Bold',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await editor.locator('strong').count(),2)
  await page.keyboard.press('Control+z');assert.equal(await editor.locator('strong').count(),0);await page.keyboard.press('Control+Shift+z');assert.equal(await editor.locator('strong').count(),2)
  const italic=sheet.getByRole('button',{name:'Italic',exact:true});await (mobile?italic.tap():italic.click());assert.equal(await italic.getAttribute('aria-pressed'),'true');assert.ok(await editor.locator('em').count());assert.equal(await editor.evaluate(e=>e===document.activeElement),true)
  // Exercise the clipboard parser with a real browser ClipboardEvent payload.
  await editor.evaluate(e=>{const selection=getSelection();selection.selectAllChildren(e);selection.collapseToEnd();e.dispatchEvent(new Event('keyup',{bubbles:true}))});await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');await editor.evaluate(e=>{const data=new DataTransfer();data.setData('text/plain','\nPasted one\nPasted two');e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});assert.match(await editor.innerText(),/Pasted two/)
  await page.evaluate(()=>{const original=window.fetch;let fail=true;window.fetch=(input,init)=>{if(fail&&String(input).includes('/period-notes/')&&init?.method==='PUT'){fail=false;return Promise.resolve(new Response(JSON.stringify({error:'Simulated save failure'}),{status:503,headers:{'Content-Type':'application/json'}}))}return original(input,init)}})
  await sheet.getByRole('button',{name:'Save notes'}).click();await sheet.getByRole('alert').waitFor();assert.match(await editor.innerText(),/Pasted two/)
  await Promise.all([page.waitForEvent('dialog').then(d=>d.dismiss()),editor.press('Escape')]);assert.equal(await sheet.isVisible(),true)
  await sheet.getByRole('button',{name:'Save notes'}).click();await sheet.waitFor({state:'hidden'});await page.getByRole('button',{name:'Day Notes',exact:true}).click();assert.match(await editor.innerText(),/Pasted two/);assert.ok(await editor.locator('strong').count());await editor.press('Escape');await sheet.waitFor({state:'hidden'})
  const complete=page.getByRole('button',{name:'Complete Choose herbs for the balcony',exact:true});const box=await complete.boundingBox();assert.ok(box.width>=44&&box.height>=44);await (mobile?complete.tap():complete.click());await page.getByRole('button',{name:'Reopen Choose herbs for the balcony',exact:true}).waitFor()
  await page.screenshot({path:`artifacts/editor-today-${mobile?'mobile':'desktop'}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  // Resource formatting alone must trigger its existing dirty-close guard.
  await page.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).click();const task=page.getByRole('dialog',{name:'Edit task',exact:true}),notes=task.getByRole('textbox',{name:'Notes',exact:true});await notes.fill('Resource notes');await task.getByRole('button',{name:'Save changes',exact:true}).click();await task.waitFor({state:'hidden'});await page.getByRole('button',{name:'Choose herbs for the balcony',exact:true}).click();await notes.click();await page.keyboard.press('Control+a');await page.keyboard.press('Control+i');await Promise.all([page.waitForEvent('dialog').then(d=>d.dismiss()),notes.press('Escape')]);assert.ok(await notes.locator('em').count());await task.getByRole('button',{name:'Save changes',exact:true}).click();await task.waitFor({state:'hidden'})
  await page.getByRole('link',{name:'Week',exact:true}).click()
  await page.getByRole('button',{name:'Week Notes',exact:true}).click()
  const week=page.getByRole('dialog',{name:'Week Notes',exact:true});await week.getByRole('textbox',{name:'Period notes'}).fill('Weekly draft');await page.keyboard.press('Control+a');await page.keyboard.press('Control+b');await week.getByRole('button',{name:'Save notes'}).click();await week.waitFor({state:'hidden'});await page.getByRole('button',{name:'Week Notes',exact:true}).click();assert.equal(await week.locator('strong').last().innerText(),'Weekly draft');await week.getByRole('textbox',{name:'Period notes'}).press('Escape')
  await page.getByRole('button',{name:/^Morning care/}).click();const routine=page.getByRole('dialog',{name:'Routine details',exact:true});await routine.getByRole('textbox',{name:'Notes',exact:true}).fill('Routine draft');await page.keyboard.press('Control+a');await page.keyboard.press('Control+i');await routine.getByRole('button',{name:'Save routine',exact:true}).click();await routine.waitFor({state:'hidden'});await page.getByRole('button',{name:/^Morning care/}).click();assert.equal(await routine.locator('.ProseMirror em').innerText(),'Routine draft');await routine.getByRole('textbox',{name:'Notes',exact:true}).press('Escape')
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS editor: desktop/touch, paragraphs/soft breaks/paste, marks/state/focus, undo/redo, save failure/retry/reopen, dirty guards, Today completion/44px targets/no overflow')
}finally{await browser.close()}
