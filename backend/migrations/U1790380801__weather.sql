-- SPDX-License-Identifier: Apache-2.0
-- Latest coarse location only. Weather cache is disposable and expires separately.
CREATE TABLE latest_location (
 owner_id BLOB PRIMARY KEY NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 observed_at INTEGER NOT NULL,
 latitude REAL GENERATED ALWAYS AS (json_extract(doc,'$.latitude')) STORED NOT NULL
   CHECK(latitude BETWEEN -90 AND 90 AND round(latitude,2)=latitude),
 longitude REAL GENERATED ALWAYS AS (json_extract(doc,'$.longitude')) STORED NOT NULL
   CHECK(longitude BETWEEN -180 AND 180 AND round(longitude,2)=longitude)
) STRICT;
CREATE TRIGGER latest_location_order BEFORE UPDATE ON latest_location
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.observed_at<=OLD.observed_at
BEGIN SELECT RAISE(ABORT, 'immutable owner or non-increasing observation'); END;
CREATE TABLE weather_cache (
 owner_id BLOB NOT NULL REFERENCES _user(id) ON DELETE RESTRICT,
 cache_key TEXT NOT NULL,
 doc TEXT NOT NULL CHECK(json_valid(doc) AND json_type(doc)='object'),
 fetched_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>fetched_at AND expires_at<=fetched_at+86400000),
 PRIMARY KEY(owner_id,cache_key)
) STRICT;
CREATE INDEX weather_cache_retention ON weather_cache(fetched_at);
