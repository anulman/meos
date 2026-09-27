-- SPDX-License-Identifier: Apache-2.0
-- Canonical documents and jobs are updated in the source transaction.
CREATE TABLE search_documents (
 rowid INTEGER PRIMARY KEY, owner_id BLOB NOT NULL REFERENCES _user(id),
 kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, archived INTEGER NOT NULL,
 UNIQUE(owner_id,kind,entity_id)
) STRICT;
CREATE VIRTUAL TABLE search_fts USING fts5(title,body,tokenize='unicode61');
CREATE VIRTUAL TABLE search_vectors USING vec0(embedding float[1536] distance_metric=cosine);
CREATE TABLE search_config (owner_id BLOB PRIMARY KEY REFERENCES _user(id), enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), model TEXT NOT NULL CHECK(model='text-embedding-3-small'), dimensions INTEGER NOT NULL CHECK(dimensions=1536)) STRICT;
CREATE TABLE search_jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id BLOB NOT NULL REFERENCES _user(id),
 document_id INTEGER REFERENCES search_documents(rowid) ON DELETE CASCADE,
 revision INTEGER NOT NULL, text TEXT NOT NULL, query TEXT,
 embedding TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, UNIQUE(document_id), UNIQUE(owner_id,query)
) STRICT;
CREATE INDEX search_jobs_due ON search_jobs(owner_id,retry_at,id);
CREATE TABLE search_dirty (rowid INTEGER PRIMARY KEY) STRICT;
CREATE TRIGGER search_document_insert AFTER INSERT ON search_documents BEGIN
 INSERT INTO search_dirty SELECT new.rowid WHERE NOT EXISTS(SELECT 1 FROM search_dirty WHERE rowid=new.rowid);
 INSERT INTO search_jobs(owner_id,document_id,revision,text,created_at) VALUES(new.owner_id,new.rowid,new.revision,new.title||char(10)||new.body,0);
END;
CREATE TRIGGER search_document_update AFTER UPDATE ON search_documents BEGIN
 INSERT INTO search_dirty SELECT old.rowid WHERE NOT EXISTS(SELECT 1 FROM search_dirty WHERE rowid=old.rowid);
 INSERT INTO search_dirty SELECT new.rowid WHERE NOT EXISTS(SELECT 1 FROM search_dirty WHERE rowid=new.rowid);
 DELETE FROM search_jobs WHERE document_id=old.rowid;
 INSERT INTO search_jobs(owner_id,document_id,revision,text,created_at) VALUES(new.owner_id,new.rowid,new.revision,new.title||char(10)||new.body,0);
END;
CREATE TRIGGER search_document_delete AFTER DELETE ON search_documents BEGIN
 INSERT INTO search_dirty SELECT old.rowid WHERE NOT EXISTS(SELECT 1 FROM search_dirty WHERE rowid=old.rowid);
 DELETE FROM search_jobs WHERE document_id=old.rowid;
END;
CREATE TRIGGER search_tasks_insert AFTER INSERT ON tasks BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'tasks',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_tasks_update AFTER UPDATE ON tasks BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'tasks',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_tasks_delete AFTER DELETE ON tasks BEGIN DELETE FROM search_documents WHERE owner_id=old.owner_id AND kind='tasks' AND entity_id=old.uuid; END;
INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) SELECT owner_id,'tasks',uuid,revision,COALESCE(json_extract(doc,'$.title'),json_extract(doc,'$.kind')||' '||json_extract(doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(doc,'$.archived'),0) FROM tasks;
CREATE TRIGGER search_projects_insert AFTER INSERT ON projects BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'projects',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_projects_update AFTER UPDATE ON projects BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'projects',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_projects_delete AFTER DELETE ON projects BEGIN DELETE FROM search_documents WHERE owner_id=old.owner_id AND kind='projects' AND entity_id=old.uuid; END;
INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) SELECT owner_id,'projects',uuid,revision,COALESCE(json_extract(doc,'$.title'),json_extract(doc,'$.kind')||' '||json_extract(doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(doc,'$.archived'),0) FROM projects;
CREATE TRIGGER search_routines_insert AFTER INSERT ON routines BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'routines',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_routines_update AFTER UPDATE ON routines BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'routines',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_routines_delete AFTER DELETE ON routines BEGIN DELETE FROM search_documents WHERE owner_id=old.owner_id AND kind='routines' AND entity_id=old.uuid; END;
INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) SELECT owner_id,'routines',uuid,revision,COALESCE(json_extract(doc,'$.title'),json_extract(doc,'$.kind')||' '||json_extract(doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(doc,'$.archived'),0) FROM routines;
CREATE TRIGGER search_occurrences_insert AFTER INSERT ON occurrences BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'occurrences',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_occurrences_update AFTER UPDATE ON occurrences BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'occurrences',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_occurrences_delete AFTER DELETE ON occurrences BEGIN DELETE FROM search_documents WHERE owner_id=old.owner_id AND kind='occurrences' AND entity_id=old.uuid; END;
INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) SELECT owner_id,'occurrences',uuid,revision,COALESCE(json_extract(doc,'$.title'),json_extract(doc,'$.kind')||' '||json_extract(doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(doc,'$.archived'),0) FROM occurrences;
CREATE TRIGGER search_period_notes_insert AFTER INSERT ON period_notes BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'periodNotes',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_period_notes_update AFTER UPDATE ON period_notes BEGIN
 INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) VALUES(new.owner_id,'periodNotes',new.uuid,new.revision,COALESCE(json_extract(new.doc,'$.title'),json_extract(new.doc,'$.kind')||' '||json_extract(new.doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(new.doc,'$.archived'),0)) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,archived=excluded.archived;
END;
CREATE TRIGGER search_period_notes_delete AFTER DELETE ON period_notes BEGIN DELETE FROM search_documents WHERE owner_id=old.owner_id AND kind='periodNotes' AND entity_id=old.uuid; END;
INSERT INTO search_documents(owner_id,kind,entity_id,revision,title,body,archived) SELECT owner_id,'periodNotes',uuid,revision,COALESCE(json_extract(doc,'$.title'),json_extract(doc,'$.kind')||' '||json_extract(doc,'$.period.start'),''),substr(COALESCE((SELECT group_concat(value,' ') FROM json_tree(doc,'$.notes') WHERE key='text' AND type='text'),''),1,16000),COALESCE(json_extract(doc,'$.archived'),0) FROM period_notes;

INSERT INTO search_fts(rowid,title,body) SELECT rowid,title,body FROM search_documents;
DELETE FROM search_dirty;
