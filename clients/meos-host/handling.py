# SPDX-License-Identifier: Apache-2.0
"""Executable freshness and delivery receipts for notification-only handling.
Agent output is a proposal, never evidence of a completed effect.
"""
import hashlib, http.client, json, pathlib, time, secrets
from datetime import datetime, timezone
from mcp_bridge import Bridge, private


def initialize(db):
    db.execute('CREATE TABLE IF NOT EXISTS constituents (key TEXT PRIMARY KEY, event_id TEXT NOT NULL, state TEXT NOT NULL, evidence TEXT NOT NULL, updated REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS deliveries (key TEXT PRIMARY KEY, event_id TEXT NOT NULL, members TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT, updated REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS proposals (event_id TEXT PRIMARY KEY, capability TEXT NOT NULL, body TEXT)')
    db.commit()


def prepare_proposal(db,event_id):
    capability=secrets.token_hex(32)
    with db:db.execute('INSERT INTO proposals VALUES(?,?,NULL)',(event_id,capability))
    return capability


def propose(db,event_id,capability,body):
    if not isinstance(body,dict) or len(json.dumps(body).encode())>20000:raise ValueError('invalid proposal')
    with db:
        row=db.execute('SELECT p.capability,p.body,e.state FROM proposals p JOIN events e ON e.id=p.event_id WHERE p.event_id=?',(event_id,)).fetchone()
        if not row or not isinstance(capability,str) or not secrets.compare_digest(row[0],capability) or row[2]!='dispatching':raise ValueError('proposal capability denied')
        encoded=json.dumps(body,sort_keys=True)
        if row[1] is not None and row[1]!=encoded:raise ValueError('proposal conflict')
        db.execute('UPDATE proposals SET body=? WHERE event_id=?',(encoded,event_id))
    return {'accepted':True,'eventId':event_id,'effects':'none'}


def members(event):
    result=[]
    if event.get('type') not in ('pre','boundary') or not isinstance(event.get('at'), (int,float)):
        raise ValueError('invalid boundary')
    for field,boundary in [('starts','start'),('ends','end'),('upcoming','pre')]:
        for item in event.get(field,[]):
            if item.get('kind') not in ('tasks','occurrences') or not isinstance(item.get('revision'),int) or item['revision']<1:
                raise ValueError('invalid constituent')
            record={k:item[k] for k in ('kind','id','revision','start','end')}
            record.update(boundary=boundary,at=event['at'])
            encoded=json.dumps(record,sort_keys=True,separators=(',',':'))
            result.append((hashlib.sha256(encoded.encode()).hexdigest(),record))
    if not result or len(result)>500 or len({k for k,_ in result})!=len(result):
        raise ValueError('invalid boundary membership')
    return result


def draft_event(event,active,read):
    selected={(item['kind'],item['id'],item['revision'],item['boundary']) for _,item in active}
    result={k:event[k] for k in ('id','type','at')}
    for field,boundary in [('starts','start'),('ends','end'),('upcoming','pre')]:
        result[field]=[]
        for item in event.get(field,[]):
            if (item['kind'],item['id'],item['revision'],boundary) not in selected:continue
            current=read(item)
            display=current.get('display')
            if not isinstance(display,dict) or not display.get('timezone') or not display.get('start') or not display.get('end'):
                raise ValueError('configured local display times unavailable')
            result[field].append({**item,'title':current['record']['value'].get('title',''),'notes':current['record']['value'].get('notes',{'type':'doc'}),'display':display})
    return result


def current_reader(config):
    bridge=Bridge(json.loads(private(config['mcpConfigFile']).read_text()))
    def read(item):
        result=bridge.call({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'get_current','arguments':{'kind':item['kind'],'id':item['id']}}})
        data=result.get('result',{})
        if data.get('isError'):
            try: error=json.loads(data['content'][0]['text'])
            except Exception: raise ValueError('freshness read failed') from None
            if error.get('error',{}).get('code')=='not_found':return {'deleted':True,'record':None}
            raise ValueError('freshness read failed')
        if not isinstance(data.get('structuredContent'),dict):raise ValueError('missing current record')
        return data['structuredContent']
    return read


