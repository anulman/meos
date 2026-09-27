# Synthetic SQLite only; no production paths, credentials, subprocesses or network.
import importlib.util,pathlib,sqlite3,unittest
p=pathlib.Path(__file__).with_name('calendar-session-lifetime.py');spec=importlib.util.spec_from_file_location('policy',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Lifetime(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('CREATE TABLE _session(id INTEGER PRIMARY KEY,user BLOB,refresh_token TEXT,expires INTEGER)');self.db.executemany('INSERT INTO _session VALUES(?,?,?,?)',[(1,b'agent','synthetic',43200),(2,b'other','unrelated',50000)]);self.db.commit()
 def tearDown(self):self.db.close()
 def test_cli_twelve_hour_deadline_is_replaced_by_grant_bound(self):
  self.assertEqual(self.db.execute('SELECT count(*) FROM _session WHERE refresh_token=? AND expires>?',('synthetic',43201)).fetchone()[0],0)
  m.bind_session(self.db,b'agent','synthetic',86400,100)
  self.assertEqual(self.db.execute('SELECT expires FROM _session WHERE id=1').fetchone()[0],86400)
  # Native refresh's actual predicate remains true after the original12h expiry.
  self.assertEqual(self.db.execute('SELECT count(*) FROM _session WHERE refresh_token=? AND expires>?',('synthetic',43201)).fetchone()[0],1)
  self.assertEqual(self.db.execute('SELECT expires FROM _session WHERE id=2').fetchone()[0],50000)
 def test_missing_expired_or_wrong_identity_is_not_recreated(self):
  for agent,token,now in [(b'wrong','synthetic',100),(b'agent','missing',100),(b'agent','synthetic',43200)]:
   with self.assertRaises(ValueError):m.bind_session(self.db,agent,token,86400,now)
  self.assertEqual(self.db.execute('SELECT expires FROM _session WHERE id=1').fetchone()[0],43200)
 def test_no_session_can_exceed_verified_grant_deadline(self):
  m.bind_session(self.db,b'agent','synthetic',1000,100);self.assertEqual(self.db.execute('SELECT expires FROM _session WHERE id=1').fetchone()[0],1000)
  with self.assertRaises(ValueError):m.bind_session(self.db,b'agent','synthetic',100,100)
if __name__=='__main__':unittest.main()
