// SPDX-License-Identifier: Apache-2.0
// Private service: durable credentials never appear in public status or HTTP responses.
import {randomUUID,createHash} from 'node:crypto';
import {createCalendarOAuth} from './calendar-oauth.mjs';
import {createCalendarSnapshotStore} from './calendar-snapshot-store.mjs';
import {createCalendarPlanner} from './calendar-planner.mjs';
import {createCalendarEvents} from './calendar-events.mjs';
import {createCalendarMirror} from './calendar-mirror.mjs';
import {createCalendarPolling} from './calendar-polling.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createCalendarService({config,store,broker,planner,now=Date.now}) {
 store=createCalendarSnapshotStore(store);
 const owner=config.ownerId, ownerHash=hash(owner), connectionKey='connection:'+ownerHash;
 const check=id=>{if(id!==owner)throw Error('owner_required')};
 const initial=()=>({generation:randomUUID(),state:'disconnected'});
 store.transaction(tx=>{if(!tx.get(connectionKey))tx.set(connectionKey,initial())});
 function connection(tx=store){return tx.get(connectionKey)??initial()}
 function mutate(fn){return store.transaction(tx=>{const c=connection(tx),result=fn(c,tx);tx.set(connectionKey,c);return result})}
 const oauthStore={
  async putAttempt(key,record){mutate((c,tx)=>{const name='attempt:'+key;if(tx.get(name))throw Error('attempt_exists');tx.set(name,{...record,generation:c.generation});})},
  async consumeAttempt(key){return store.transaction(tx=>{const name='attempt:'+key,r=tx.get(name);tx.delete(name);return r??null})},
  async saveConnection(id,record,{generation}){check(id);return mutate(c=>{if(c.generation!==generation)return false;Object.assign(c,{credentials:record,state:'connected',refresh:null,refreshFailure:null});return true})},
  async beginRefresh(id,time){check(id);return mutate(c=>{if(!c.credentials)return null;if(c.refresh){if(c.refresh.expiresAt>time)return {busy:true};c.refreshFailure={reason:'lease_expired',at:time}}const lease=randomUUID();c.refresh={lease,expiresAt:time+60000};return {lease,refreshToken:c.credentials.refreshToken,scope:c.credentials.scope}})},
  async finishRefresh(id,lease,record){check(id);return mutate(c=>{if(c.refresh?.lease!==lease||!c.credentials||c.refresh.expiresAt<=now())return false;c.credentials={...c.credentials,...record};c.refresh=null;c.refreshFailure=null;return true})},
  async failRefresh(id,lease,{reconnectRequired,reason}){check(id);return mutate(c=>{if(c.refresh?.lease!==lease||c.refresh.expiresAt<=now())return false;c.refresh=null;c.refreshFailure={reason:['transport','invalid_grant','client_configuration','provider_unavailable','invalid_response'].includes(reason)?reason:'provider_unavailable',at:now()};if(reconnectRequired){delete c.credentials;c.generation=randomUUID();c.state='needs_consent'}return true})},
 };
 const oauth=createCalendarOAuth({config,store:oauthStore,tokenExchange:broker.tokenExchange,refreshExchange:broker.refreshExchange,verifyIdentity:broker.verifyIdentity,now});
 async function accessToken(){let c=connection();if(!c.credentials)throw Error('reconnect_required');if(c.credentials.expiresAt<=now()+60000){await oauth.refresh({owner});c=connection()}if(!c.credentials||c.credentials.expiresAt<=now())throw Error('reconnect_required');return c.credentials.accessToken}
 const events=createCalendarEvents({store,connection,broker,accessToken,ownerEmail:config.ownerEmail,now});
 const bridge=createCalendarPlanner({store,planner,broker,connection,accessToken,now});
 const polling=createCalendarPolling({store,broker,connection,connectionKey,accessToken,now,flush:async context=>{await events.flush(context);await bridge.sync(context)},initialize:()=>service.initializeManagedCalendar()});
 const mirror=createCalendarMirror({store,planner,connection,now,snapshot(){
  const c=connection(),primary=store.get('snapshot:primary'),managed=store.get('snapshot:managed'),available=!!primary&&!!managed;
  const data=events.list(),status=polling.status(c),plan=bridge.status();
  return {items:available?data.items:[],drafts:data.drafts,conflicts:plan.conflicts,metadata:{available,state:c.state,syncActive:status.syncActive,lastSyncAt:store.get('poll-state')?.lastSuccess??null,plannerLastSyncAt:plan.plannerLastSyncAt,windowStart:primary?.windowStart&&managed?.windowStart?[primary.windowStart,managed.windowStart].sort().at(-1):null,windowEnd:primary?.windowEnd&&managed?.windowEnd?[primary.windowEnd,managed.windowEnd].sort()[0]:null}};
 }});
 const lifecycle=async operation=>{try{return await operation()}finally{try{await mirror.publish()}catch{/* The existing worker retries projection; never undo accepted OAuth/state changes. */}}};
 const service={
  async status({ownerId}){check(ownerId);const c=connection();const status={state:c.state,...polling.status(c),...bridge.status()},native=planner?.status?.();return native?.syncError?{...status,syncActive:false,plannerActive:false,syncError:native.syncError,nextSyncAt:native.nextSyncAt}:status},
  async poll(){try{return await polling.poll()}finally{await mirror.publish()}},
  async events({ownerId}){check(ownerId);return {...events.list(),planner:bridge.status()}},
  async editEvent({ownerId,...input}){check(ownerId);return lifecycle(()=>events.mutate(input))},
  async connect({ownerId,session}){check(ownerId);if(typeof session!=='string'||!session)throw Error('invalid_session');mutate(c=>{c.generation=randomUUID();c.refresh=null;delete c.credentials;c.state='connecting'});return lifecycle(()=>oauth.start({owner,session}))},
  async callback({ownerId,session,...input}){check(ownerId);return lifecycle(()=>oauth.callback({owner,session,...input}))},
  async disconnect({ownerId}){check(ownerId);mutate(c=>{delete c.credentials;c.refresh=null;c.generation=randomUUID();c.state='disconnected'});await lifecycle(async()=>{})},
  // Initialization is a worker operation, never inferred from OAuth success.
  async initializeManagedCalendar(){const c=connection();if(c.managedCalendarId)return c.managedCalendarId;if(c.creationPending)throw Error('calendar_creation_uncertain');const generation=c.generation,token=await accessToken();mutate(r=>{if(r.generation!==generation||r.creationPending||r.managedCalendarId)throw Error('calendar_creation_fenced');r.creationPending=true});const result=await broker.createCalendar({accessToken:token,summary:'MeOS'});if(typeof result?.id!=='string'||!result.id||result.id==='primary')throw Error('invalid_calendar');return mutate(r=>{if(r.generation!==generation)throw Error('connection_changed');r.managedCalendarId=result.id;r.creationPending=false;return result.id})},

 };
 return service;
}
