import {chromium} from 'playwright'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true,args:['--no-sandbox']})
try {
 const context=await browser.newContext({viewport:{width:390,height:844}})
 const page=await context.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.message));
 const base=process.env.PREVIEW_URL || 'http://127.0.0.1:3181'
 await page.goto(base+'/week');await page.getByRole('button',{name:'Complete Choose herbs for the balcony'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Complete Choose herbs for the balcony'}).waitFor();
 const patch=page.waitForResponse(r=>r.url().endsWith('/api/tasks/0dd996fc-092d-4dbb-bac1-165e0d559c44')&&r.request().method()==='PATCH'&&r.status()===200)
 await page.getByRole('button',{name:'Complete Choose herbs for the balcony'}).click();await patch;
 await page.getByRole('link',{name:'Today',exact:true}).click();await page.locator('details.completed-tasks summary').click();await page.getByRole('button',{name:'Reopen Choose herbs for the balcony'}).waitFor();
 const other=await context.newPage();await other.goto(base);await other.getByRole('button',{name:'Complete Choose herbs for the balcony'}).waitFor();await other.close();
 await page.reload();await page.getByRole('button',{name:'Complete Choose herbs for the balcony'}).waitFor();
 if(await page.evaluate(()=>localStorage.length))throw Error('Unexpected localStorage')
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/phase1-mobile.png',fullPage:true});
 if(failures.length)throw Error(failures.join('\n'))
 console.log('PASS A: boot, nested reload, MSW read/PATCH, collection update, navigation retention, tab isolation, reload reseed; no page errors')
} finally {await browser.close()}
