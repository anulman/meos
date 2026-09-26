# SPDX-License-Identifier: Apache-2.0
"""Content-only preservation fingerprints; no connections or mutations at import."""
import hashlib
REQUIRED_TABLES=('_user','_meos_agent_grants','_meos_bridge_binding','preferences','tasks','routines','occurrences','projects','period_notes','outcomes','command_receipts','sync_outbox','external_events','deletion_tombstones','latest_location','weather_cache')
def fingerprint(db):
 existing={row[0] for row in db.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
 assert set(REQUIRED_TABLES)<=existing,'Required preservation table missing'
 return {table:hashlib.sha256(repr(db.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall()).encode()).hexdigest() for table in REQUIRED_TABLES}
