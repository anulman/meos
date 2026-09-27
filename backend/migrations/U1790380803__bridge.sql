-- SPDX-License-Identifier: Apache-2.0
-- A bridge account is a distinct ordinary native identity scoped to one owner.
-- No public Record API or owner command exposes this binding table.
CREATE TABLE _meos_bridge_binding (
 bridge_id BLOB PRIMARY KEY NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 owner_id BLOB NOT NULL UNIQUE REFERENCES _user(id) ON DELETE RESTRICT,
 CHECK(length(bridge_id)=16 AND length(owner_id)=16 AND bridge_id != owner_id)
) STRICT;
CREATE TRIGGER meos_bridge_no_update BEFORE UPDATE ON _meos_bridge_binding
BEGIN SELECT RAISE(ABORT,'bridge binding is sealed'); END;
CREATE TRIGGER meos_bridge_no_delete BEFORE DELETE ON _meos_bridge_binding
BEGIN SELECT RAISE(ABORT,'bridge binding is sealed'); END;
-- Operational proof of private scheduled execution; never includes coordinates.
CREATE TABLE _meos_maintenance (
 job TEXT PRIMARY KEY NOT NULL CHECK(job='weather-prune'),
 ran_at INTEGER NOT NULL,
 run_count INTEGER NOT NULL CHECK(run_count>0)
) STRICT;
