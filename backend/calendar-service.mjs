// SPDX-License-Identifier: Apache-2.0
// Private service: durable credentials never appear in public status or HTTP responses.
import {randomUUID,createHash} from 'node:crypto';
import {createCalendarOAuth} from './calendar-oauth.mjs';
import {createCalendarWatch} from './calendar-watch.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createCalendarService({config,store,broker,now=Date.now}) {
 const owner=config.ownerId, ownerHash=hash(owner), connectionKey='connection:'+ownerHash;
 const check=id=>{if(id!==owner)throw Error('owner_required')};
 const initial=()=>({generation:randomUUID(),state:'disconnected'});
 function connection(tx=store){return tx.get(connectionKey)??initial()}
 function mutate(fn){return store.transaction(tx=>{const c=connection(tx),result=fn(c,tx);tx.set(connectionKey,c);return result})}
 const oauthStore={
  async putAttempt(key,record){mutate((c,tx)=>{const name='attempt:'+key;if(tx.get(name))throw Error('attempt_exists');tx.set(name,{...record,generation:c.generation});})},
  async consumeAttempt(key){return store.transaction(tx=>{const name='attempt:'+key,r=tx.get(name);tx.delete(name);return r??null})},
  async saveConnection(id,record,{generation}){check(id);return mutate(c=>{if(c.generation!==generation)return false;Object.assign(c,{credentials:record,state:'connected',refresh:null});return true})},
  async beginRefresh(id,time){check(id);return mutate(c=>{if(!c.credentials)return null;if(c.refresh){if(c.refresh.expiresAt>time)return {busy:true};delete c.credentials;c.state='needs_consent';c.generation=randomUUID();c.refresh=null;return null}const lease=randomUUID();c.refresh={lease,expiresAt:time+60000};return {lease,refreshToken:c.credentials.refreshToken,scope:c.credentials.scope}})},
  async finishRefresh(id,lease,record){check(id);return mutate(c=>{if(c.refresh?.lease!==lease||!c.credentials||c.refresh.expiresAt<=now())return false;c.credentials={...c.credentials,...record};c.refresh=null;return true})},
  async failRefresh(id,lease,{reconnectRequired}){check(id);return mutate(c=>{if(c.refresh?.lease!==lease)return false;c.refresh=null;if(reconnectRequired){delete c.credentials;c.generation=randomUUID();c.state='needs_consent'}return true})},
 };
 const oauth=createCalendarOAuth({config,store:oauthStore,tokenExchange:broker.tokenExchange,refreshExchange:broker.refreshExchange,verifyIdentity:broker.verifyIdentity,now});
 const channelKey=id=>'channel:'+hash(id);
 const watchStore={
  async putIfAbsent(id,record){return store.transaction(tx=>{const key=channelKey(id);if(tx.get(key))return false;tx.set(key,{...record,generation:connection(tx).generation});tx.set('channel-index',[...(tx.get('channel-index')??[]),id]);return true})},
  async get(id){return store.get(channelKey(id))},
  async transact(id,fn){return store.transaction(tx=>{const {record,result}=fn(tx.get(channelKey(id)));tx.set(channelKey(id),record);return result})},
 };
 function watch(){const c=connection();if(!c.managedCalendarId)throw Error('calendar_not_initialized');return createCalendarWatch({config:{owner,primaryCalendarId:'primary',managedCalendarId:c.managedCalendarId,address:config.notificationUrl},store:watchStore,provider:{watch:async input=>broker.watch({...input,accessToken:await accessToken()}),stop:async input=>broker.stop({...input,accessToken:await accessToken()})},now})}
 async function accessToken(){let c=connection();if(!c.credentials)throw Error('reconnect_required');if(c.credentials.expiresAt<=now()+60000){await oauth.refresh({owner});c=connection()}if(!c.credentials||c.credentials.expiresAt<=now())throw Error('reconnect_required');return c.credentials.accessToken}
 return {
  async status({ownerId}){check(ownerId);const c=connection();const channels=await Promise.all((store.get('channel-index')??[]).map(id=>watchStore.get(id)));return {state:c.state,subscriptionsActive:!!c.credentials&&['primary','managed'].every(role=>channels.some(r=>r.owner===owner&&r.generation===c.generation&&r.role===role&&r.phase==='active'&&r.expiresAt>now()))}},
  async connect({ownerId,session}){check(ownerId);if(typeof session!=='string'||!session)throw Error('invalid_session');mutate(c=>{c.generation=randomUUID();c.refresh=null;delete c.credentials;c.state='connecting'});return oauth.start({owner,session})},
  async callback({ownerId,session,...input}){check(ownerId);return oauth.callback({owner,session,...input})},
  async disconnect({ownerId}){check(ownerId);mutate(c=>{delete c.credentials;c.refresh=null;c.generation=randomUUID();c.state='disconnected'})},
  async enqueueNotification(input){const c=connection(),r=await watchStore.get(input?.channelId??'');if(!c.credentials||r?.generation!==c.generation)throw Error('inactive_connection');return watch().notification(input)},
  // Initialization is a worker operation, never inferred from OAuth success.
  async initializeManagedCalendar(){const c=connection();if(c.managedCalendarId)return c.managedCalendarId;if(c.creationPending)throw Error('calendar_creation_uncertain');const generation=c.generation,token=await accessToken();mutate(r=>{if(r.generation!==generation||r.creationPending||r.managedCalendarId)throw Error('calendar_creation_fenced');r.creationPending=true});const result=await broker.createCalendar({accessToken:token,summary:'MeOS'});if(typeof result?.id!=='string'||!result.id||result.id==='primary')throw Error('invalid_calendar');return mutate(r=>{if(r.generation!==generation)throw Error('connection_changed');r.managedCalendarId=result.id;r.creationPending=false;return result.id})},
  async maintainChannels(){if(!connection().credentials)return;const generation=connection().generation,w=watch();for(const id of store.get('channel-index')??[]){if((await watchStore.get(id))?.generation!==generation)continue;const s=await w.status(id);if(s.needsRenewal)await w.renew(id);if(s.stopPending)await w.stopRetired(id)}for(const role of ['primary','managed']){const records=await Promise.all((store.get('channel-index')??[]).map(id=>watchStore.get(id)));if(!records.some(r=>r.generation===generation&&r.role===role&&['active','registering','uncertain','reconnect_required'].includes(r.phase)&&r.expiresAt>now()))await w.start(role)}},
 };
}
