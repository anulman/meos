-- SPDX-License-Identifier: Apache-2.0
CREATE TABLE notification_consumers (
 agent_id BLOB PRIMARY KEY REFERENCES _meos_agent_grants(agent_id),
 consumer TEXT NOT NULL, fence INTEGER NOT NULL, lease_until INTEGER NOT NULL,
 planned_at INTEGER NOT NULL, preferences TEXT NOT NULL DEFAULT '{}',
 gap INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE notification_events (
 agent_id BLOB NOT NULL REFERENCES _meos_agent_grants(agent_id),
 id TEXT NOT NULL DEFAULT (lower(hex(randomblob(24)))),
 bucket TEXT NOT NULL, due INTEGER NOT NULL, payload TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(agent_id,id), UNIQUE(agent_id,bucket)
) STRICT;
CREATE INDEX notification_due ON notification_events(agent_id,active,acked,due);
CREATE TABLE notification_batches (
 token TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(32)))),
 agent_id BLOB NOT NULL REFERENCES _meos_agent_grants(agent_id),
 fence INTEGER NOT NULL, ids TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX notification_batch_agent ON notification_batches(agent_id,fence,acked);
