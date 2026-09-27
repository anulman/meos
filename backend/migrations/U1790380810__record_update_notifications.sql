-- SPDX-License-Identifier: Apache-2.0
-- Opt-in checkpoint. Existing subscribers retain boundary-only behavior.
ALTER TABLE notification_consumers ADD COLUMN update_cursor INTEGER;
