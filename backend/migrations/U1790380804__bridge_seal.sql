-- SPDX-License-Identifier: Apache-2.0
-- REPLACE does not fire DELETE triggers unless recursive_triggers is enabled.
-- Permit the identical pair for idempotency; reject either identity being rebound.
CREATE TRIGGER meos_bridge_no_rebind BEFORE INSERT ON _meos_bridge_binding
WHEN EXISTS (
 SELECT 1 FROM _meos_bridge_binding
 WHERE (bridge_id=NEW.bridge_id AND owner_id!=NEW.owner_id)
    OR (owner_id=NEW.owner_id AND bridge_id!=NEW.bridge_id)
)
BEGIN SELECT RAISE(ABORT,'bridge binding is sealed'); END;
