# SPDX-License-Identifier: Apache-2.0
import contextlib, io, json, os, pathlib, sys, tempfile, unittest
from unittest.mock import patch
import dispatcher as d
import mcp_bridge as m

class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=d.connect(self.tmp.name)
    def tearDown(self): self.db.close();self.tmp.cleanup()
    def state(self): return self.db.execute('SELECT state FROM events').fetchone()[0]
    def admit(self): return d.admit(self.db,{'id':'event:1','revision':2},'event:1')
    def test_duplicate_and_conflict(self):
        self.assertEqual(self.admit(),self.admit())
        with self.assertRaises(ValueError): d.admit(self.db,{'id':'event:1','revision':3},'event:1')
        self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],1)
    def test_receipt_persisted_before_return(self):
        self.admit()
        other=__import__('sqlite3').connect(pathlib.Path(self.tmp.name)/'queue.sqlite')
        self.assertEqual(other.execute('SELECT state FROM events').fetchone()[0],'queued');other.close()
    def test_mismatch(self):
        with self.assertRaises(ValueError): d.admit(self.db,{'id':'wrong'},'event:1')
    def test_crash_before_hook_blocks_without_replay(self):
        self.admit();d.claim(self.db);d.recover(self.db)
        self.assertEqual(self.state(),'blocked_unknown')
        self.assertFalse(d.step(self.db,{},lambda *a:self.fail('must not replay')))
    def test_lost_response_blocks_once(self):
        self.admit()
        with contextlib.redirect_stderr(io.StringIO()) as log:
            d.step(self.db,{},lambda *a:(_ for _ in ()).throw(TimeoutError()))
            d.alert(self.db);d.recover(self.db);d.alert(self.db)
        self.assertEqual(log.getvalue().count('requires reconciliation'),1)
        self.assertFalse(d.step(self.db,{},lambda *a:self.fail('must not replay')))
    def test_terminal_execution_and_prompt_freshness(self):
        self.admit()
        self.assertIn('fresh entities, revisions, cancellation',d.PROMPT)
        initial_alert = io.StringIO()
        with contextlib.redirect_stderr(initial_alert):
            d.step(self.db,{},lambda *a:{'ok':True,'runId':'run-1','completion':{'status':'ok'}})
        self.assertEqual(self.state(),'blocked_unverified')
        row = self.db.execute('SELECT * FROM events').fetchone()
        self.assertIn('run-1', tuple(row))
        self.db.close()
        self.db = d.connect(self.tmp.name)
        self.assertEqual(self.state(),'blocked_unverified')
        self.assertIn('run-1', tuple(self.db.execute('SELECT * FROM events').fetchone()))
        alerts = io.StringIO()
        with contextlib.redirect_stderr(alerts):
            self.assertFalse(d.step(self.db,{},lambda *a:self.fail('duplicate execution')))
            self.db.close()
            self.db = d.connect(self.tmp.name)
            self.assertFalse(d.step(self.db,{},lambda *a:self.fail('duplicate execution')))
        self.assertEqual((initial_alert.getvalue() + alerts.getvalue()).count('MeOS dispatch requires reconciliation: event:1'), 1)

    def test_ok_turn_reporting_blocked_does_not_retire_event(self):
        self.admit()
        # Arbitrary response prose is not a validated handling receipt.
        d.step(self.db,{},lambda *a:{'ok':True,'runId':'run-blocked',
                                   'completion':{'status':'ok','text':'blocked: missing capability'}})
        self.assertEqual(self.state(),'blocked_unverified')
        self.assertIn('run-blocked', tuple(self.db.execute('SELECT * FROM events').fetchone()))
        self.assertFalse(d.step(self.db,{},lambda *a:self.fail('duplicate execution')))
    def test_missing_terminal_blocks(self):
        self.admit()
        with contextlib.redirect_stderr(io.StringIO()): d.step(self.db,{},lambda *a:{'ok':True,'runId':'run-1'})
        self.assertEqual(self.state(),'blocked_unknown')
    def test_gateway_error_blocks(self):
        self.admit()
        with contextlib.redirect_stderr(io.StringIO()): d.step(self.db,{},lambda *a:{'ok':True,'runId':'run-1','completion':{'status':'error'}})
        self.assertEqual(self.state(),'blocked_terminal')

