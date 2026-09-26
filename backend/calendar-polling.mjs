// SPDX-License-Identifier: Apache-2.0
// Sole Google update transport. A complete collection and its next sync token
// commit together. Partial pages never replace a visible snapshot.
import {randomUUID} from 'node:crypto';
const valid=value=>typeof value==='string'&&value.length>0&&value.length<=16384;
export function createCalendarPolling({store,broker,connection,connectionKey,accessToken,initialize,flush=async()=>{},now=Date.now,random=Math.random}) {
 const stateKey='poll-state',snapshotKey=role=>'snapshot:'+role;
 function status(c=connection()) {
  const s=store.get(stateKey);
  return {syncActive:!!c.credentials&&s?.generation===c.generation&&s.lastSuccess!==undefined&&!s.failed,lastSyncAt:s?.generation===c.generation?s.lastSuccess??null:null,nextSyncAt:s?.generation===c.generation?s.nextAt??null:null,syncError:s?.generation===c.generation&&s.failed?'retrying':null};
 }
 async function poll() {
  const time=now(),c=connection();if(!c.credentials)return {skipped:true};
  const generation=c.generation,holder=randomUUID();
  const claimed=store.transaction(tx=>{const s=tx.get(stateKey)??{};if(s.lock&&s.lock.until>time)return false;if(s.generation===generation&&s.nextAt>time)return false;tx.set(stateKey,{...(s.generation===generation?s:{}),generation,lock:{holder,until:time+30000}});return true});
  if(!claimed)return {skipped:true};
  function fenced(tx){const current=tx.get(connectionKey),s=tx.get(stateKey);if(current?.generation!==generation||!current.credentials||s?.lock?.holder!==holder||s.lock.until<=now())throw Error('poll_fenced');return s}
  function renew(){store.transaction(tx=>{const s=fenced(tx);s.lock.until=now()+30000;tx.set(stateKey,s)})}
  try {
   renew();const managed=await initialize();
   for(const [role,calendarId] of [['primary','primary'],['managed',managed]]) {
    const previous=store.get(snapshotKey(role));let syncToken=previous?.generation===generation?previous.syncToken:undefined,recovered=false;
    for(;;){
     let pageToken;const pages=new Set(),events=new Map(syncToken?Object.entries(previous.events):[]);let finalToken;
     try {
      do {
       renew();const token=await accessToken();renew();
       const page=await broker.listEvents({calendarId,accessToken:token,syncToken,pageToken});
       if(!Array.isArray(page?.items)||page.items.length>2500)throw Error('invalid_page');
       for(const event of page.items){if(!valid(event?.id)||!['confirmed','tentative','cancelled'].includes(event.status))throw Error('invalid_event');events.set(event.id,Object.fromEntries(['id','etag','status','summary','description','location','start','end','recurrence','recurringEventId','originalStartTime','updated','extendedProperties'].filter(k=>event[k]!==undefined).map(k=>[k,event[k]])))}
       if(events.size>100000)throw Error('collection_limit');
       pageToken=page.nextPageToken;
       if(pageToken!==undefined){if(!valid(pageToken)||pages.has(pageToken)||pages.size>=10000||page.nextSyncToken!==undefined)throw Error('invalid_pagination');pages.add(pageToken)}
       else {if(!valid(page.nextSyncToken))throw Error('missing_sync_token');finalToken=page.nextSyncToken}
      }while(pageToken!==undefined);
     }catch(error){if(error.status===410&&syncToken&&!recovered){syncToken=undefined;recovered=true;continue}throw error}
     // Expand recurrence through Google's own timezone/exception engine for the
     // planner's current/next-week views, without restricting the full import.
     let expanded=[];
     if(broker.listWindow){
      const timeMin=new Date(now()-32*86400000).toISOString(),timeMax=new Date(now()+64*86400000).toISOString();let pageToken;const seen=new Set();
      do{renew();const token=await accessToken();renew();const page=await broker.listWindow({calendarId,accessToken:token,timeMin,timeMax,pageToken});if(!Array.isArray(page?.items))throw Error('invalid_window');expanded.push(...page.items);if(expanded.length>100000)throw Error('window_limit');pageToken=page.nextPageToken;if(pageToken!==undefined){if(!valid(pageToken)||seen.has(pageToken)||seen.size>=10000)throw Error('invalid_window_page');seen.add(pageToken)}}while(pageToken!==undefined);
     }
     store.transaction(tx=>{fenced(tx);tx.set(snapshotKey(role),{generation,calendarId,syncToken:finalToken,events:Object.fromEntries(events),expanded,revision:(previous?.revision??0)+1,updatedAt:now()})});break;
    }
   }
   await flush({renew,fenced,generation});
   store.transaction(tx=>{const s=fenced(tx);tx.set(stateKey,{generation,lastSuccess:now(),failures:0,failed:false,nextAt:now()+60000+Math.floor(random()*10001)-5000})});
   return {synced:true};
  }catch(error){
   store.transaction(tx=>{const s=tx.get(stateKey);if(s?.lock?.holder!==holder)return;const failures=Math.min((s.failures??0)+1,10);tx.set(stateKey,{...s,lock:null,failed:true,failures,nextAt:now()+Math.min(900000,60000*2**(failures-1))+Math.floor(random()*5001)})});
   throw error;
  }
 }
 return {poll,status};
}
