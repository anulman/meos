-- SPDX-License-Identifier: Apache-2.0
-- Auth identity table _user is provided by TrailBase, not recreated here.
-- Domain JSON is server-validated by domain.mjs before commands; these relational
-- projections enforce immutable ownership and tenant-safe relationships too.
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 archived INTEGER GENERATED ALWAYS AS (COALESCE(json_extract(doc, '$.archived'), 0)) STORED CHECK(archived IN (0,1)),
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX projects_owner_page ON projects(owner_id, uuid);
CREATE TRIGGER projects_immutable BEFORE UPDATE ON projects
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TABLE tasks (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 project_id TEXT GENERATED ALWAYS AS (json_extract(doc, '$.projectId')) STORED,
 FOREIGN KEY(owner_id, project_id) REFERENCES projects(owner_id, uuid) ON DELETE RESTRICT,
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX tasks_owner_page ON tasks(owner_id, uuid);
CREATE TRIGGER tasks_immutable BEFORE UPDATE ON tasks
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TABLE routines (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 archived INTEGER GENERATED ALWAYS AS (COALESCE(json_extract(doc, '$.archived'), 0)) STORED CHECK(archived IN (0,1)),
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX routines_owner_page ON routines(owner_id, uuid);
CREATE TRIGGER routines_immutable BEFORE UPDATE ON routines
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TABLE occurrences (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 routine_id TEXT GENERATED ALWAYS AS (json_extract(doc, '$.routineId')) STORED NOT NULL,
 occurrence_date TEXT GENERATED ALWAYS AS (json_extract(doc, '$.date')) STORED NOT NULL,
 UNIQUE(owner_id, routine_id, occurrence_date),
 FOREIGN KEY(owner_id, routine_id) REFERENCES routines(owner_id, uuid) ON DELETE RESTRICT,
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX occurrences_owner_page ON occurrences(owner_id, uuid);
CREATE TRIGGER occurrences_immutable BEFORE UPDATE ON occurrences
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TABLE outcomes (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 task_id TEXT GENERATED ALWAYS AS (json_extract(doc, '$.taskId')) STORED NOT NULL,
 start_date TEXT GENERATED ALWAYS AS (json_extract(doc, '$.period.start')) STORED NOT NULL,
 end_date TEXT GENERATED ALWAYS AS (json_extract(doc, '$.period.end')) STORED NOT NULL,
 UNIQUE(owner_id, task_id, start_date, end_date),
 FOREIGN KEY(owner_id, task_id) REFERENCES tasks(owner_id, uuid) ON DELETE RESTRICT,
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX outcomes_owner_page ON outcomes(owner_id, uuid);
CREATE TRIGGER outcomes_immutable BEFORE UPDATE ON outcomes
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TABLE period_notes (
 id BLOB PRIMARY KEY NOT NULL CHECK(length(id)=16),
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 uuid TEXT GENERATED ALWAYS AS (json_extract(doc, '$.id')) STORED NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 kind TEXT GENERATED ALWAYS AS (json_extract(doc, '$.kind')) STORED NOT NULL CHECK(kind IN ('day','week')),
 start_date TEXT GENERATED ALWAYS AS (json_extract(doc, '$.period.start')) STORED NOT NULL,
 end_date TEXT GENERATED ALWAYS AS (json_extract(doc, '$.period.end')) STORED NOT NULL,
 UNIQUE(owner_id, kind, start_date, end_date),
 UNIQUE(owner_id, uuid)
) STRICT;
CREATE INDEX period_notes_owner_page ON period_notes(owner_id, uuid);
CREATE TRIGGER period_notes_immutable BEFORE UPDATE ON period_notes
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.id IS NOT OLD.id OR NEW.uuid IS NOT OLD.uuid
 OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TRIGGER tasks_active_project_insert BEFORE INSERT ON tasks
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM projects WHERE owner_id=NEW.owner_id AND uuid=NEW.project_id AND archived=0)
BEGIN SELECT RAISE(ABORT, 'active same-owner project required'); END;
CREATE TRIGGER tasks_active_project_update BEFORE UPDATE ON tasks
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM projects WHERE owner_id=NEW.owner_id AND uuid=NEW.project_id AND archived=0)
BEGIN SELECT RAISE(ABORT, 'active same-owner project required'); END;
CREATE TRIGGER project_archive_unassign AFTER UPDATE ON projects
WHEN OLD.archived=0 AND NEW.archived=1
BEGIN
 UPDATE tasks SET doc=json_remove(doc, '$.projectId'), revision=revision+1,
 updated_at=MAX(updated_at, NEW.updated_at)
 WHERE owner_id=NEW.owner_id AND project_id=NEW.uuid;
END;
CREATE TABLE preferences (
 owner_id BLOB PRIMARY KEY NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at)
) STRICT;
CREATE TRIGGER preferences_immutable BEFORE UPDATE ON preferences
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.created_at != OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'immutable identity or invalid revision'); END;

CREATE TRIGGER occurrence_key_immutable BEFORE UPDATE ON occurrences
WHEN NEW.routine_id IS NOT OLD.routine_id OR NEW.occurrence_date IS NOT OLD.occurrence_date
BEGIN SELECT RAISE(ABORT, 'immutable occurrence key'); END;
CREATE TRIGGER note_period_immutable BEFORE UPDATE ON period_notes
WHEN NEW.kind IS NOT OLD.kind OR NEW.start_date IS NOT OLD.start_date OR NEW.end_date IS NOT OLD.end_date
BEGIN SELECT RAISE(ABORT, 'immutable note period'); END;
CREATE TRIGGER outcome_key_immutable BEFORE UPDATE ON outcomes
WHEN NEW.task_id IS NOT OLD.task_id OR NEW.start_date IS NOT OLD.start_date OR NEW.end_date IS NOT OLD.end_date
BEGIN SELECT RAISE(ABORT, 'immutable outcome association'); END;
