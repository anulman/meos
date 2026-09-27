# SPDX-License-Identifier: Apache-2.0
"""Synthetic migration/vector proof in the exact admitted host; no network/data mounts."""
import pathlib,subprocess,tempfile,time,sqlite3,json,uuid
root=pathlib.Path(__file__).resolve().parent.parent
image='sha256:616de8c955d6f585be234bd990e2aeec879deb59b712c8fa3b2cf703f9d71c79'
depot=pathlib.Path(tempfile.mkdtemp(prefix='meos-search-native-'))
name='meos-search-native-'+uuid.uuid4().hex[:12]
migrations=depot/'migrations/main';migrations.mkdir(parents=True)
for filename in ['U1790380800__planner.sql','U1790380805__scheduling_contract.sql','U1790380807__search.sql']:
 (migrations/filename).write_text((root/'backend/migrations'/filename).read_text())
owner=uuid.UUID('01992ac0-0000-7000-8000-000000000001');entity=uuid.uuid4()
vector=json.dumps([1]+[0]*1535)
doc=json.dumps(dict(id=str(entity),title='Synthetic apples',notes={'type':'doc'},completed=False,priority='none'))
(migrations/'U1790380900__proof.sql').write_text(f"""
INSERT INTO _user(id,email,admin) VALUES(x'{owner.hex}','search-proof@example.invalid',0);
INSERT INTO tasks(id,owner_id,doc,revision,created_at,updated_at) VALUES(x'{entity.hex}',x'{owner.hex}','{doc}',1,1,1);
DELETE FROM search_fts;
INSERT INTO search_fts(rowid,title,body) SELECT rowid,title,body FROM search_documents;
DELETE FROM search_dirty;
INSERT INTO search_vectors(rowid,embedding) SELECT rowid,'{vector}' FROM search_documents;
CREATE TABLE proof_vector AS SELECT d.entity_id,vec_distance_cosine(v.embedding,'{vector}') AS distance FROM search_documents d JOIN search_vectors v ON v.rowid=d.rowid WHERE d.owner_id=x'{owner.hex}' ORDER BY distance,d.rowid;
CREATE TABLE proof_fts AS SELECT d.entity_id,bm25(search_fts,5.0,1.0) AS rank FROM search_fts JOIN search_documents d ON d.rowid=search_fts.rowid WHERE search_fts MATCH 'apples' AND d.owner_id=x'{owner.hex}' ORDER BY rank;
UPDATE tasks SET doc=json_set(doc,'$.completed',json('true')),revision=revision+1 WHERE id=x'{entity.hex}';
CREATE TABLE proof_metadata AS SELECT (SELECT count(*) FROM search_vectors) AS vectors,(SELECT count(*) FROM search_dirty) AS dirty,(SELECT revision FROM search_documents LIMIT 1) AS revision;
UPDATE tasks SET doc=json_set(doc,'$.title','Synthetic pears'),revision=revision+1 WHERE id=x'{entity.hex}';
DELETE FROM search_vectors WHERE rowid IN (SELECT rowid FROM search_dirty);
DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_dirty);
INSERT INTO search_fts(rowid,title,body) SELECT rowid,title,body FROM search_documents WHERE rowid IN (SELECT rowid FROM search_dirty);
DELETE FROM search_dirty;
CREATE TABLE proof_updated AS SELECT (SELECT count(*) FROM search_vectors) AS vectors,(SELECT revision FROM search_jobs LIMIT 1) AS revision;
DELETE FROM tasks WHERE id=x'{entity.hex}';
CREATE TABLE proof_deleted AS SELECT (SELECT count(*) FROM search_documents) AS documents,(SELECT count(*) FROM search_jobs) AS jobs;
CREATE TABLE proof_versions AS SELECT sqlite_version(),vec_version();
""")
started=False
try:
 subprocess.run(['sudo','docker','run','-d','--name',name,'--network','none','--user','0:0','--mount',f'type=bind,src={depot},dst=/data','--entrypoint','/bin/trail',image,'--depot','/data','run','--address','127.0.0.1:4000'],check=True,capture_output=True);started=True
 time.sleep(3)
 logs=subprocess.check_output(['sudo','docker','logs',name],stderr=subprocess.STDOUT).decode()
 subprocess.run(['sudo','docker','stop','-t','1',name],check=True,capture_output=True)
 subprocess.run(['sudo','chown','-R',str(pathlib.Path.home().owner())+':'+str(pathlib.Path.home().owner()),str(depot)],check=True)
 db=sqlite3.connect('file:'+str(depot/'data/main.db')+'?mode=ro',uri=True)
 result={table:db.execute('SELECT * FROM '+table).fetchall() for table in ['proof_vector','proof_fts','proof_updated','proof_deleted','proof_versions','proof_metadata']}
 assert result['proof_vector']==[(str(entity),0.0)],result
 assert len(result['proof_fts'])==1,result
 assert result['proof_updated']==[(0,3)],result
 assert result['proof_metadata']==[(1,0,2)],result
 assert result['proof_deleted']==[(0,0)],result
 print(json.dumps({'image':image,'passed':True,'results':result,'depot':str(depot)}))
except Exception:
 if 'logs' in locals(): print(logs[:4500])
 raise
finally:
 if started: subprocess.run(['sudo','docker','rm','-f',name],capture_output=True)
