// SPDX-License-Identifier: Apache-2.0
// HTTP adapter only. Provider tokens and raw provider errors never cross this boundary.
import {randomBytes} from 'node:crypto';
const FLOW_COOKIE='__Host-meos-calendar-flow';
const flowCookie=(value,age=600)=>`${FLOW_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const PREFIX = '/api/meos/v1/calendar/';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATES = new Set(['unconfigured', 'disconnected', 'connecting', 'connected', 'needs_consent', 'error']);
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
});
const failure = (status, code) => json(status, { error: code });

async function emptyBody(request) {
  if (!request.body) return;
  const reader = request.body.getReader();
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > 1024) throw new Error('body_too_large');
      // All current actions are parameterless; reject bodies rather than forwarding them.
      if (count) throw new Error('unexpected_body');
    }
  } finally { await reader.cancel().catch(() => {}); }
}

function publicStatus(value) {
  if (!value || !STATES.has(value.state)) throw new Error('invalid_service_status');
  return {
    state: value.state,
    primary: { direction: 'import_only' },
    managed: { direction: 'bidirectional' },
    syncActive: value.syncActive === true,
    syncError: ['session_expired','retrying'].includes(value.syncError)?value.syncError:null,
    plannerActive:value.plannerActive===true,
    lastSyncAt:Number.isSafeInteger(value.lastSyncAt)?value.lastSyncAt:null,
  };
}

/**
 * Ports:
 * upstream(Request) -> native Response (session requests forward only Cookie).
 * service.status({ownerId}) -> {state, syncActive};
 * service.connect({ownerId}) -> {authorizationUrl};
 * service.disconnect({ownerId, retainData:true}) -> void;
 * Callback is intentionally not handled: host must bind it to verified Access identity
 * and the one-use OAuth state transaction, including when the native session expires.
 */
export function createCalendarRoutes({ origin, upstream, service, ownerId }) {
  if (new URL(origin).origin !== origin || typeof upstream !== 'function' || !ownerId) {
    throw new Error('invalid_calendar_route_configuration');
  }
  return async function calendarRoutes(request) {
    const url = new URL(request.url);
    if (url.origin !== origin) return undefined;
    // Host has already verified Access. This route deliberately does not depend
    // on the native session lifetime; state is bound to a server-only flow cookie.
    if(url.pathname==='/api/calendar/google/callback') {
      if(request.method!=='GET')return failure(405,'method_not_allowed');
      const matches=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(FLOW_COOKIE+'='));
      let result='failed';
      try {
        if(matches.length!==1)throw Error('missing_flow');
        const session=matches[0].slice(FLOW_COOKIE.length+1);
        if(!/^[A-Za-z0-9_-]{43}$/.test(session)||['state','code','error'].some(k=>url.searchParams.getAll(k).length>1))throw Error('invalid_flow');
        await service.callback({ownerId,session,state:url.searchParams.get('state')??undefined,code:url.searchParams.get('code')??undefined,error:url.searchParams.get('error')??undefined});
        result='connected';
      } catch {}
      return new Response(null,{status:303,headers:{location:'/settings?calendar='+result,'cache-control':'no-store','set-cookie':flowCookie('',0),'referrer-policy':'no-referrer'}});
    }
    const action = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : '';
    if (!['status', 'connect', 'disconnect','events','editEvent'].includes(action)) return undefined;
    const method = ['status','events'].includes(action) ? 'GET' : 'POST';
    if (request.method !== method) return json(405, { error: 'method_not_allowed' }, { allow: method });
    try {
      const headers = new Headers();
      const cookie = request.headers.get('cookie');
      if (cookie) headers.set('cookie', cookie);
      const sessionResponse = await upstream(new Request(`${origin}/api/meos/v1/session`, { headers }));
      if (!sessionResponse.ok) return failure(401, 'unauthenticated');
      const session = await sessionResponse.json();
      if (session.user?.id !== ownerId) return failure(403, 'owner_required');
      if (method === 'POST') {
        if (request.headers.get('origin') !== origin ||
            request.headers.get('sec-fetch-site') === 'cross-site' ||
            typeof session.csrf !== 'string' || !session.csrf || request.headers.get('x-csrf-token') !== session.csrf) {
          return failure(403, 'csrf_rejected');
        }
        try { if(action!=='editEvent')await emptyBody(request); } catch { return failure(400, 'invalid_body'); }
      }
      const context = Object.freeze({ ownerId });
      if (action === 'status') return json(200, publicStatus(service ? await service.status(context) : { state: 'unconfigured' }));
      if (!service) return failure(503, 'calendar_unconfigured');
      if(action==='events')return json(200,await service.events(context));
      if(action==='editEvent'){let input;try{const raw=await request.text();if(raw.length>20000)throw Error('too_large');input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid')}catch{return failure(400,'invalid_event')}return json(200,await service.editEvent({...input,...context}))}
      if (action === 'connect') {
        const session=randomBytes(32).toString('base64url');
        const result = await service.connect({...context,session});
        const target = new URL(result.authorizationUrl);
        if (`${target.origin}${target.pathname}` !== GOOGLE_AUTH || target.username || target.password || target.hash) {
          return failure(502, 'invalid_authorization_url');
        }
        return json(200, { authorizationUrl: target.href }, {'set-cookie':flowCookie(session)});
      }
      await service.disconnect({ ...context, retainData: true });
      return json(200, { state: 'disconnected', dataRetained: true });
    } catch { return failure(503, 'calendar_unavailable'); }
  };
}
