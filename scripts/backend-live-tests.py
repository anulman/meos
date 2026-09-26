# SPDX-License-Identifier: Apache-2.0
import pathlib,json,os,http.client,urllib.parse,socket,uuid
q=pathlib.Path(__file__).resolve().parents[1]/'.qualification';e=json.loads((q/'acceptance-endpoint.json').read_text());creds=json.loads((q/'synthetic-credentials.json').read_text());assert e['runId']==creds['runId'];os.chdir('/run/meos-acceptance-data')
class UnixConnection(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect('server.sock')
def request(method,path,body=None,headers=None):
 c=UnixConnection('meos-acceptance.invalid');c.request(method,path,body,{'Host':'meos-acceptance.invalid',**(headers or {})});r=c.getresponse();b=r.read();h={**dict(r.getheaders()),'cookies':r.headers.get_all('Set-Cookie') or []};c.close();return r.status,h,b
checks=[]
def check(name,condition):
 if not condition:raise AssertionError(name)
 checks.append(name)
def login(user):
 s,h,b=request('POST','/api/auth/v1/login',urllib.parse.urlencode({key:user[key] for key in ['email','password']}),{'Content-Type':'application/x-www-form-urlencoded','Origin':e['origin']});check('form login token-free',s in [200,303] and b'auth_token' not in b)
 check('two Secure HttpOnly cookies',len(h['cookies'])==2 and all('HttpOnly' in c and 'Secure' in c for c in h['cookies']))
 cookie='; '.join(x.split(';')[0] for x in h['cookies']);s,h,b=request('GET','/api/meos/v1/session',headers={'Cookie':cookie});j=json.loads(b);check('safe session identity',s==200 and j.get('user',{}).get('id') and j.get('csrf') and set(j)=={'user','csrf'});return cookie,j
cookie,session=login(creds['users'][0]);other,otherSession=login(creds['users'][1]);base='/api/meos/v1';headers={'Cookie':cookie,'Content-Type':'application/json','Origin':e['origin'],'X-CSRF-Token':session['csrf']}
def command(method,path,value=None,expected=None,h=None):
 body={'value':value}
 if expected is not None:body['expectedRevision']=expected
 s,hh,b=request(method,base+path,json.dumps(body) if method in ['POST','PUT'] else None,headers if h is None else h)
 try:j=json.loads(b)
 except:j=None
 return s,j
s,j=command('GET','/resources/tasks',h={});check('anonymous read denied',s==401)
s,j=command('GET','/resources/tasks',h={'__context':json.dumps({'kind':'Http','user':{'id':'forged','csrf_token':'forged'}})});check('forged host context denied',s==401)
p={'id':str(uuid.uuid4()),'title':'Synthetic live project','notes':{'type':'doc'}}
s,j=command('POST','/resources/projects',p);check('live project create',s==201 and j['revision']==1)
t={'id':str(uuid.uuid4()),'title':'Synthetic timed task','completed':False,'priority':'none','projectId':p['id'],'schedule':{'date':'2026-09-26','time':'09:00','timezone':'America/Montreal'},'notes':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Durable café 🌿','marks':[{'type':'strong'}]}]}]}}
s,j=command('POST','/resources/tasks',t);check('live task and rich text create',s==201 and j['value']==t)
s,j=command('GET','/resources/tasks/'+t['id']);check('live read roundtrip',s==200 and j['value']==t)
s,j=command('GET','/resources/tasks/'+t['id'],h={'Cookie':other});check('second owner read denied',s==404)
s,j=command('PUT','/resources/tasks/'+t['id'],t,1,h={**headers,'Cookie':other,'X-CSRF-Token':otherSession['csrf']});check('second owner update denied',s==404)
s,j=command('PUT','/resources/tasks/'+t['id'],t,1,h={**headers,'Origin':'https://production.invalid'});check('wrong origin denied',s==403)
s,j=command('PUT','/resources/tasks/'+t['id'],t,1,h={**headers,'X-CSRF-Token':'bad'});check('wrong csrf denied',s==403)
invalid={**t,'schedule':{'date':'2026-09-26','timezone':'America/Montreal'}};s,j=command('PUT','/resources/tasks/'+t['id'],invalid,1);check('Anytime rejected live',s==422)
t['completed']=True;s,j=command('PUT','/resources/tasks/'+t['id'],t,1);check('live revision increment',s==200 and j['revision']==2)
s,j=command('PUT','/resources/tasks/'+t['id'],t,1);check('stale revision conflict',s==409)
s,j=command('POST','/commands/archive-project/'+p['id'],None,1);check('archive atomic command',s==200)
s,j=command('GET','/resources/tasks/'+t['id']);check('archive detaches task',s==200 and 'projectId' not in j['value'] and j['value']['completed'])
s,j=command('GET','/resources/tasks?limit=1');check('live pagination',s==200 and len(j['items'])==1)
s,j=command('GET','/preferences');check('default preferences live',s==200 and 'value' in j)
routine={'id':str(uuid.uuid4()),'title':'Synthetic morning routine','weekdays':[1,3,5],'time':'08:30','timezone':'America/Montreal','notes':{'type':'doc'}}
s,j=command('POST','/resources/routines',routine);check('routine create live',s==201)
occurrence={'id':str(uuid.uuid4()),'routineId':routine['id'],'date':'2026-09-28','completed':True}
s,j=command('POST','/commands/occurrence',occurrence,0);check('occurrence natural create',s==200 and j['revision']==1)
s,j=command('POST','/commands/occurrence',occurrence,0);check('occurrence retry idempotent',s==200 and j['revision']==1)
period={'start':'2026-09-28','end':'2026-10-04'}
note={'id':str(uuid.uuid4()),'kind':'week','period':period,'notes':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Synthetic weekly reflection'}]}]}}
s,j=command('POST','/commands/period-note',note,0);check('week note live',s==200 and j['value']==note)
outcome={'id':str(uuid.uuid4()),'taskId':t['id'],'period':period,'position':0}
s,j=command('POST','/resources/outcomes',outcome);check('weekly outcome live',s==201)
s,j=command('DELETE','/resources/outcomes/'+outcome['id']+'?revision=1');check('outcome removal live',s==204)

s,j=command('GET','/weather');check('weather disabled without network',s==200 and j['status']=='unavailable' and j['hourly']==[])
(q/'live-fixture.json').write_text(json.dumps({'taskId':t['id'],'projectId':p['id'],'ownerId':session['user']['id'],'runId':e['runId']},indent=2))
(q/'live-checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'runId':e['runId']},indent=2))
print(json.dumps({'checks':checks,'count':len(checks)}))
