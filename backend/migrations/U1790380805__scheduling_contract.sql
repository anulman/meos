-- SPDX-License-Identifier: Apache-2.0
-- Preserve original natural slot/date and IDs. Snapshot existing templates once;
-- legacy rows with no template time remain unscheduled, never assigned a default.
UPDATE occurrences SET doc=json_set(doc,
 '$.title',(SELECT json_extract(r.doc,'$.title') FROM routines r WHERE r.owner_id=occurrences.owner_id AND r.uuid=occurrences.routine_id),
 '$.notes',json((SELECT json_extract(r.doc,'$.notes') FROM routines r WHERE r.owner_id=occurrences.owner_id AND r.uuid=occurrences.routine_id)),
 '$.templateRevision',(SELECT r.revision FROM routines r WHERE r.owner_id=occurrences.owner_id AND r.uuid=occurrences.routine_id),
 '$.edited',json('false'),'$.skipped',json('false')),
 revision=revision+1;
UPDATE occurrences SET doc=json_set(doc,'$.durationMinutes',
 (SELECT json_extract(r.doc,'$.durationMinutes') FROM routines r WHERE r.owner_id=occurrences.owner_id AND r.uuid=occurrences.routine_id)),revision=revision+1
 WHERE EXISTS (SELECT 1 FROM routines r WHERE r.owner_id=occurrences.owner_id AND r.uuid=occurrences.routine_id AND json_type(r.doc,'$.durationMinutes')='integer');
-- Do not infer valid instants in SQL: legacy dates may fall in a DST gap/fold.
-- Existing completion/history is retained; scheduler assigns explicit valid time.
CREATE TABLE command_receipts (
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 command_key TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL,
 result TEXT NOT NULL CHECK(json_valid(result)), created_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,command_key)
) STRICT;
CREATE TABLE sync_outbox (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
 doc TEXT NOT NULL CHECK(json_valid(doc)), created_at INTEGER NOT NULL,
 UNIQUE(owner_id,kind,entity_id,revision)
) STRICT;
CREATE TABLE external_events (
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 provider TEXT NOT NULL, calendar_id TEXT NOT NULL, event_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('tasks','occurrences')),
 entity_id TEXT NOT NULL, remote_revision TEXT NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
 PRIMARY KEY(owner_id,provider,calendar_id,event_id),
 UNIQUE(owner_id,provider,calendar_id,kind,entity_id)
) STRICT;
CREATE TABLE deletion_tombstones (
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL, deleted_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,kind,entity_id)
) STRICT;
-- A separately provisioned native auth identity, never browser session credentials.
CREATE TABLE _meos_agent_grants (
 agent_id BLOB PRIMARY KEY NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 scopes TEXT NOT NULL CHECK(json_valid(scopes) AND json_type(scopes)='array'),
 expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
 CHECK(agent_id != owner_id)
) STRICT;
CREATE TRIGGER agent_owner_immutable BEFORE UPDATE ON _meos_agent_grants
WHEN NEW.agent_id IS NOT OLD.agent_id OR NEW.owner_id IS NOT OLD.owner_id
BEGIN SELECT RAISE(ABORT,'immutable agent owner'); END;
CREATE TRIGGER agent_no_delete BEFORE DELETE ON _meos_agent_grants
BEGIN SELECT RAISE(ABORT,'revoke agent; identity binding is permanent'); END;
CREATE TRIGGER agent_no_replace BEFORE INSERT ON _meos_agent_grants
WHEN EXISTS(SELECT 1 FROM _meos_agent_grants WHERE agent_id=NEW.agent_id)
BEGIN SELECT RAISE(ABORT,'agent already bound'); END;

CREATE TRIGGER projects_outbox_insert AFTER INSERT ON projects
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'projects',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER projects_outbox_update AFTER UPDATE ON projects
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'projects',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER projects_tombstone BEFORE INSERT ON projects
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='projects' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER projects_outbox_delete AFTER DELETE ON projects
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'projects',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'projects',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='projects' AND entity_id=OLD.uuid;
END;

CREATE TRIGGER tasks_outbox_insert AFTER INSERT ON tasks
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'tasks',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER tasks_outbox_update AFTER UPDATE ON tasks
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'tasks',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER tasks_tombstone BEFORE INSERT ON tasks
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='tasks' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER tasks_outbox_delete AFTER DELETE ON tasks
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'tasks',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'tasks',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='tasks' AND entity_id=OLD.uuid;
END;

CREATE TRIGGER routines_outbox_insert AFTER INSERT ON routines
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'routines',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER routines_outbox_update AFTER UPDATE ON routines
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'routines',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER routines_tombstone BEFORE INSERT ON routines
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='routines' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER routines_outbox_delete AFTER DELETE ON routines
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'routines',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'routines',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='routines' AND entity_id=OLD.uuid;
END;

CREATE TRIGGER occurrences_outbox_insert AFTER INSERT ON occurrences
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'occurrences',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER occurrences_outbox_update AFTER UPDATE ON occurrences
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'occurrences',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER occurrences_tombstone BEFORE INSERT ON occurrences
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='occurrences' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER occurrences_outbox_delete AFTER DELETE ON occurrences
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'occurrences',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'occurrences',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='occurrences' AND entity_id=OLD.uuid;
END;

CREATE TRIGGER outcomes_outbox_insert AFTER INSERT ON outcomes
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'outcomes',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER outcomes_outbox_update AFTER UPDATE ON outcomes
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'outcomes',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER outcomes_tombstone BEFORE INSERT ON outcomes
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='outcomes' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER outcomes_outbox_delete AFTER DELETE ON outcomes
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'outcomes',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'outcomes',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='outcomes' AND entity_id=OLD.uuid;
END;

CREATE TRIGGER period_notes_outbox_insert AFTER INSERT ON period_notes
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'periodNotes',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;

CREATE TRIGGER period_notes_outbox_update AFTER UPDATE ON period_notes
BEGIN
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(NEW.owner_id,'periodNotes',NEW.uuid,NEW.revision,'upsert',NEW.doc,NEW.updated_at);
END;
CREATE TRIGGER period_notes_tombstone BEFORE INSERT ON period_notes
WHEN EXISTS(SELECT 1 FROM deletion_tombstones WHERE owner_id=NEW.owner_id AND kind='periodNotes' AND entity_id=NEW.uuid)
BEGIN SELECT RAISE(ABORT,'deleted identity cannot be resurrected'); END;
CREATE TRIGGER period_notes_outbox_delete AFTER DELETE ON period_notes
BEGIN
 INSERT INTO deletion_tombstones VALUES(OLD.owner_id,'periodNotes',OLD.uuid,OLD.revision+1,unixepoch()*1000);
 INSERT INTO sync_outbox(owner_id,kind,entity_id,revision,operation,doc,created_at)
 VALUES(OLD.owner_id,'periodNotes',OLD.uuid,OLD.revision+1,'delete',OLD.doc,unixepoch()*1000);
 UPDATE external_events SET deleted=1 WHERE owner_id=OLD.owner_id AND kind='periodNotes' AND entity_id=OLD.uuid;
END;
