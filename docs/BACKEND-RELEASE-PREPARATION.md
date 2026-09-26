# Persistent release preparation — blocked, not deployment authority

No production changes or cutover are authorized by this document. B5 cutover still requires Aidan's later release authorization, after B4 evidence and independent review. Existing demo remains the live mode.

## Artifact lock status

- Frontend image/commit: still requires a separately owned same-screen browser integration run.
- Native service: source-built TrailBase v0.33.22, static musl, explicit embedded native assets/migrations, no GEOS. Exact local image and retained source/notices hashes live in `backend/reviewed-artifacts.json`; this is local admission, not production release approval.
- Independent guest: compiled and exercised through native SQL/HTTP/auth/WASI. `backend/componentizer-qualification.json` binds its exact bytes. Final image must include these bytes, not depend on a development volume update.
- Migrations: planner, weather, immutable bridge-owner binding and private maintenance receipt; exercised in real isolated TrailBase, with additive upgrade and third-instance restore proof.
- Synthetic bootstrap: `sudo python3 scripts/backend-bootstrap.py`; checks the managed container/volume/instance identity, creates ordinary users through the reviewed current schema and native password hasher, stores synthetic credentials privately, never resets completed users. Repeated bootstrap preserved all three password hashes and preference revisions. This is acceptance-only tooling, not a production account-creation authorization.
- Retained source/notices and conservative linked/runtime component closure are hash-bound in the registry. Build tools and caches are excluded from the scratch runtime image.

## Verified backend evidence and remaining acceptance

46 focused tests pass. Separate live suites cover planner29, session13, short-TTL expiry/refresh6, protected proxy7, bridge/weather21, restore19 and actual WASI provider/cache9 checks. These counts include overlapping login assertions and must not be summed as unique checks. Private cron pruning, repeat-safe bootstrap, real provider-only egress and denial of unrelated/host destinations were also proved. Evidence receipts are `backend/live-*-evidence.json`.

Signed native auth JWTs remain usable until expiry even after refresh-session logout; browser cookie deletion is not immediate server-side JWT revocation. Normal TTL config was restored after the synthetic short-TTL test.

Final image fresh-run planner29/proxy7 and migration004 seal checks pass. Independent static review found one P2 sealed-binding REPLACE gap, now fixed and rechecked with no further findings. Remaining: same-origin browser integration using the real client adapter/screens (including identity cache clearing and retry journeys), concrete production config/bootstrap plan and later explicit release authorization. No production cutover is implied by backend HTTP or restore proofs.

## Required protected routing

Use separate deployment resources for production and acceptance. No shared volumes, credentials, network, database, host ports or instance identity. Acceptance contains only synthetic data; its browser runner must have no network route to production. Foundation network=none is not the final browser topology.

Use `createProtectedApiProxy({origin, upstream})` from `backend/protected-proxy.mjs` alongside static client routing. Allow form-only POST `/api/auth/v1/login`, safe `/api/meos/v1/*` and same-origin CSRF-checked POST `/api/meos/auth/logout`. Deny the bridge ingress on this public adapter, all other native auth/status/admin/record/signup APIs and raw token export. Strip forged host context/authorization forwarding. Normalize auth cookies to Secure/HttpOnly/SameSite=Lax; logout emits canonical Max-Age=0 deletions. `sudo python3 scripts/backend-live-runner.py --proxy` exercises the real native form-login/session/logout through this helper, not a browser.

Bridge ingress uses a separate ordinary native identity bound immutably to one owner, never a caller-provided owner. Expose it only through a separately authenticated integration route, not the public browser proxy. A production location feed remains unconfigured and unauthorized by this acceptance proof.

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
