# SPDX-License-Identifier: Apache-2.0
"""Exact guest Calendar-cache proof, using only the independently admitted synthetic launcher."""
import hashlib,json,pathlib,runpy,stat,time,uuid
repo=pathlib.Path(__file__).resolve().parents[1]
admission=repo/'.qualification/release-notification-acceptance/admission.json'
info=admission.lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600
assert json.loads(admission.read_text())['calendarCacheHelperSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
c=runpy.run_path(str(repo/'scripts/notification-acceptance.py'))
request,db,verify,save=[c[k] for k in ['request','db','verify','save']]
agent,other=c['agent'],c['other'];verify()
with db() as conn:
 conn.execute('UPDATE _meos_agent_grants SET scopes=? WHERE agent_id=?',(json.dumps(['sync:read','sync:write','agenda:read']),uuid.UUID(agent['id']).bytes))
 conn.execute('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)',(uuid.UUID(other['id']).bytes,uuid.UUID(other['id']).bytes,json.dumps(['agenda:read']),int(time.time()*1000)+3600000))
at=c['login_native'](agent);ot=c['login_native'](other)
def call(name,args,token=at,error=False):
 code,body,_=request('server.sock','POST','/api/meos/v1/mcp',json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}),{'Authorization':'Bearer '+token['auth_token'],'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
 assert code==200,(name,code)
 result=json.loads(body)['result'];assert bool(result.get('isError'))==error,(name,result)
 return result if error else result['structuredContent']
period={'period':{'start':'2026-09-27','end':'2026-09-27'},'timezone':'UTC'}
assert call('list_calendar_events',period)['status']=='unavailable'
metadata={'available':True,'state':'connected','syncActive':True,'lastSyncAt':int(time.time()*1000),'plannerLastSyncAt':None,'windowStart':None,'windowEnd':None}
event={'id':'synthetic','role':'primary','etag':'x','summary':'Synthetic all-day context','location':'','description':'','start':{'date':'2026-09-27'},'end':{'date':'2026-09-28'},'linked':False,'recurring':False}
first={'sequence':1,'generation':'synthetic','page':0,'pages':2,'items':[event],'drafts':[],'conflicts':[],'metadata':metadata}
assert call('calendar_cache_publish',first)=={'sequence':1,'committed':False}
assert call('list_calendar_events',period)['status']=='unavailable'
last={**first,'page':1,'items':[]};del last['metadata']
assert call('calendar_cache_publish',last)=={'sequence':1,'committed':True}
assert call('list_calendar_events',period)['items']==[event]
assert call('list_calendar_events',period,ot)['items']==[]
call('calendar_cache_publish',first,ot,error=True)
code,body,_=request('server.sock','GET','/api/meos/v1/calendar-cache',headers=c['oh']);assert code==200 and json.loads(body)['items']==[event]
verify();c['docker']('restart',c['name']);c['ready']()
assert call('list_calendar_events',period)['items']==[event]
assert call('calendar_cache_publish',last)=={'sequence':1,'committed':True}
call('calendar_cache_publish',{**first,'sequence':2,'pages':1,'items':[]})
assert call('list_calendar_events',period)['items']==[]
call('calendar_cache_publish',last,error=True)
checks={'nativeMcpPublication':True,'partialUploadUnavailable':True,'allDaySchedulingRead':True,'ownerSeparation':True,'readOnlyAgentPublishDenied':True,'browserCacheRead':True,'restartPersistenceAndReplay':True,'replacementDeletionAndOldSequenceDenied':True}
save('native-calendar-cache-checks.json',{'runId':c['run'],'image':c['candidate']['image'],'checks':checks,'count':len(checks),'helperSHA256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()})
print(json.dumps({'status':'native-calendar-cache-qualified-synthetic-only','checks':checks}))
