# SPDX-License-Identifier: Apache-2.0
"""Synthetic disposable fixtures only. No runtime commands or remote credentials."""
import contextlib, importlib.util, io, json, os
from pathlib import Path
import shutil, sqlite3, subprocess, tempfile, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('meos-backup.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
AGE=os.environ.get('MEOS_TEST_AGE','/tmp/meos-age-qualify/age/age')

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.space=patch.object(b.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(100 * 1024**3, 0, 100 * 1024**3))
        self.space.start(); self.addCleanup(self.space.stop)
        self.temp=tempfile.TemporaryDirectory(prefix='meos-backup-test-')
        self.root=Path(self.temp.name);self.addCleanup(self.temp.cleanup)
        self.c={'schema':1,'bucket':'synthetic-bucket','enabled':True,'endpoint':'https://invalid.example','prefix':'tests/meos','region':'us-east-1',
                'instanceId':'a'*32,'sources':{},'workDirectory':str(self.root/'work'),'age':AGE,
                'credentialsFile':str(self.root/'credentials'),'identityFile':str(self.root/'identity'),'recipient':'age1placeholder'}
        for label in b.REQUIRED:
            p=self.root/label;p.mkdir();self.c['sources'][label]=str(p)
        self.c['runtimeStateFile']=str(self.root/'configuration/runtime-state.json')
        Path(self.c['runtimeStateFile']).write_text(json.dumps({'instanceId':'a'*32,'volume':'synthetic'}))
        Path(self.c['runtimeStateFile']).chmod(0o600)
        (self.root/'native/data').mkdir();(self.root/'calendar/private').mkdir()
        self.live=sqlite3.connect(self.root/'native/data/main.db');self.addCleanup(self.live.close)
        self.live.executescript("PRAGMA journal_mode=WAL; CREATE TABLE _meos_instance(instance_id TEXT); INSERT INTO _meos_instance VALUES('"+'a'*32+"'); CREATE TABLE notes(id TEXT,body TEXT); INSERT INTO notes VALUES('note-1','synthetic note'); CREATE TABLE routines(id TEXT); INSERT INTO routines VALUES('routine-1');")
        self.live.commit()
        with sqlite3.connect(self.root/'calendar/private/calendar.sqlite') as db:
            db.executescript("CREATE TABLE entries(key TEXT,value TEXT); INSERT INTO entries VALUES('synthetic','no real token');")
        (self.root/'configuration/oauth.json').write_text('{"synthetic":true}')
        (self.root/'release/manifest.json').write_text('{"status":"synthetic"}')
        for unit in b.UNITS:(self.root/'units'/unit).write_text('# synthetic only\n')
        (self.root/'credentials').write_text('{"accessKeyId":"synthetic","secretAccessKey":"not-real"}');(self.root/'credentials').chmod(0o600)
        self.c['requiredConfiguration']={role:'oauth.json' for role in ['webIdentity','owner','accessKeys','calendarConfig','calendarOAuth','calendarPlanner']}
        self.config=self.root/'config.json';self.write_config()
    def write_config(self):self.config.write_text(json.dumps(self.c));self.config.chmod(0o600)
    def key(self):
        require=Path(AGE).is_file();self.assertTrue(require,'MEOS_TEST_AGE must point to admitted binary')
        subprocess.run([str(Path(AGE).with_name('age-keygen')),'-o',str(self.root/'identity')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.c['recipient']=subprocess.check_output([str(Path(AGE).with_name('age-keygen')),'-y',str(self.root/'identity')],text=True).strip()
    def test_capacity_denial_before_quiesce_or_copy(self):
        self.space.stop()
        with patch.object(b.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(1024,0,1024)), patch.object(b,'ancestors'), patch.object(b,'quiesce') as stop, patch.object(b,'stage') as copy:
            with self.assertRaisesRegex(RuntimeError,'reserve'): b.backup(self.c,self.root,'test')
            stop.assert_not_called(); copy.assert_not_called()
    def test_oversize_denial_before_quiesce_or_copy(self):
        self.c['maxArchiveBytes']=1
        with patch.object(b,'ancestors'), patch.object(b,'quiesce') as stop, patch.object(b,'stage') as copy:
            with self.assertRaisesRegex(RuntimeError,'configured limit'): b.backup(self.c,self.root,'test')
            stop.assert_not_called(); copy.assert_not_called()
    def test_growth_copy_is_bounded(self):
        self.c['maxArchiveBytes']=65536
        source=self.root/'growing';source.write_bytes(b'x'*65537)
        budget=b.Budget(self.c)
        with self.assertRaisesRegex(RuntimeError,'configured limit'):budget.copy(source,self.root/'bounded')
        self.assertEqual((self.root/'bounded').stat().st_size,65536)
    def test_native_file_ceiling_restored_after_failure(self):
        old=b.resource.getrlimit(b.resource.RLIMIT_FSIZE)
        with self.assertRaises(OSError):
            with b.file_ceiling(16): (self.root/'bounded-native').write_bytes(b'x'*100)
        self.assertLessEqual((self.root/'bounded-native').stat().st_size,16)
        self.assertEqual(b.resource.getrlimit(b.resource.RLIMIT_FSIZE),old)
    def test_capacity_aggregates_same_filesystem(self):
        reserve=5*1024**3
        with patch.object(b.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(reserve+100,0,reserve+100)):
            b.capacity(self.c,[(self.root,50),(self.root/'new',50)])
            with self.assertRaisesRegex(RuntimeError,'reserve'):b.capacity(self.c,[(self.root,51),(self.root/'new',50)])
    def test_restore_capacity_denied_before_network_or_target(self):
        with patch.object(b,'ancestors'), patch.object(b.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(1,0,1)),patch.object(b,'S3') as remote:
            with self.assertRaisesRegex(RuntimeError,'reserve'):b.restore(self.c,'tests/meos/no',self.root/'restore-denied')
            remote.assert_not_called();self.assertFalse((self.root/'restore-denied').exists())
    def test_restore_accounts_for_implicit_directories(self):
        self.c['maxArchiveBytes']=65536
        archive=self.root/'malicious.tar'
        with b.tarfile.open(archive,'w') as tar:
            member=b.tarfile.TarInfo('/'.join(['nested']*40)+'/empty');member.size=0;tar.addfile(member,io.BytesIO())
        def decrypt(c,source,target,decrypt=False):shutil.copyfile(source,target)
        with patch.object(b,'age',side_effect=decrypt):
            with self.assertRaisesRegex(RuntimeError,'restore allocation'):b.unpack(self.c,archive,self.root/'nested-target',self.root)
        self.assertEqual(list((self.root/'nested-target').iterdir()),[])
    def test_restore_rejects_compressed_tar_expansion(self):
        archive=self.root/'compressed.tar'
        with b.tarfile.open(archive,'w:gz') as tar:
            member=b.tarfile.TarInfo('large');member.size=100000;tar.addfile(member,io.BytesIO(b'x'*100000))
        def decrypt(c,source,target,decrypt=False):shutil.copyfile(source,target)
        with patch.object(b,'age',side_effect=decrypt):
            with self.assertRaises(b.tarfile.ReadError):b.unpack(self.c,archive,self.root/'compressed-target',self.root)
    def test_reserve_cannot_be_lowered(self):
        self.c['reserveBytes']=5*1024**3-1;self.write_config()
        with self.assertRaisesRegex(RuntimeError,'at least 5 GiB'):b.config(self.config)
    def test_absent_bucket_no_side_effects(self):
        for value in [{},{'credentialsFile':'/never/read','bucket':''},{'bucket':'yes','enabled':False}]:
            self.config.write_text(json.dumps(value))
            with patch.object(b,'private',side_effect=AssertionError),patch.object(b,'locked',side_effect=AssertionError),patch.object(b,'S3',side_effect=AssertionError):
                out=io.StringIO()
                with contextlib.redirect_stdout(out):self.assertEqual(b.main(['--config',str(self.config),'backup']),0)
                self.assertEqual(out.getvalue(),'')
        self.assertFalse((self.root/'work').exists())
    def test_malformed_is_not_disabled(self):
        self.config.write_text('{')
        with self.assertRaises(json.JSONDecodeError):b.config(self.config)
        self.config.write_text('{"bucket":false}')
        with self.assertRaises(RuntimeError):b.config(self.config)
        self.c['endpoint']='http://insecure';self.write_config()
        with self.assertRaises(RuntimeError):b.config(self.config)
    def test_wal_snapshot_and_complete_inventory(self):
        target=self.root/'snapshot';target.mkdir()
        with patch.object(b,'ancestors'):m=b.stage(self.c,target)
        self.assertTrue((self.root/'native/data/main.db-wal').exists())
        self.assertNotIn('native/data/main.db-wal',m['files'])
        with sqlite3.connect(target/'native/data/main.db') as db:self.assertEqual(db.execute('SELECT body FROM notes').fetchone(),('synthetic note',))
        self.assertEqual(b.verify_tree(target),m)
        (target/'configuration/oauth.json').write_text('tampered')
        with self.assertRaises(RuntimeError):b.verify_tree(target)
    def test_resume_on_failure_and_interruption_journal(self):
        root=self.root/'work';root.mkdir();calls=[]
        def service(action,unit):
            calls.append((action,unit));return action=='is-active' and len(calls)<=len(b.UNITS)
        with patch.object(b,'systemctl',side_effect=service):
            with self.assertRaisesRegex(RuntimeError,'synthetic failure'):
                with b.quiesce(root):raise RuntimeError('synthetic failure')
        self.assertEqual([u for a,u in calls if a=='start'],list(reversed(b.UNITS)))
        self.assertFalse((root/'writers.json').exists())
        b.atomic(root/'writers.json',{'active':b.UNITS[:2]})
        with patch.object(b,'systemctl') as mock:b.resume(root)
        self.assertEqual(mock.call_count,2)
    def test_lock_contention(self):
        with patch.object(b,'ancestors'):
            with b.locked(self.c):
                with self.assertRaises(BlockingIOError):
                    with b.locked(self.c):pass
    def test_preupgrade_failure_blocks_next_action(self):
        touched=[]
        with patch.object(b,'config',return_value=(self.c,None)),patch.object(b,'ancestors'),patch.object(b,'backup',side_effect=RuntimeError('failed')):
            with self.assertRaises(RuntimeError):
                b.preupgrade(str(self.config));touched.append('mutate')
        self.assertEqual(touched,[])
    def test_release_gate_precedes_transition_mutation(self):
        # Inspect the real executable boundary without importing its root-only code.
        # The source is optionally included by the isolation launcher.
        path=Path('/upgrade.py')
        if not path.exists():self.skipTest('launcher supplies release gate source')
        import ast
        tree=ast.parse(path.read_text());calls=[]
        for node in tree.body:
            if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call):
                calls.append(ast.unparse(node.value.func))
        self.assertIn('backup_guard.__enter__',calls)
        self.assertLess(calls.index('backup_guard.__enter__'),calls.index('out.mkdir'))
    def test_encrypted_roundtrip_restore_and_tamper(self):
        self.key();remote={}
        class Remote:
            def __init__(self,c):pass
            def request(self,method,key,data=b''):
                if method=='PUT':remote[key]=data;return b''
                if method=='DELETE':remote.pop(key,None);return b''
                return remote[key]
        @contextlib.contextmanager
        def stopped(*args):yield
        with patch.object(b,'S3',Remote),patch.object(b,'quiesce',stopped),patch.object(b,'ancestors'):
            with b.locked(self.c) as root:receipt=b.backup(self.c,root,'test')
            self.assertTrue(receipt['dataRestoreSucceededAt']);self.assertFalse(receipt['applicationRecoveryVerified'])
            self.assertNotIn(b'synthetic note',remote[receipt['snapshot']])
            result=b.restore(self.c,receipt['snapshot'],self.root/'restored')
            self.assertEqual(result['status'],'isolated-data-restore-verified')
            with sqlite3.connect(self.root/'restored/native/data/main.db') as db:self.assertEqual(db.execute('SELECT count(*) FROM routines').fetchone(),(1,))
            data=remote[receipt['snapshot']];remote[receipt['snapshot']]=data[:-1]+bytes([data[-1]^1])
            with self.assertRaises(RuntimeError):b.restore(self.c,receipt['snapshot'],self.root/'tampered')
            self.assertFalse((self.root/'tampered').exists())
    def test_auth_and_upload_failure_remain_failures(self):
        self.key()
        @contextlib.contextmanager
        def stopped(*args):yield
        with patch.object(b,'S3') as remote,patch.object(b,'quiesce',stopped),patch.object(b,'ancestors'):
            remote.return_value.request.side_effect=RuntimeError('synthetic auth failure')
            with b.locked(self.c) as root:
                with self.assertRaises(RuntimeError):b.backup(self.c,root,'test')
            self.assertFalse((self.root/'work/last-backup.json').exists())
            self.assertFalse((self.root/'work/last-restore.json').exists())
    def test_real_age_rejects_changed_ciphertext(self):
        self.key();source=self.root/'clear';source.write_text('synthetic')
        encrypted=self.root/'encrypted';b.age(self.c,source,encrypted)
        data=encrypted.read_bytes();encrypted.write_bytes(data[:-1]+bytes([data[-1]^1]))
        with self.assertRaises(RuntimeError):b.age(self.c,encrypted,self.root/'decrypted',decrypt=True)
    def test_retention_only_explicit_and_policy_limited(self):
        root=self.root/'work';(root/'receipts').mkdir(parents=True)
        for i in range(3):b.atomic(root/'receipts'/f'{i}.json',{'snapshot':f'tests/meos/{i}.tar.age'})
        with patch.object(b,'S3') as remote:
            self.assertEqual(b.retention(self.c,root,False)['objects'],[]);remote.assert_not_called()
            self.c['keepLast']=2;self.assertEqual(b.retention(self.c,root,False)['objects'],['tests/meos/0.tar.age']);remote.assert_not_called()
            b.retention(self.c,root,True);self.assertEqual(remote.return_value.request.call_count,2)
        self.assertEqual(len(list((root/'receipts').iterdir())),2)
    def test_network_and_host_data_isolation(self):
        if os.environ.get('MEOS_TEST_AGE') != '/age/age': self.skipTest('run test-isolated.sh for sandbox proof')
        import socket
        self.assertFalse(Path('/home/clawy').exists())
        self.assertFalse(Path('/var/run/docker.sock').exists())
        self.assertFalse(Path('/etc/meos').exists())
        self.assertEqual(os.listdir('/sys/class/net') if Path('/sys/class/net').exists() else [], [])
        sock=socket.socket();sock.settimeout(.2)
        try:
            with self.assertRaises(OSError):sock.connect(('1.1.1.1',443))
        finally:sock.close()
    def test_missing_role_and_archived_key_denied(self):
        target=self.root/'snapshot';target.mkdir()
        self.c['requiredConfiguration']['owner']='missing.json'
        with patch.object(b,'ancestors'):
            with self.assertRaises(RuntimeError):b.stage(self.c,target)
        self.c['identityFile']=str(self.root/'configuration/private-key')
        with self.assertRaises(RuntimeError):b.stage(self.c,target)
    def test_s3_signature_and_redirect_denial(self):
        s3=b.S3(self.c)
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return b'fixture'
        with patch.object(s3.opener,'open',return_value=Response()) as op:
            self.assertEqual(s3.request('PUT','tests/meos/object',b'payload'),b'fixture')
            request=op.call_args.args[0]
            self.assertTrue(request.headers['Authorization'].startswith('AWS4-HMAC-SHA256 Credential=synthetic/'))
            self.assertEqual(request.headers['X-amz-content-sha256'],b.hashlib.sha256(b'payload').hexdigest())
        with self.assertRaises(RuntimeError):b.NoRedirect().redirect_request(None)

if __name__=='__main__':unittest.main()
