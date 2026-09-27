# SPDX-License-Identifier: Apache-2.0
"""Exact-candidate external embedding proof; requires independent helper admission.
Reuses the existing fresh synthetic-only launcher. Never accepts production state.
"""
import hashlib,json,pathlib,runpy,stat,sys,time,uuid
repo=pathlib.Path(__file__).resolve().parents[1]
q=repo/'.qualification/release-notification-acceptance'
admission=q/'admission.json';info=admission.lstat()
assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600
assert json.loads(admission.read_text())['searchHelperSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
context=runpy.run_path(str(repo/'scripts/notification-acceptance.py'))
request,db,verify,save=[context[k] for k in ['request','db','verify','save']]
owner,agent,other,notification=[context[k] for k in ['owner','agent','other','notification']]
login=context['login_native'];origin=context['candidate']['origin'];consumer='b'*32
verify()
with db() as conn:
 conn.execute('UPDATE _meos_agent_grants SET scopes=? WHERE agent_id=?',(json.dumps(['search:index','search:read','notifications:consume']),uuid.UUID(agent['id']).bytes))
 conn.execute('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)',(uuid.UUID(context['bridge']['id']).bytes,uuid.UUID(other['id']).bytes,json.dumps(['search:index','search:read']),int(time.time()*1000)+3600000))
at=login(agent);ot=login(context['bridge']);nt=login(notification)
def headers(token):return {'Authorization':'Bearer '+token['auth_token'],'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
def call(name,args,token=at):
 code,body,_=request('server.sock','POST','/api/meos/v1/mcp',json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}),headers(token))
 assert code==200,(name,code)
 value=json.loads(body);assert 'result' in value,(name,value)
 assert not value['result'].get('isError'),(name,value)
 return value['result']['structuredContent']
def poll(op='poll',extra=None,token=at):
 code,body,_=request('server.sock','POST','/api/meos/v1/notifications',json.dumps({'op':op,'consumer':consumer,**(extra or {})}),headers(token));return code,json.loads(body)
assert poll('configure',{'preferences':{'recordUpdates':True}},nt)[0]==403
assert poll('configure',{'preferences':{'recordUpdates':True}})[0]==200
call('configure_search',{'enabled':True});call('configure_search',{'enabled':True},ot)
entity=str(uuid.uuid4());source={'id':entity,'title':'Native external embedding 🍎','notes':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'🍎'*1800}]}]},'completed':False,'priority':'none'}
code,_,_=request('server.sock','POST','/api/meos/v1/resources/tasks',json.dumps({'value':source}),context['oh']);assert code==201
code,batch=poll();assert code==200
updates=[e for e in batch['items'] if e['type']=='record.updated'];assert len(updates)==1 and updates[0]['source']['id']==entity
job=call('search_index_batch',{'limit':1,'source':{'kind':'tasks','id':entity}})['items'][0]
assert job['inputHash']==hashlib.sha256(job['text'].encode()).hexdigest() and len(job['text'].encode())<=6000
assert not job['text'].endswith('\ufffd')
input={k:job[k] for k in ['id','revision','model','dimensions','indexVersion','inputVersion','inputHash']};input['embedding']=[1]+[0]*1535
assert call('search_index_commit',input,ot)=={'accepted':False}
assert call('search_index_commit',{**input,'model':'wrong'})=={'accepted':False}
assert call('search_query_commit',input)=={'accepted':False}
def counts():
 with db() as conn:return [conn.execute('SELECT revision FROM tasks WHERE uuid=?',(entity,)).fetchone()[0],conn.execute('SELECT count(*) FROM sync_outbox').fetchone()[0],conn.execute('SELECT count(*) FROM notification_events').fetchone()[0]]
before=counts()
assert call('search_index_commit',input)=={'accepted':True}
assert call('search_index_commit',input)=={'accepted':True}
assert counts()==before
assert poll('ack',{'ackToken':batch['ackToken']})==(200,{'acked':True})
assert poll()[1]['items']==[]
result=call('search',{'query':'fruit connection'});query=result['queryJob'];assert result['semantic']=='pending'
query_input={k:query[k] for k in input if k!='embedding'};query_input['embedding']=input['embedding']
# Exercise narrow query authority, then prove document type remains denied.
with db() as conn:conn.execute('UPDATE _meos_agent_grants SET scopes=? WHERE agent_id=?',(json.dumps(['search:read']),uuid.UUID(agent['id']).bytes))
assert call('search_query_commit',input)=={'accepted':False}
assert call('search_query_commit',query_input)=={'accepted':True}
result=call('search',{'query':'fruit connection'});assert result['semantic']=='ready' and any(i['id']==entity for i in result['items'])
assert counts()==before
verify();context['docker']('restart',context['name']);context['ready']()
assert call('search',{'query':'fruit connection'})['semantic']=='ready'
checks={'nativeCanonicalInputSHA256':True,'realVec0DocumentAndQueryCommit':True,'queryOnlyScopeRejectsDocuments':True,'wrongOwnerModelAndTypeDenied':True,'updateOptInAndScopedDenial':True,'sourceRevisionOutboxAndEventsUnchangedByCommit':True,'idempotentReplay':True,'semanticRetrievalSurvivesRestart':True}
save('native-search-external-checks.json',{'runId':context['run'],'image':context['candidate']['image'],'checks':checks,'count':len(checks),'helperSHA256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()})
print(json.dumps({'status':'native-external-search-qualified-synthetic-only','checks':checks}))