class BridgeTests(unittest.TestCase):
    def test_object_union_discovery_keeps_constraints_and_proposal_tool(self):
        variants = [{'type':'object','required':['task']}, {'type':'object','required':['occurrence']}]
        schemas = [{'anyOf':variants}, {'type':'object','required':['value']},
                   {'anyOf':[{'type':'object'}, {'type':'null'}]}]
        response = {'result':{'tools':[{'name':str(i),'outputSchema':s} for i,s in enumerate(schemas)]}}
        self.b.c['outbox'] = '/synthetic'
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(200,response)]):
            tools = self.b.call({'id':1,'method':'tools/list'})['result']['tools']
        self.assertEqual(tools[0]['outputSchema'], {'type':'object','anyOf':variants})
        self.assertEqual(tools[1]['outputSchema'], {'type':'object','required':['value']})
        self.assertNotIn('type', tools[2]['outputSchema'])
        self.assertEqual(tools[-1]['name'], 'propose_boundary')

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.p=pathlib.Path(self.tmp.name)/'credentials.json'
        m.save(self.p,{'authToken':'old','refreshToken':'refresh'})
        self.b=m.Bridge({'origin':'https://localhost:3192','socket':'/fake.sock','credentials':str(self.p),'instanceId':'fake','environment':'acceptance'})
        self.identity=(200,{'instanceId':'fake','environment':'acceptance'})
    def tearDown(self): self.tmp.cleanup()
    def test_identity_denies_before_credentials(self):
        with patch.object(self.b,'request',return_value=(200,{'instanceId':'other'})):
            with self.assertRaises(ValueError):self.b.call({'id':1})
    def test_refresh_then_restart_uses_saved_token(self):
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'new','csrf_token':'csrf'}),(200,{'id':1})]) as request:
            self.assertEqual(self.b.call({'id':1}),{'id':1})
            self.assertEqual(request.call_args.args[2],'new')
        self.assertEqual(json.loads(self.p.read_text())['authToken'],'new')
        self.assertFalse(self.p.with_name('credentials.json.refresh-intent').exists())
    def test_nonrotating_refresh_preserves_session_across_restart(self):
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'new','csrf_token':'csrf'}),(200,{'id':1})]):
            self.assertEqual(self.b.call({'id':1}),{'id':1})
        self.assertEqual(json.loads(self.p.read_text()),{'authToken':'new','refreshToken':'refresh'})
        self.assertFalse(self.p.with_name('credentials.json.refresh-intent').exists())
        restarted=m.Bridge(self.b.c)
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(restarted,'request',side_effect=[self.identity,(200,{'id':2})]) as request:
            self.assertEqual(restarted.call({'id':2}),{'id':2})
            self.assertEqual(request.call_args.args[2],'new')
    def test_invalid_refresh_response_preserves_credentials(self):
        for code,tokens in [(401,{}),(200,None),(200,{}),(200,{'auth_token':''})]:
            with self.subTest(code=code,tokens=tokens):
                intent=self.p.with_name('credentials.json.refresh-intent')
                with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(code,tokens)]):
                    with self.assertRaises(ValueError):self.b.call({'id':1})
                self.assertFalse(intent.exists())
                self.assertEqual(json.loads(self.p.read_text()),{'authToken':'old','refreshToken':'refresh'})
    def test_lost_nonrotating_refresh_response_can_retry(self):
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),TimeoutError()]):
            with self.assertRaises(TimeoutError):self.b.call({'id':1})
        self.assertEqual(json.loads(self.p.read_text()),{'authToken':'old','refreshToken':'refresh'})
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'new'}),(200,{'id':2})]) as request:
            self.assertEqual(self.b.call({'id':2}),{'id':2})
            self.assertEqual(request.call_args_list[2].args[1],{'refresh_token':'refresh'})
    def test_failed_persistence_can_retry_same_session(self):
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(m,'save',side_effect=OSError()),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'new'})]):
            with self.assertRaises(OSError):self.b.call({'id':1})
        with patch.object(m,'private',side_effect=pathlib.Path),patch.object(self.b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'newer'}),(200,{'id':2})]):
            self.assertEqual(self.b.call({'id':2}),{'id':2})
        self.assertEqual(json.loads(self.p.read_text()),{'authToken':'newer','refreshToken':'refresh'})
    def test_systemd_private_credential_mount_allows_lock_and_refresh_only(self):
        folder=os.environ.get('MEOS_SANDBOX_CREDENTIAL_DIR')
        if not folder:self.skipTest('requires trusted host sandbox launcher')
        path=pathlib.Path(folder)/'credentials.json';m.save(path,{'authToken':'old','refreshToken':'synthetic'})
        b=m.Bridge({**self.b.c,'credentials':str(path)})
        with patch.object(b,'request',side_effect=[self.identity,(401,None),(200,{'auth_token':'new','csrf_token':'csrf'}),(200,{'id':1})]):
            self.assertEqual(b.call({'id':1}),{'id':1})
        self.assertEqual(json.loads(path.read_text())['authToken'],'new')
        self.assertTrue(path.with_name('credentials.json.lock').exists())
        with self.assertRaises(OSError):pathlib.Path('/fixture/readonly').write_text('forbidden')

    def test_private_symlink_rejected(self):
        link=pathlib.Path(self.tmp.name)/'link';link.symlink_to(self.p)
        with self.assertRaises(ValueError):m.private(link)