def freshness(item,current,now):
    if current.get('deleted') is True:return 'deleted'
    record=current.get('record')
    if not isinstance(record,dict) or not isinstance(record.get('value'),dict):raise ValueError('invalid fresh record')
    value=record['value']
    if value.get('id')!=item['id']:raise ValueError('fresh identity mismatch')
    if record.get('revision')!=item['revision']:return 'revision_changed'
    if value.get('archived') or value.get('skipped') or value.get('completed'):return 'inactive'
    schedule=value.get('schedule')
    if not schedule or not value.get('durationMinutes'):return 'unscheduled'
    # Require the record's actual scheduled instant, not only its revision.
    # Use the backend's pinned timezone rules and explicit DST offset. Host
    # tzdata versions and case-sensitive ZoneInfo names are not authoritative.
    at=current.get('scheduledAt')
    if not isinstance(at,str):raise ValueError('missing authoritative scheduled instant')
    instant=datetime.fromisoformat(at.replace('Z','+00:00'))
    if instant.tzinfo is None:raise ValueError('scheduled instant needs timezone')
    start=int(instant.timestamp()*1000);end=start+value['durationMinutes']*60000
    if start!=item['start'] or end!=item['end']:return 'schedule_changed'
    if item['boundary']=='pre' and now>=start:return 'expired_pre'
    if item['boundary']=='start' and item['at']!=start:return 'boundary_changed'
    if item['boundary']=='end' and item['at']!=end:return 'boundary_changed'
    if item['boundary']=='pre' and item['at']>=start:return 'boundary_changed'
    if item['at']>now:raise ValueError('boundary not due')
    return None


def eligible(db,event,read,now=None):
    now=time.time()*1000 if now is None else now
    active=[]
    for key,item in members(event):
        previous=db.execute('SELECT state FROM constituents WHERE key=?',(key,)).fetchone()
        if previous and previous[0] in ('delivered','noop'):continue
        # Unknown deliveries fence every regrouping of the same constituent.
        if previous and previous[0]=='delivery_intent':raise ValueError('delivery outcome unknown')
        reason=freshness(item,read(item),now)
        if reason:
            with db:db.execute('INSERT INTO constituents VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state,evidence=excluded.evidence,updated=excluded.updated',(key,event['id'],'noop',json.dumps({'reason':reason}),time.time()))
        else:active.append((key,item))
    return active


def send_message(config,identity,text):
    if config['hookHost'] not in ('127.0.0.1','::1'):raise ValueError('private gateway required')
    target=config['deliveryTarget']
    if not isinstance(target,str) or not target:raise ValueError('fixed target required')
    token=private(config['gatewayTokenFile']).read_text().strip()
    conn=http.client.HTTPConnection(config['hookHost'],config['hookPort'],timeout=60)
    try:
        body={'tool':'message','args':{'action':'send','channel':'telegram','target':target,'message':text},'idempotencyKey':'meos-delivery:'+identity}
        conn.request('POST','/tools/invoke',json.dumps(body),{'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        response=conn.getresponse();raw=response.read(1048577)
        if response.status!=200 or len(raw)>1048576:raise ValueError('delivery outcome unknown')
        result=json.loads(raw)
        if result.get('ok') is not True:raise ValueError('delivery rejected')
        data=result.get('result',{})
        # OpenClaw's message tool returns its provider receipt in details.
        receipt=data.get('details',data)
        if not isinstance(receipt,dict) or receipt.get('ok') is not True or not receipt.get('messageId'):
            raise ValueError('missing provider receipt')
        if str(receipt.get('chatId'))!=target.removeprefix('telegram:'):
            raise ValueError('delivery target receipt mismatch')
        return {'provider':'telegram','messageId':str(receipt['messageId']),'chatId':str(receipt['chatId'])}
    finally:conn.close()


def deliver(db,config,event,active,proposal,read,send=send_message):
    if not isinstance(proposal,dict) or set(proposal)!={'eventId','message','constituents'} or proposal['eventId']!=event['id']:
        raise ValueError('invalid handling proposal')
    keys=[k for k,_ in active]
    if proposal['constituents']!=keys or not isinstance(proposal['message'],str) or not 1<=len(proposal['message'])<=3500:
        raise ValueError('proposal membership mismatch')
    # A second fresh read immediately precedes the external effect. If any
    # member changed, discard the whole generated text (it may mention it).
    latest=eligible(db,event,read)
    if [k for k,_ in latest]!=keys:raise ValueError('boundary changed while drafting')
    identity=hashlib.sha256(json.dumps(keys).encode()).hexdigest()
    with db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM deliveries WHERE key=?',(identity,)).fetchone():raise ValueError('delivery already attempted')
        db.execute('INSERT INTO deliveries VALUES(?,?,?,?,?,?)',(identity,event['id'],json.dumps(keys),'intent',None,time.time()))
        for key,_ in active:db.execute('INSERT INTO constituents VALUES(?,?,?,?,?)',(key,event['id'],'delivery_intent','{}',time.time()))
    # Unknown send outcomes intentionally retain the intent and never replay.
    receipt=send(config,identity,proposal['message'])
    if not isinstance(receipt,dict) or receipt.get('provider')!='telegram' or not receipt.get('messageId') or not receipt.get('chatId'):
        raise ValueError('invalid delivery receipt')
    with db:
        db.execute('UPDATE deliveries SET state=?,receipt=?,updated=? WHERE key=?',('delivered',json.dumps(receipt),time.time(),identity))
        for key in keys:db.execute('UPDATE constituents SET state=?,evidence=?,updated=? WHERE key=?',('delivered',json.dumps(receipt),time.time(),key))
    return receipt
