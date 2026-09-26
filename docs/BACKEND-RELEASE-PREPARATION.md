# Persistent release preparation — blocked, not deployment authority

No production changes or cutover are authorized by this document. B5 cutover still requires Aidan's later release authorization, after B4 evidence and independent review. Existing demo remains the live mode.

## Artifact lock status

- Frontend image/commit: not selected until frontend qualification and integration.
- TrailBase runtime digest: **not admitted**; stock archive includes unapproved GEOS as recorded in `upstream-findings.json`.
- MeOS guest-handler artifact: not built; extension ABI/toolchain/license path unresolved.
- Migrations: `U1790380800__planner.sql`, `U1790380801__weather.sql`; exercised against disposable SQLite only, not TrailBase.
- Bootstrap: not implemented; must create one ordinary owner and defaults repeat-safely against a verified instance, with masked/protected secret input and a seal. Recovery/revocation stays a separate operator action.

No placeholder image or unqualified manifest may be promoted into the reviewed launch registry. Selected artifacts must have actual bytes/digests, retained matching source/notices and complete reviewed runtime/linked-component license closure.

## Required protected routing

Use separate deployment resources for production and acceptance. No shared volumes, credentials, network, database, host ports or instance identity. Acceptance contains only synthetic data; its browser runner must have no network route to production. Foundation network=none is not the final browser topology.

Proposed same-origin application paths: static client plus `/api/meos/v1/*` custom handlers, narrowly qualified native form-login/logout paths. Deny public admin/native record write APIs, public registration and raw `/auth/status` token export. Never forward admin credentials into public runtime config. Exact routes/config depend on pinned auth qualification, not assumptions in this proposal.

## Before release authorization

1. Admit exact service/guest artifacts and preserve source/notices.
2. Bind trusted runtime identity, test full cookie/CSRF lifecycle and clear in-flight/user-scoped caches on identity changes.
3. Run same adapter, handler, migration and frontend screen journeys against isolated TrailBase with ordinary synthetic identities, including second-user/anonymous denial, restart persistence, conflict/retry/page/date cases.
4. Prove harmless rejection of production endpoint/identity/volume/network targets before running acceptance. Unit fixture refusal alone is insufficient.
5. Upgrade a prior synthetic fixture with versioned migrations and verify all IDs/relations/documents. Use consistent SQLite/depot backup including required identity/config material; restore only disposable data into a third separate runtime/volume/network and compare records.
6. Independent exact-tree review and focused checks; record frontend/backend/config image digests and no unresolved blockers.
7. Obtain later release authorization for the concrete reviewed persistent cutover.

## Backup and rollback contract

Backup must be consistent with SQLite WAL activity; never claim copying the main database alone proves recovery. Use the pinned server's qualified backup method or quiesce the entire relevant depot consistently. Protect identity/config/secret material separately; no secrets in logs or repo. Restore must prove ordinary-owner login and relational/document integrity, not just a file checksum.

Rollback has two distinct cases: (a) before personal writes, restore the prior static demo route/config; (b) after personal writes, stop writes and preserve the new depot/backup before any rollback. Never discard new personal data to return to reset-demo semantics. Schema downgrade is not implied; prefer forward correction unless the exact restore point and acknowledged data consequences have separate authorization.

No service, schedule, backup job, bootstrap identity or watchdog is installed by this file.
