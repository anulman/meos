-- SPDX-License-Identifier: Apache-2.0
-- Operator-owned deployment configuration, written once after physical target
-- verification. No application command or Record API exposes this table.
CREATE TABLE _meos_deployment (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1) REFERENCES _meos_instance(singleton),
 origin TEXT NOT NULL CHECK(length(origin) BETWEEN 9 AND 300)
) STRICT;
CREATE TRIGGER meos_deployment_no_update BEFORE UPDATE ON _meos_deployment
BEGIN SELECT RAISE(ABORT,'deployment origin is sealed'); END;
CREATE TRIGGER meos_deployment_no_delete BEFORE DELETE ON _meos_deployment
BEGIN SELECT RAISE(ABORT,'deployment origin is sealed'); END;
