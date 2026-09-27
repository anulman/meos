-- SPDX-License-Identifier: Apache-2.0
-- Credential-free provider projection. Only completed publications are visible.
CREATE TABLE calendar_cache_state (
 owner_id BLOB PRIMARY KEY REFERENCES _user(id),
 sequence INTEGER NOT NULL DEFAULT 0,
 pending_sequence INTEGER NOT NULL DEFAULT 0,
 metadata TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE calendar_cache_events (
 owner_id BLOB NOT NULL REFERENCES _user(id),
 event_key TEXT NOT NULL,
 doc TEXT NOT NULL CHECK(json_valid(doc)),
 PRIMARY KEY(owner_id,event_key)
) STRICT;
CREATE TABLE calendar_cache_pages (
 owner_id BLOB NOT NULL REFERENCES _user(id),
 sequence INTEGER NOT NULL,
 page INTEGER NOT NULL,
 pages INTEGER NOT NULL,
 generation TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(owner_id,page)
) STRICT;
