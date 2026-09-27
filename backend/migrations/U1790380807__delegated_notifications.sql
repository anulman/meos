-- SPDX-License-Identifier: Apache-2.0
CREATE TABLE notification_consumers_owner (
 agent_id BLOB PRIMARY KEY REFERENCES _user(id),
 consumer TEXT NOT NULL, fence INTEGER NOT NULL, lease_until INTEGER NOT NULL,
 planned_at INTEGER NOT NULL, preferences TEXT NOT NULL DEFAULT '{}',
 gap INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE notification_events_owner (
 agent_id BLOB NOT NULL REFERENCES _user(id),
 id TEXT NOT NULL DEFAULT (lower(hex(randomblob(24)))),
 bucket TEXT NOT NULL, due INTEGER NOT NULL, payload TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(agent_id,id), UNIQUE(agent_id,bucket)
) STRICT;
CREATE TABLE notification_batches_owner (
 token TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(32)))),
 agent_id BLOB NOT NULL REFERENCES _user(id),
 fence INTEGER NOT NULL, ids TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
) STRICT;
INSERT INTO notification_consumers_owner SELECT * FROM notification_consumers;
DROP TABLE notification_consumers;
ALTER TABLE notification_consumers_owner RENAME TO notification_consumers;
INSERT INTO notification_events_owner SELECT * FROM notification_events;
DROP TABLE notification_events;
ALTER TABLE notification_events_owner RENAME TO notification_events;
INSERT INTO notification_batches_owner SELECT * FROM notification_batches;
DROP TABLE notification_batches;
ALTER TABLE notification_batches_owner RENAME TO notification_batches;
CREATE INDEX notification_due ON notification_events(agent_id,active,acked,due);
CREATE INDEX notification_batch_agent ON notification_batches(agent_id,fence,acked);
