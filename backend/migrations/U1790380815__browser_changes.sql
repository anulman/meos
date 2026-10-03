-- SPDX-License-Identifier: Apache-2.0
-- Bounded metadata only. Native SSE is an invalidation hint, never a commit receipt.
CREATE TABLE browser_changes (
 id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid(id)) REFERENCES _user(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence>0)
) STRICT;
CREATE TRIGGER browser_changes_outbox AFTER INSERT ON sync_outbox
BEGIN
 INSERT INTO browser_changes(id,kind,sequence) VALUES(NEW.owner_id,NEW.kind,1)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,sequence=sequence+1;
END;
CREATE TRIGGER browser_changes_preferences_insert AFTER INSERT ON preferences
BEGIN
 INSERT INTO browser_changes(id,kind,sequence) VALUES(NEW.owner_id,'preferences',1)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,sequence=sequence+1;
END;
CREATE TRIGGER browser_changes_preferences_update AFTER UPDATE ON preferences
BEGIN
 INSERT INTO browser_changes(id,kind,sequence) VALUES(NEW.owner_id,'preferences',1)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,sequence=sequence+1;
END;
CREATE TRIGGER browser_changes_preferences_delete AFTER DELETE ON preferences
BEGIN
 INSERT INTO browser_changes(id,kind,sequence) VALUES(OLD.owner_id,'preferences',1)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,sequence=sequence+1;
END;
CREATE TRIGGER browser_changes_calendar AFTER UPDATE OF sequence ON calendar_cache_state
WHEN NEW.sequence != OLD.sequence
BEGIN
 INSERT INTO browser_changes(id,kind,sequence) VALUES(NEW.owner_id,'calendar-window',1)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,sequence=sequence+1;
END;
