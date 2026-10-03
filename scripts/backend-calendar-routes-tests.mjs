// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createCalendarRoutes } from '../backend/calendar-routes.mjs';
import { createNodeWebHandler } from '../backend/node-web-server.mjs';

const origin = 'https://meos.example.test';
const ownerId = 'synthetic-owner';
const prefix = '/api/meos/v1/calendar/';
const session = { user: { id: ownerId }, csrf: 'synthetic-csrf' };
function fixture(options = {}) {
  const calls = [];
  const upstream = async request => {
    calls.push(['session', request]);
    return Response.json(options.session ?? session, { status: options.sessionStatus ?? 200 });
  };
  const service = {
    status: async context => { calls.push(['status', context]); return { state: 'connected', syncActive: true, accessToken: 'never-return' }; },
    connect: async context => { calls.push(['connect', context]); return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque', refreshToken: 'never-return' }; },
    disconnect: async context => { calls.push(['disconnect', context]); },
    ...options.service,
  };
  const route = createCalendarRoutes({ origin, ownerId, upstream, service: options.unconfigured ? undefined : service });
  return { route, calls, upstream };
}
function request(action, options = {}) {
  return new Request(origin + (action.startsWith('/') ? action : prefix + action), {
    method: options.method ?? (action === 'status' ? 'GET' : 'POST'),
    headers: { cookie: 'synthetic=session', origin, 'x-csrf-token': session.csrf, ...options.headers },
    ...('body' in options ? { body: options.body } : {}),
  });
}

test('calendar status is owner-authenticated and response excludes secrets', async () => {
  const { route, calls } = fixture();
  const response = await route(request('status', { headers: { authorization: 'Bearer forged', 'x-owner-id': 'forged' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'connected', primary: { direction: 'import_only' }, managed: { direction: 'bidirectional' }, syncActive: true,syncError:null,plannerActive:false,lastSyncAt:null });
  assert.equal(calls[0][1].url, origin + '/api/meos/v1/session');
  assert.deepEqual([...calls[0][1].headers], [['cookie', 'synthetic=session']]);
  assert.deepEqual(calls[1], ['status', { ownerId }]);
});
test('calendar unconfigured status is truthful and connect cannot succeed', async () => {
  const { route } = fixture({ unconfigured: true });
  assert.equal((await (await route(request('status'))).json()).state, 'unconfigured');
  assert.equal((await route(request('connect'))).status, 503);
});
test('calendar rejects unauthenticated or different native owner', async () => {
  for (const options of [{ sessionStatus: 401 }, { session: { user: { id: 'other' }, csrf: session.csrf } }, { session: {} }]) {
    const { route, calls } = fixture(options);
    assert.ok([401, 403].includes((await route(request('connect'))).status));
    assert.equal(calls.length, 1);
  }
});
test('calendar mutation requires exact origin, non-cross-site, native CSRF', async () => {
  for (const headers of [{ origin: '' }, { origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }, { 'x-csrf-token': '' }, { 'x-csrf-token': 'forged' }]) {
    const { route, calls } = fixture();
    assert.equal((await route(request('disconnect', { headers }))).status, 403);
    assert.equal(calls.length, 1);
  }
});
test('calendar rejects invalid native CSRF types', async () => {
  for (const csrf of ['', null, 123]) {
    const { route } = fixture({ session: { user: { id: ownerId }, csrf } });
    assert.equal((await route(request('connect'))).status, 403);
  }
});
test('calendar connects only to exact Google authorization endpoint', async () => {
  for (const authorizationUrl of ['https://evil.test/', 'https://accounts.google.com.evil.test/o/oauth2/v2/auth', 'https://user:pass@accounts.google.com/o/oauth2/v2/auth', 'https://accounts.google.com/o/oauth2/v2/auth#secret', '/relative']) {
    const { route } = fixture({ service: { connect: async () => ({ authorizationUrl }) } });
    assert.ok([502, 503].includes((await route(request('connect'))).status));
  }
  const { route } = fixture();
  assert.deepEqual(await (await route(request('connect'))).json(), { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque' });
});
test('calendar disconnect retains imported and managed data', async () => {
  const { route, calls } = fixture();
  assert.deepEqual(await (await route(request('disconnect'))).json(), { state: 'disconnected', dataRetained: true });
  assert.deepEqual(calls.at(-1), ['disconnect', { ownerId, retainData: true }]);
});
test('calendar wrong methods and unexpected bodies never call service', async () => {
  const { route, calls } = fixture();
  assert.equal((await route(request('connect', { method: 'GET' }))).status, 405);
  assert.equal((await route(request('status', { method: 'POST' }))).status, 405);
  assert.equal((await route(request('connect', { body: 'x'.repeat(2048) }))).status, 400);
  assert.equal(calls.length, 1);
});
test('calendar unknown routes including callback remain outside adapter', async () => {
  const { route } = fixture();
  for (const action of ['callback', 'status/extra', '/api/calendar/google/notifications/extra', '/api/meos/v1/tasks']) assert.equal(await route(request(action)), undefined);
  assert.equal(await route(new Request('https://evil.test' + prefix + 'status')), undefined);
});
test('calendar service errors never disclose provider secrets', async () => {
  const { route } = fixture({ service: { status: async () => { throw new Error('refresh_token=secret'); } } });
  const response = await route(request('status'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'calendar_unavailable' });
});
// Host integration invokes the real Node adapter without listening on a network.
async function hostCall(handler, pathname, method = 'GET', headers = {}) {
  const req = Readable.from([]);
  Object.assign(req, { url: pathname, method, headers: { host: new URL(origin).host, ...headers } });
  const res = new EventEmitter();
  Object.assign(res, { status: 200, headers: {}, headersSent: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, values = {}) { this.status = status; this.headersSent = true; for (const [name, value] of Object.entries(values)) this.setHeader(name, value); },
    end(body) { this.body = body?.toString() ?? ''; },
  });
  await handler(req, res);
  return res;
}
test('host owner checks precede calendar service and native CSRF still required', async () => {
  const { route, upstream } = fixture();
  const handler = createNodeWebHandler({ origin, root: '/tmp', upstream, calendarRoutes: route,
    accessOwner: { check() {}, async session() {} } });
  assert.equal((await hostCall(handler, prefix + 'status')).status, 200);
  assert.equal((await hostCall(handler, prefix + 'connect', 'POST')).status, 403);
  assert.equal((await hostCall(handler, prefix + 'connect', 'POST', { origin, 'x-csrf-token': session.csrf })).status, 200);
});

test('connect flow cookie is private and callback does not require an unexpired native session', async()=>{
 const captured=[];const f=fixture({service:{callback:async c=>captured.push(c)}});
 const start=await f.route(request('connect'));const raw=start.headers.get('set-cookie');assert.match(raw,/^__Host-meos-calendar-flow=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);
 const callback=await f.route(new Request(origin+'/api/calendar/google/callback?state=synthetic&code=synthetic',{headers:{cookie:raw.split(';')[0]}}));assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/settings?calendar=connected');assert.equal(captured.length,1);assert.equal(captured[0].session,raw.split(';')[0].split('=')[1]);assert.match(callback.headers.get('set-cookie'),/Max-Age=0/);
 const missing=await f.route(new Request(origin+'/api/calendar/google/callback?state=synthetic&code=synthetic'));assert.equal(missing.headers.get('location'),'/settings?calendar=failed');assert.equal(captured.length,1);
 const duplicate=await f.route(new Request(origin+'/api/calendar/google/callback?state=a&state=b&code=synthetic',{headers:{cookie:raw.split(';')[0]}}));assert.equal(duplicate.headers.get('location'),'/settings?calendar=failed');assert.equal(captured.length,1);
});

test('Google callback never bypasses external Access',async()=>{
 let reached=false;
 const handler=createNodeWebHandler({origin,root:'/tmp',upstream:async()=>Response.json({}),accessOwner:{check:()=>new Response('Denied',{status:403})},calendarRoutes:async()=>{reached=true;return new Response(null,{status:303,headers:{location:'/settings'}})}});
 const req=Readable.from([]);req.url='/api/calendar/google/callback?state=synthetic&code=synthetic';req.method='GET';req.headers={host:new URL(origin).host};const res={headersSent:false,once(){},writeHead(status){this.status=status},end(){}};
 await handler(req,res);assert.equal(res.status,403);assert.equal(reached,false);
});
test('removed Google notification URL has no route and never bypasses Access',async()=>{const f=fixture();assert.equal(await f.route(request('/api/calendar/google/notifications')),undefined);let reached=false;const handler=createNodeWebHandler({origin,root:'/tmp',upstream:f.upstream,accessOwner:{check:()=>new Response(null,{status:403})},calendarRoutes:async()=>{reached=true}});assert.equal((await hostCall(handler,'/api/calendar/google/notifications','POST')).status,403);assert.equal(reached,false)});

test('Calendar status exposes only safe native-session health, never raw failures',async()=>{
 for(const error of ['session_expired','retrying','secret provider detail']){
  const {route}=fixture({service:{status:async()=>({state:'connected',syncActive:false,syncError:error,accessToken:'secret-token'})}});
  const result=await (await route(request('status'))).json();
  assert.equal(result.syncError,error==='secret provider detail'?null:error);assert.ok(!JSON.stringify(result).includes('secret'));
 }
});
