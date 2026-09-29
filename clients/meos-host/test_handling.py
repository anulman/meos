# SPDX-License-Identifier: Apache-2.0
import json, pathlib, tempfile, time, unittest
from unittest.mock import patch
import dispatcher as d
import handling as h
import mcp_bridge as m

class HandlingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=d.connect(self.tmp.name)
        self.start=int(time.time()//60)*60000
        from datetime import datetime,timezone
        stamp=datetime.fromtimestamp(self.start/1000,timezone.utc)
        self.item={'kind':'tasks','id':'11111111-1111-4111-8111-111111111111','revision':1,'start':self.start,'end':self.start+1800000}
        self.event={'id':'first','type':'boundary','at':self.start,'starts':[self.item],'ends':[],'upcoming':[]}
        self.current={'deleted':False,'revision':1,'scheduledAt':stamp.isoformat(),'record':{'revision':1,'value':{'id':self.item['id'],'schedule':{'date':stamp.strftime('%Y-%m-%d'),'time':stamp.strftime('%H:%M'),'timezone':'UTC'},'durationMinutes':30}}}
        self.current['display']={'timezone':'America/Toronto','start':{'date':'2026-09-29','time':'11:45 am','offsetMinutes':-240},'end':{'date':'2026-09-29','time':'12:45 pm','offsetMinutes':-240}}
        self.read=lambda item:self.current
        self.receipt={'provider':'telegram','messageId':'42','chatId':'synthetic'}
    def tearDown(self):self.db.close();self.tmp.cleanup()
    def state(self):return self.db.execute('SELECT state FROM events WHERE id=?',(self.event['id'],)).fetchone()[0]
    def proposed_hook(self,config,identity,payload):
        capability=self.db.execute('SELECT capability FROM proposals WHERE event_id=?',(identity,)).fetchone()[0]
        h.propose(self.db,identity,capability,{'eventId':identity,'message':'Synthetic boundary','constituents':[k for k,_ in h.members(json.loads(payload))]})
        return {'ok':True,'runId':'run-verified','completion':{'status':'ok'}}
    def test_local_display_survives_advance_start_end_and_adjacent_delivery(self):
        for field in ('upcoming','starts','ends'):
            with self.subTest(field=field):
                event={**self.event,'id':field,'type':'pre' if field=='upcoming' else 'boundary','starts':[],'ends':[],'upcoming':[]}
                event[field]=[self.item]
                if field=='upcoming':event['at']=self.start-900000
                if field=='ends':event['at']=self.item['end']
                active=h.members(event)
                draft=h.draft_event(event,active,self.read)
                self.assertEqual(draft[field][0]['display'],self.current['display'])
                self.assertEqual(h.members(draft),active)
        # Real worker -> proposal -> delivery adapter, with adjacent constituents.
        event={**self.event,'ends':[{**self.item,'id':'22222222-2222-4222-8222-222222222222','start':self.start-1800000,'end':self.start}]}
        def read(item):
            from datetime import datetime,timezone
            return {**self.current,'scheduledAt':datetime.fromtimestamp(item['start']/1000,timezone.utc).isoformat(),'record':{'revision':1,'value':{**self.current['record']['value'],'id':item['id']}}}
        sent=[]
        def hook(config,identity,payload):
            draft=json.loads(payload)
            self.assertIn('ALL user-facing clock times',config['_proposalPrompt'])
            self.assertEqual(len(draft['starts']),1);self.assertEqual(len(draft['ends']),1)
            display=draft['starts'][0]['display']
            capability=self.db.execute('SELECT capability FROM proposals WHERE event_id=?',(identity,)).fetchone()[0]
            h.propose(self.db,identity,capability,{'eventId':identity,'message':'Previous block ended. Walk starts at '+display['start']['time']+', until '+display['end']['time']+'.','constituents':[k for k,_ in h.members(draft)]})
            return {'runId':'local-proof','completion':{'status':'ok'}}
        d.admit(self.db,event,event['id'])
        d.step(self.db,{'mode':'notifications'},hook,read,lambda *args:sent.append(args[-1]) or self.receipt)
        self.assertEqual(self.state(),'handled_delivered')
        self.assertEqual(sent,['Previous block ended. Walk starts at 11:45 am, until 12:45 pm.'])
        self.assertEqual(self.db.execute("SELECT count(*) FROM constituents WHERE state='delivered'").fetchone()[0],2)

    def test_missing_display_context_does_not_guess_utc_or_send(self):
        self.current['display']=None
        d.admit(self.db,self.event,self.event['id']);sent=[]
        d.step(self.db,{'mode':'notifications'},self.proposed_hook,self.read,lambda *args:sent.append(args) or self.receipt)
        self.assertEqual(self.state(),'blocked_unknown');self.assertEqual(sent,[])

    def test_verified_delivery_survives_restart_and_regrouping(self):
        d.admit(self.db,self.event,'first');sent=[]
        d.step(self.db,{'mode':'notifications'},self.proposed_hook,self.read,lambda *a:sent.append(a) or self.receipt)
        self.assertEqual(self.state(),'handled_delivered');self.assertEqual(len(sent),1)
        self.db.close();self.db=d.connect(self.tmp.name)
        event={**self.event,'id':'regrouped'};d.admit(self.db,event,'regrouped')
        d.step(self.db,{'mode':'notifications'},lambda *a:self.fail('must not repeat'),self.read)
        self.assertEqual(self.db.execute('SELECT state FROM events WHERE id="regrouped"').fetchone()[0],'handled_noop')
    def test_stale_deleted_completed_are_proven_noops_without_agent(self):
        for value in [{'deleted':True}, {**self.current,'record':{**self.current['record'],'revision':2}}, {**self.current,'record':{'revision':1,'value':{**self.current['record']['value'],'completed':True}}}]:
            self.db.execute('DELETE FROM constituents');self.db.commit()
            self.current=value;self.event['id']=str(len(self.db.execute('SELECT * FROM events').fetchall()))
            d.admit(self.db,self.event,self.event['id']);d.step(self.db,{'mode':'notifications'},lambda *a:self.fail('no hook'),self.read)
            self.assertEqual(self.state(),'handled_noop')
    def test_cancel_while_drafting_never_sends(self):
        d.admit(self.db,self.event,'first')
        def hook(*args):
            result=self.proposed_hook(*args);self.current={'deleted':True};return result
        d.step(self.db,{'mode':'notifications'},hook,self.read,lambda *a:self.fail('stale delivery'))
        self.assertEqual(self.state(),'blocked_unknown')
        self.assertEqual(self.db.execute('SELECT run_id FROM events').fetchone()[0],'run-verified')
    def test_unknown_delivery_blocks_regrouping_without_replay(self):
        d.admit(self.db,self.event,'first')
        d.step(self.db,{'mode':'notifications'},self.proposed_hook,self.read,lambda *a:(_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(self.state(),'blocked_unknown')
        event={**self.event,'id':'regrouped'};d.admit(self.db,event,'regrouped')
        d.step(self.db,{'mode':'notifications'},lambda *a:self.fail('ambiguous replay'),self.read)
        self.assertEqual(self.db.execute('SELECT state FROM events WHERE id="regrouped"').fetchone()[0],'blocked_unknown')
    def test_both_dst_folds_match_native_explicit_offset(self):
        from datetime import datetime,timezone,timedelta
        for offset in (-240,-300):
            start=int(datetime(2025,11,2,1,30,tzinfo=timezone(timedelta(minutes=offset))).timestamp()*1000)
            item={**self.item,'start':start,'end':start+1800000,'at':start,'boundary':'start'}
            current={'scheduledAt':datetime.fromtimestamp(start/1000,timezone.utc).isoformat(),'record':{'revision':1,'value':{'id':item['id'],'durationMinutes':30,'schedule':{'date':'2025-11-02','time':'01:30','timezone':'America/Montreal','offsetMinutes':offset}}}}
            self.assertIsNone(h.freshness(item,current,start+1000))
        del current['scheduledAt']
        with self.assertRaises(ValueError):h.freshness(item,current,start+1000)

    def test_capability_and_proposal_are_not_completion(self):
        d.admit(self.db,self.event,'first');d.claim(self.db);cap=h.prepare_proposal(self.db,'first')
        with self.assertRaises(ValueError):h.propose(self.db,'first','wrong',{})
        h.propose(self.db,'first',cap,{'eventId':'first','message':'x','constituents':[]})
        self.assertEqual(self.state(),'dispatching');self.assertEqual(self.db.execute('SELECT count(*) FROM deliveries').fetchone()[0],0)
        with self.assertRaises(ValueError):h.deliver(self.db,{},self.event,h.eligible(self.db,self.event,self.read),{'eventId':'first','message':'x','constituents':[]},self.read)

class SocketTests(unittest.TestCase):
    def test_long_unix_socket_path(self):
        import socket, threading
        with tempfile.TemporaryDirectory() as directory:
            parent=pathlib.Path(directory)/('long'*30);parent.mkdir();path=parent/'server.sock'
            fd=__import__('os').open(parent,__import__('os').O_DIRECTORY)
            server=socket.socket(socket.AF_UNIX);server.bind('/proc/self/fd/'+str(fd)+'/server.sock');server.listen()
            __import__('os').close(fd)
            client=m.UnixHTTP('synthetic',str(path));client.connect();peer,_=server.accept()
            client.sock.sendall(b'proof');self.assertEqual(peer.recv(5),b'proof')
            client.close();peer.close();server.close()

class DeliveryAdapterTests(unittest.TestCase):
    def test_real_loopback_provider_receipt_contract_and_target_check(self):
        import http.server, threading
        with tempfile.TemporaryDirectory() as directory:
            token=pathlib.Path(directory)/'token';token.write_text('synthetic-only');token.chmod(0o600)
            requests=[];response={'ok':True,'result':{'details':{'ok':True,'messageId':'23','chatId':'123'}}}
            class Handler(http.server.BaseHTTPRequestHandler):
                def do_POST(self):
                    requests.append((self.path,json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                    self.send_response(200);self.end_headers();self.wfile.write(json.dumps(response).encode())
                def log_message(self,*args):pass
            server=http.server.HTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            config={'hookHost':'127.0.0.1','hookPort':server.server_port,'gatewayTokenFile':str(token),'deliveryTarget':'telegram:123'}
            try:
                self.assertEqual(h.send_message(config,'key','private synthetic'),{'provider':'telegram','messageId':'23','chatId':'123'})
                self.assertEqual(requests[0][0],'/tools/invoke');self.assertEqual(requests[0][1]['args']['target'],'telegram:123')
                response['result']['details']['chatId']='other'
                with self.assertRaises(ValueError):h.send_message(config,'key2','synthetic')
                response['result']['details']={'status':'suppressed'}
                with self.assertRaises(ValueError):h.send_message(config,'key3','synthetic')
            finally:server.shutdown();server.server_close()
