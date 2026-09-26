import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const base = process.env.MEOS_TEST_URL || 'http://127.0.0.1:3182'
const browser = await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox']})
let selections = 0
try {
  for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
    for (const mode of ['mouse','touch','keyboard']) {
      const page = await browser.newPage({viewport,hasTouch:mode==='touch'})
      for (const route of ['/','/week']) {
        await page.goto(base + route)
        const fab = page.getByTestId('floating-add')
        for (const name of ['top left','top right','bottom left','bottom right']) {
          const before = await fab.boundingBox()
          await page.mouse.move(before.x+80,before.y+25)
          await page.mouse.down()
          await page.mouse.move(viewport.width/2,400,{steps:8})
          await page.mouse.up()
          const target = page.getByRole('button',{name:'Move add button'})
          if (mode==='touch') await target.tap(); else if(mode==='keyboard') {await page.getByRole('button',{name:route==='/'?'Add task':'Add outcome',exact:true}).focus();await page.keyboard.press('ArrowUp')} else await target.click()
          const option = page.getByRole('button',{name,exact:true})
          if (mode==='touch') await option.tap(); else if(mode==='keyboard') {await option.focus();await page.keyboard.press('Enter')} else await option.click()
          const assertPosition=async(size)=>{
            await page.waitForFunction(({name,size})=>{
              const r=document.querySelector('[data-testid="floating-add"]').getBoundingClientRect()
              const inset=Math.max(18,(size.width-716)/2)
              const x=name.includes('left')?inset:size.width-inset-r.width
              const bottom=Math.max(12,size.height-r.height-98)
              const y=name.includes('top')?Math.min(110,bottom):bottom
              return Math.abs(r.x-x)<1&&Math.abs(r.y-y)<1
            },{name,size})
            const after=await fab.boundingBox()
            const nav=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox()
            assert.ok(after.y+after.height<=nav.y,`${mode} ${name}: FAB overlaps navigation`)
          }
          await assertPosition(viewport)
          await page.setViewportSize({width:viewport.width===390?1280:390,height:844})
          await assertPosition({width:viewport.width===390?1280:390,height:844})
          await page.setViewportSize(viewport)
          await assertPosition(viewport)
          assert.equal(await page.getByRole('group',{name:'Add button position'}).count(),0)
          selections++
        }
        // Leaving the shared, portaled focus boundary must dismiss everything.
        await page.getByRole('button',{name:route==='/'?'Add task':'Add outcome',exact:true}).focus()
        await page.keyboard.press('ArrowUp')
        for(let i=0;i<3;i++) await page.keyboard.press('Shift+Tab')
        assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Settings')
        assert.equal(await page.locator('.floating-target,.placement-menu,.floating-tooltip').count(),0)
        await page.keyboard.press('Enter')
        await page.waitForURL('**/settings')
        assert.equal(await page.locator('.floating-target,.placement-menu,.floating-tooltip').count(),0)
      }
      await page.close()
    }
  }
  console.log(`PASS: ${selections} mouse/touch/keyboard corner selections after drag and resize; Today/Week, mobile/desktop; navigation clearance and keyboard route departure.`)
} finally { await browser.close() }
