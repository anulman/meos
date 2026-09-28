// SPDX-License-Identifier: Apache-2.0
// Built SPA, loopback-only synthetic APIs. Run after the frontend build.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { interpretRecurrence, interpretPreferredTime } from '../backend/scheduling.mjs';
import { validateResource } from '../backend/domain.mjs';

const day = '2026-09-28', timezone = 'America/Montreal';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const envelope = (value, revision = 1) => ({ value, revision, createdAt: `${day}T00:00:00Z`, updatedAt: `${day}T00:00:00Z` });
const preferences = envelope({ timezone, weekStartsOn: 1, weather: { enabled: false, source: 'latest', units: 'celsius' } });
const routines = [envelope({ id: id(1), title: 'Existing routine', notes: { type: 'doc' }, timezone, recurrenceIntent: interpretRecurrence('every day', day), durationIntent: 'About 25 minutes' })];
let occurrence = envelope({ id: id(2), routineId: id(1), title: 'Existing instance', notes: { type: 'doc' }, date: day, completed: false, durationMinutes: 25, templateRevision: 1 });
const tasks = [
 envelope({id:id(10),title:'Ordinary task',notes:{type:'doc'},completed:false,priority:'none'}),
 envelope({id:id(11),title:'Travel research',notes:{type:'doc'},completed:false,priority:'none'}),
 envelope({id:id(12),title:'Ride to rehearsal',type:'commute',notes:{type:'doc'},completed:false,priority:'none',durationMinutes:30,schedule:{date:day,time:'12:00',timezone}}),
 envelope({id:id(13),title:'Project ride',type:'commute',projectId:id(20),notes:{type:'doc'},completed:false,priority:'none',durationMinutes:30,schedule:{date:day,time:'13:00',timezone}})
];
const projects=[envelope({id:id(20),title:'Band project',notes:{type:'doc'}})];
const requests = [], serverErrors = [], pageErrors = [], blockedRequests = [];
const revisions = () => ({ tasks: tasks.reduce((n,r)=>n+r.revision,0), projects: 1, routines: routines.reduce((sum, row) => sum + row.revision, 0), occurrences: occurrence.revision, outcomes: 0, periodNotes: 0, preferences: 1 });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const call = { path: url.pathname, method: req.method, ...(raw ? { body: JSON.parse(raw) } : {}) };
      requests.push(call);
      let response;
      if (call.method !== 'GET') {
        if (call.path.startsWith('/api/meos/v1/resources/tasks/')) {
          const index=tasks.findIndex(row=>row.value.id===call.body.value.id);assert.ok(index>=0);
          assert.equal(call.body.expectedRevision,tasks[index].revision);
          tasks[index]=envelope(validateResource('tasks',call.body.value),tasks[index].revision+1);response=tasks[index];
        } else if (call.path === '/api/meos/v1/resources/routines' || call.path === '/api/meos/v1/operations/update_routine') {
          const value = structuredClone(call.body.value);
          for (const key of ['weekdays', 'time', 'durationMinutes', 'actualDurationMinutes']) assert.ok(!Object.hasOwn(value, key), `obsolete template field: ${key}`);
          const index = routines.findIndex(row => row.value.id === value.id);
          if (call.path.endsWith('update_routine')) {
            assert.ok(index >= 0); assert.equal(call.body.expectedRevision, routines[index].revision);
          } else assert.equal(index, -1, 'creation must not overwrite a routine');
          value.recurrenceIntent = interpretRecurrence(value.recurrenceIntent.text, value.recurrenceIntent.anchorDate);
          if (value.preferredTime) value.preferredTime = interpretPreferredTime(value.preferredTime.text);
          response = envelope(validateResource('routines', value), index < 0 ? 1 : routines[index].revision + 1);
          if (index < 0) routines.push(response); else routines[index] = response;
        } else if (call.path === '/api/meos/v1/operations/move_occurrence') {
          const { id: occurrenceId, expectedRevision, idempotencyKey, ...changes } = call.body;
          assert.equal(occurrenceId, occurrence.value.id); assert.equal(expectedRevision, occurrence.revision); assert.ok(idempotencyKey);
          occurrence = envelope(validateResource('occurrences', { ...occurrence.value, ...changes, edited: true }), occurrence.revision + 1);
          response = occurrence;
        } else throw Error(`Unexpected mutation: ${call.method} ${call.path}`);
      } else if (call.path.endsWith('/bootstrap')) response = { user: { id: id(900) }, csrf: 'isolated-fixture', preferences, revisions: revisions() };
      else if (call.path.endsWith('/session')) response = { user: { id: id(900) }, csrf: 'isolated-fixture' };
      else if (call.path.endsWith('/revisions')) response = revisions();
      else if (call.path.endsWith('/preferences')) response = preferences;
      else if (call.path.includes('/resources/')) {
        const kind = call.path.split('/').at(-1);
        assert.ok(['routines', 'occurrences', 'tasks', 'projects', 'outcomes', 'periodNotes'].includes(kind));
        response = { items: kind === 'routines' ? routines : kind === 'occurrences' ? [occurrence] : kind === 'tasks' ? tasks : kind === 'projects' ? projects : [] };
      } else if (call.path.endsWith('/calendar/status')) response = {state:'disconnected',syncActive:false,scopes:[],lastSyncAt:null};
      else if (call.path.endsWith('/calendar-window')) response = { id: 'calendar', available: true, state: 'connected', syncActive: true, lastSyncAt: Date.now(), plannerLastSyncAt: Date.now(), windowStart: null, windowEnd: null, drafts: [], planner: { plannerLastSyncAt: Date.now(), conflicts: [] }, sequence: 1, status: 'fresh', unchanged: false, items: [] };
      else throw Error(`Unexpected read: ${call.path}`);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(response));
    } else if (url.pathname === '/config.js') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(`window.MEOS_CONFIG={demo:false,accessGated:true,timezone:${JSON.stringify(timezone)}}`);
    } else {
      const file = 'dist/client/' + (url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : '_shell.html');
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(fs.readFileSync(file));
    }
  } catch (error) { serverErrors.push(String(error)); res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blockedRequests.push(route.request().url()); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(15_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const OriginalDate = Date, start = OriginalDate.now(), fixed = OriginalDate.parse('2026-09-28T16:00:00Z');
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [fixed + OriginalDate.now() - start])); }
      static now() { return fixed + OriginalDate.now() - start; }
    };
  });
  await page.goto(origin + '/week');
  await page.getByRole('button', { name: 'New routine', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Routine details' });
  await dialog.getByLabel('Routine name', { exact: true }).fill('Flexible exercise');
  await dialog.getByLabel('Frequency intent', { exact: true }).fill('three times a week');
  await dialog.getByLabel('Routine duration intent', { exact: true }).fill('Roughly half an hour');
  await dialog.getByLabel('Preferred time', { exact: true }).fill('mornings');
  const anchor = await dialog.getByLabel('Recurrence anchor date', { exact: true }).inputValue();
  assert.equal(anchor, day);
  assert.equal(await dialog.locator('input[type="time"], input[type="number"], input[type="checkbox"]').count(), 0, 'no exact timing, duration, actuals or weekday controls on template');
  await dialog.getByRole('button', { name: 'Save routine', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  let saved = routines.find(row => row.value.title === 'Flexible exercise');
  assert.ok(saved); assert.equal(saved.value.recurrenceIntent.kind, 'flexible'); assert.equal(saved.value.recurrenceIntent.frequency, 3);
  assert.equal(saved.value.durationIntent, 'Roughly half an hour'); assert.equal(saved.value.preferredTime.text, 'mornings');
  await page.getByRole('button', { name: /^Flexible exercise/ }).click();
  dialog = page.getByRole('dialog', { name: 'Routine details' });
  assert.equal(await dialog.getByLabel('Frequency intent', { exact: true }).inputValue(), 'three times a week');
  assert.equal(await dialog.getByLabel('Routine duration intent', { exact: true }).inputValue(), 'Roughly half an hour');
  await dialog.getByLabel('Routine duration intent', { exact: true }).fill('About 45 minutes');
  await dialog.getByRole('button', { name: 'Save routine', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  saved = routines.find(row => row.value.title === 'Flexible exercise');
  assert.equal(saved.revision, 2); assert.equal(saved.value.recurrenceIntent.anchorDate, anchor); assert.equal(saved.value.durationIntent, 'About 45 minutes');
  assert.deepEqual(requests.filter(call => call.method !== 'GET').map(call => call.path), ['/api/meos/v1/resources/routines', '/api/meos/v1/operations/update_routine'], 'template saves must not plan occurrences or write Calendar');
  assert.equal(occurrence.revision, 1, 'template saves preserve existing occurrence');
  await page.reload(); await page.getByRole('button', { name: /^Flexible exercise/ }).waitFor();
  await page.getByText('Unscheduled routine instances', { exact: true }).click();
  await page.getByRole('button', { name: `Existing instance · ${day}`, exact: true }).click();
  const instance = page.getByRole('dialog', { name: 'Routine instance' });
  assert.equal(await instance.getByLabel('Instance duration', { exact: true }).inputValue(), '25');
  await instance.getByLabel('Instance name', {exact:true}).fill('Preserved instance draft');
  await instance.getByRole('button',{name:'Open routine: Existing routine',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Routine details'});
  assert.equal(await dialog.getByLabel('Routine name',{exact:true}).inputValue(),'Existing routine');
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Close planner details',exact:true}).click();
  assert.equal(await instance.getByLabel('Instance name',{exact:true}).inputValue(),'Preserved instance draft');
  await instance.getByLabel('Instance date', { exact: true }).fill(day);
  await instance.getByLabel('Instance time', { exact: true }).fill('10:15');
  await instance.getByLabel('Instance duration', { exact: true }).fill('40');
  // The selector exposes Montreal through its canonical America/Toronto choice.
  await instance.getByRole('combobox', { name: 'Instance timezone', exact: true }).click();
  await instance.getByRole('combobox', { name: 'Search instance timezone', exact: true }).fill('Montreal');
  await instance.getByRole('option').filter({ hasText: 'America/Toronto' }).click();
  await instance.getByRole('button', { name: 'Save instance', exact: true }).click(); await instance.waitFor({ state: 'hidden' });
  assert.equal(occurrence.value.schedule.date, day); assert.equal(occurrence.value.schedule.time, '10:15');
  assert.equal(occurrence.value.schedule.timezone, 'America/Toronto'); assert.equal(occurrence.value.durationMinutes, 40);
  assert.equal(routines[0].value.durationIntent, 'About 25 minutes', 'instance editing preserves template');
  assert.equal(requests.filter(call => call.method !== 'GET').length, 3);
  await page.goto(origin+'/settings');
  const noProject=page.locator('section').filter({has:page.getByRole('heading',{name:'No project',exact:true})});
  await noProject.getByText('Ordinary task',{exact:true}).waitFor();
  assert.equal(await noProject.getByText('Travel research',{exact:true}).count(),1);
  assert.equal(await noProject.getByText('Ride to rehearsal',{exact:true}).count(),0);
  assert.equal(await noProject.getByText('Preserved instance draft',{exact:true}).count(),0);
  await page.getByRole('button',{name:/Band project/}).click();
  await page.getByText('Project ride',{exact:true}).waitFor();
  await page.goto(origin+'/');
  await page.getByText('Ride to rehearsal',{exact:true}).waitFor();
  await page.getByText('Project ride',{exact:true}).waitFor();
  await page.getByText('Preserved instance draft',{exact:true}).waitFor();
  await page.getByText('Ride to rehearsal',{exact:true}).click();
  await page.getByLabel('Task type',{exact:true}).selectOption('');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  assert.equal(tasks[2].value.type,undefined);assert.equal(tasks[2].value.schedule.time,'12:00');
  await page.goto(origin+'/settings');await noProject.getByText('Ride to rehearsal',{exact:true}).waitFor();
  assert.deepEqual(serverErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(blockedRequests, []);
  console.log('PASS routine intent create/edit, stable anchor, absent exact template controls, no automatic occurrences, exact occurrence scheduling');
} catch (error) {
  console.error(JSON.stringify({ serverErrors, pageErrors, blockedRequests, mutations: requests.filter(call => call.method !== 'GET'), text: await page?.locator('body').innerText().catch(() => '') }));
  throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