class ProcessRecoveryTests(unittest.TestCase):
    def test_kill_after_hook_admission_no_second_dispatch(self):
        import http.server, subprocess, threading, time
        # Private fixture under the current user home, never a production endpoint/credential.
        with tempfile.TemporaryDirectory(prefix="meos-synthetic-", dir=pathlib.Path.home()) as temp:
            temp=pathlib.Path(temp).resolve();state=temp/'state';state.mkdir(mode=0o700)
            token=temp/'token';m.save(token,'synthetic-token')
            count=[];entered=threading.Event();release=threading.Event()
            class Handler(http.server.BaseHTTPRequestHandler):
                def do_POST(self):
                    self.rfile.read(int(self.headers['Content-Length']));count.append(1);entered.set();release.wait(10)
                    try:
                        self.send_response(200);self.end_headers();self.wfile.write(b'{"ok":true,"runId":"synthetic","completion":{"status":"ok"}}')
                    except BrokenPipeError:pass
                def log_message(self,*args):pass
            server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            config=temp/'config';m.save(config,{'hookHost':'127.0.0.1','hookPort':server.server_port,'hookTokenFile':str(token),'agentId':'synthetic','mode':'notifications'})
            db=d.connect(state);d.admit(db,{'id':'kill-proof','type':'boundary','at':0,'starts':[{'kind':'tasks','id':'synthetic','revision':1,'start':0,'end':60000}]},'kill-proof');db.close()
            cmd=[sys.executable,'-c',"import dispatcher,handling;handling.current_reader=lambda c:lambda i:{'display':{'timezone':'UTC','start':{'date':'1970-01-01','time':'12:00 am','offsetMinutes':0},'end':{'date':'1970-01-01','time':'12:01 am','offsetMinutes':0}},'scheduledAt':'1970-01-01T00:00:00Z','record':{'revision':1,'value':{'id':'synthetic','schedule':{'date':'1970-01-01','time':'00:00','timezone':'UTC'},'durationMinutes':1}}};dispatcher.main()",'worker','--state',str(state),'--config',str(config)]
            first=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=None)
            second=None
            try:
                self.assertTrue(entered.wait(5),'worker never reached synthetic endpoint')
                first.kill();first.wait();release.set()
                second=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=None)
                deadline=time.monotonic()+5
                while time.monotonic()<deadline:
                    db=__import__('sqlite3').connect(state/'queue.sqlite');row=db.execute('SELECT state FROM events').fetchone();db.close()
                    if row[0]=='blocked_unknown':break
                    time.sleep(.05)
                self.assertEqual(row[0],'blocked_unknown');self.assertEqual(len(count),1)
                db=d.connect(state);self.assertTrue(d.admit(db,{'id':'kill-proof','type':'boundary','at':0,'starts':[{'kind':'tasks','id':'synthetic','revision':1,'start':0,'end':60000}]},'kill-proof')['accepted']);db.close()
            finally:
                release.set()
                if first.poll() is None:first.kill();first.wait()
                if second is not None:second.terminate();second.wait()
                server.shutdown();server.server_close()
