-- SPDX-License-Identifier: Apache-2.0
-- Written once by the trusted, offline bootstrap after physical target checks.
-- Never expose this table through the Record API or owner-writable commands.
CREATE TABLE _meos_instance (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 instance_id TEXT NOT NULL CHECK(length(instance_id)=32 AND instance_id NOT GLOB '*[^0-9a-f]*'),
 environment TEXT NOT NULL CHECK(environment IN ('acceptance','production'))
) STRICT;
CREATE TRIGGER meos_instance_no_update BEFORE UPDATE ON _meos_instance
BEGIN SELECT RAISE(ABORT,'instance identity is sealed'); END;
CREATE TRIGGER meos_instance_no_delete BEFORE DELETE ON _meos_instance
BEGIN SELECT RAISE(ABORT,'instance identity is sealed'); END;
