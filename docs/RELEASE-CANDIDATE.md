# Production-origin runtime candidate (not deployment)

`scripts/release-build.py` is a trusted host launcher, not repository build code
to run with credentials. It validates the retained base admission, source archive,
inventory, notices and every rootfs file, then uses the exact reviewed patched
QuickJS compiler. Bundling/compilation run nonroot with a clean environment,
private network, hidden host home/storage/runtime sockets, and only selected
source/compiler/esbuild/guest dependencies mounted. No package downloads occur.
Run `sudo python3 scripts/release-build.py` from this checkout after review.

The new untagged image is **not admitted** and is never deployed by the script.
Its private `.qualification/release-*/candidate.json` identifies image, full file
hashes, source hashes, source commit, compiler, retained closure and isolation
proof. The only changes from the reviewed scratch rootfs are guest WASM and
application-name/site-URL config. Native binary, migrations and notices remain
byte-identical. Native registration remains disabled (`disable_password_auth:true`); the pinned
login handler still permits existing ordinary users, as acceptance previously proved. Existing accepted images/registry and public preview remain
unchanged. Preserve the whole release directory: base retained source archive and
notices plus new application-source archive are the complete provenance set.

## Exact-artifact acceptance: required before admission

Earlier acceptance-image results do **not** qualify this image. Build once and
test the exact image ID that would later be deployed. Do not recompile afterward.

Use a separate trusted `release-*` qualification launcher; do not weaken or
retarget `integration-runner.py` or existing acceptance bootstrap. Before *every*
mutation verify live Docker container ID, exact candidate image, fresh unique
run ID, dedicated local volume, `meos.environment=acceptance` and
`meos.acceptance.run=<run>` labels on container/volume, no other mounts or network,
nonroot `10001:10001`, read-only rootfs, `cap-drop=ALL`, no-new-privileges and no
ports. No production directory, credential or socket may enter this test lane.

The guest is compiled for `https://meos.aidans.computer` and environment
`production`. In the disposable synthetic-only database, seal
`_meos_instance.environment='production'` with a fresh synthetic run UUID.
**This is a guest-contract value, not permission to use production storage.**
Container/volume/test-plan environment labels remain `acceptance`. Record both
values explicitly. Existing launchers correctly reject this mixed contract;
do not edit them to bypass that rejection.

Start command for the isolated candidate (no published ports):

```text
/bin/trail --depot /data --public-url https://meos.aidans.computer run
  --address unix:/data/server.sock --admin-address unix:/data/admin.sock
```

Only fresh synthetic owner/other/bridge/agent identities may be bootstrapped.
The trusted test proxy/browser namespace maps the canonical HTTPS origin to its
own loopback proxy, connecting exclusively to the verified disposable Unix
socket; no real DNS or canonical production connection. Prove network/host-path
denial before tests. Preserve response cookies and production Origin checks.

Required proofs on exact candidate: wrong compiled origin denied; missing/wrong
instance environment denied; sealed instance rejects changes; ordinary owner
login/session/CSRF/logout; second-owner isolation; planner/browser same-screen
flows and reload/restart persistence; scheduled/recurring conflict/idempotency;
MCP/bridge isolation; disabled-weather fallback; backup/restore into another
fresh acceptance-labeled volume with fresh private runtime keys. Any enabled
provider path needs separately constrained provider transport proof, not broad
container egress. Preserve artifacts/logs without tokens. Independent reviewer
must then admit candidate and qualification evidence explicitly; builder does
not self-admit. Admission registry changes belong to integration owner.

## Production bootstrap interface and separate credential input boundary

No real owner has been created. Required eventual interface is a trusted
`release-bootstrap.py --receipt <nonsecret-identity-receipt> --owner-file <path>`
or a masked secret bridge passing a preopened FD. **This interface is a design,
not a delivered executable bootstrap command.**

Input contract: bounded JSON `{ "email": "...", "password": "..." }`; regular
file opened with `O_NOFOLLOW`, operator-owned, exact mode0600, single hard link,
size bounded, same inode validated after opening. Use a private parent directory.
Never accept email/password via argv, environment, chat, stdout or ordinary logs;
never substitute acceptance credentials. FD bridge must provide equivalent
operator provenance. Do not store password in bootstrap receipts. Disable
tracebacks/raw upstream response dumps on secret-bearing paths.

Before reading input: verify explicit production authority, admitted image,
exclusive fresh production target, protected proxy deployment identity, intended
volume and no prior owner/instance. Persist only nonsecret intent/UUID for
interruption reconciliation. Create an ordinary user, not admin; do not silently
reset a pre-existing owner. A partial bootstrap must fail closed for inspection.
Seal production instance, set owner preferences, install credentials via a
reviewed private-body/FD-capable native path, verify login without logging tokens,
keep native registration disabled. No browser-facing signup/admin/raw-record endpoints.

**Unsafe CLI alternative (not used):** upstream `UserSubCommands::ChangePassword` requires the password as
a positional CLI argument. Existing acceptance bootstrap invokes it that way;
it is not an approved production credential sink. Native `add_user` also targets
a removed `verified` column. The private admin route below has now passed synthetic qualification; a reviewed
production bootstrap implementation and secure operator input path remain separate work. Do not change reviewed native binary or
introduce hashing dependencies silently to work around this.

## Concrete cutover and rollback sequence for parent

1. Complete exact-image proof, independent admission, secure credential sink,
   frontend exact-build proof and reviewed protected-proxy deployment materials.
2. Retain current preview image/config and inspect its live identity. Allocate
   a new production volume; never rename/copy synthetic acceptance data into it.
3. Bootstrap the ordinary production owner through the qualified secret path.
   Keep native/admin Unix sockets private. Use the canonical origin throughout.
4. Start protected frontend/proxy on a new loopback port and perform authorized
   smoke checks. Only then change the existing public origin routing, preserving
   Access policy. No preview deletion, DNS change or broad egress is implied.
5. Verify authenticated user login, persistent write/read/restart and denied raw
   native/admin/MCP/bridge routes. Record exact runtime/frontend/proxy identities.
6. On failure restore the previous frontend origin/routing without overwriting
   the new persistent volume. Preserve failed runtime, volume and receipts for
   reconciliation; data recovery is separate from UI rollback.

Production topology/bootstrap implementation and approval remain with parent.

## Private credential sink (synthetic live qualification complete)

Retained native source provides `POST /api/_admin/user` on `admin.sock`:
JSON body `{email,password,verified:true,admin:false}`. `create_user_handler`
validates password policy, uses native `hash_password`, and inserts current
`email,unverified_email,username,password_hash,admin` columns. The email-send
branch is skipped when `verified:true`. It does not depend on public registration
or enabling password auth. The admin middleware rechecks live DB admin status
and requires `CSRF-Token` (native admin header, not the MeOS browser API header) equal to the authenticated user's CSRF claim.

Fresh runtime initialization creates `admin@localhost`; its generated password
is info-level logged, so the candidate's fixed `RUST_LOG=warn` must remain and
no verbose/debug override is allowed. No one should retrieve that password.
The reviewed native `user mint admin@localhost` CLI needs no secret arguments.
A trusted bootstrap can capture its base64-encoded JSON stdout and stderr (which also contains tokens) directly into private process
memory (never tool stdout), extract auth/refresh and token CSRF fields, then
POST the owner password in the private UDS request body. Credentials remain
inside the trusted bootstrap, never repository tests or client assets. Disable
HTTP request-body/header logging and suppress raw responses on errors.

Qualify before use: exact-image synthetic create/login; verified ordinary user;
zero email attempts; wrong/missing CSRF rejected; non-admin rejected; bootstrap
token revocation and removal or disabling of bootstrap admin; restart proves
ordinary owner survives and bootstrap privilege does not return; public proxy
still denies the endpoint. Removing bootstrap admin must be separately reviewed
against native startup's `new_db` behavior and recovery requirements. The owner
must never be temporarily promoted. Interruption receipts contain only identity
and completed step, not tokens/passwords. Synthetic qualification is recorded below. No real-user mutation was performed
by this artifact task.

Source evidence (under retained TrailBase source commit
`3dfb2f70d8266036f1e7e9db4902e8b81026f69d`):

- `crates/core/src/admin/user/create_user.rs` — private body/native hash/no mail.
- `crates/core/src/server/mod.rs:557` — live admin and CSRF checks.
- `crates/core/src/auth/cli.rs` — no-password token mint operation.
- `crates/cli/src/args.rs:270` — token mint accepts user identifier only.
- `crates/core/src/app_state.rs:260` — fresh-db bootstrap admin and log level.

## Candidate and completed synthetic checkpoint

- Candidate image: `sha256:2c82cad86d63aada074c3b3bad003b70e00a4f35c3b587f062289222b338cfdc`.
- Guest: `sha256:fbebd56a6391f74713fdda6b4db42ee2253e287c1e573dd0596ef170aff7405f`.
- Native unchanged: `sha256:56a52ec20c612c4d6e241e58282d20d42251d1fec53e6e9ab02b25e7b9aa965c`.
- Complete build receipt: `.qualification/release-1790423716215556027/candidate.json`
  (SHA256 `4fa185db2ce97ea051c04782579b3c1ae54a4d904db26fb3be58cc97ccb08cc6`).
- Independent bounded admission and reviewer identity:
  `.qualification/release-acceptance/admission.json`. Admission is only for
  isolated qualification, **not production deployment**.
- Final reviewed trusted launcher: `scripts/release-acceptance.py`, SHA256
  `f7a33ae339afb39c994b18499ddc246cd439f82731bad11dca18adba30604dfd`.
- Synthetic run: `f9d0a1bd446b4fbb913de00b873331d2`; physical acceptance labels,
  no network, no published ports, production-compiled guest/environment.

The qualified private admin route created four ordinary verified synthetic users
with password only in a UDS request body. Native admin header is **CSRF-Token**,
not the browser API's X-CSRF-Token. Missing/wrong header was denied. Bootstrap
admin was demoted; minted refresh token failed after revocation; admin was then
deleted and did not return after restart. Four ordinary logins pass while native
registration remains403. Canonical production guest instance matches the fresh
run ID. Combined container stdout/stderr contains no password/bootstrap-password
log. No mail send branch is taken (`verified:true`), and physical network-none
precludes external transport; no SMTP stub delivery-count claim is made.

Evidence under `.qualification/release-acceptance/`:

- `partial-bootstrap-checks.json`: exact earlier launcher hash and sequential
  assertion evidence for successful private sink/CSRF/revocation before the
  canonical-Host probe correction. This is not mislabeled a full final run.
- `bootstrap-checks.json`: completed canonical instance/login/registration/logs/
  restart checks and completed repeat-bootstrap flag.
- `repeat-proof.json`: before/after fingerprints prove user UUID/password hash/
  privilege, bridge binding and agent owner/scopes/status/expiry unchanged.
- `runtime-launch.json`, `acceptance-endpoint.json`: checked live target for
  parent's exact-image browser/protected-adapter suite.
- `synthetic-credentials.json`: private0600 synthetic data, never publish.

Socket paths exceed Linux AF_UNIX's limit. The reviewed launcher opens the
verified directory with O_DIRECTORY|O_NOFOLLOW and uses its short
`/proc/self/fd/<fd>/<socket>` alias. Positive204-byte-path and symlink-directory
rejection proof: `.qualification/release-dirfd-proof-2s16p7af/proof.json`.

No existing backend registry, accepted image, frontend source or production
resource was changed by this lane. One initial untagged import was superseded
when the post-import Git ownership check failed; its image/failed receipt are
recorded at `.qualification/release-1790423640067807434/incomplete-build.json`.
It was never run or deployed. Preserve it for reconciliation; do not mistake it
for the admitted candidate. Exact-image frontend/proxy qualification is owned by
parent and not claimed by these runtime/bootstrap results.

## Build-isolation correction — completed hardened replacement

Independent review found that shared host UID10001 plus `ProtectProc=invisible`
does not prevent same-UID host process `/proc/<pid>/root` or FD access. Earlier
sandbox receipts do not qualify that boundary. No production data was accessed.
A private-user-namespace proposal was reviewed and failed closed before build
code because uid_map was unsupported; it is not the current launcher.

Current reviewed build reserves unused UID/GID61003 under an exclusive root-held
lock, rejects pre-existing accounts/groups/processes using it, uses trusted
setpriv with all capabilities dropped, and disallows namespace creation.
Backend10001, test61001 and web61002 remain distinct. The clean-environment
pre-module isolation proof denies host files/sockets/network and distinct backend/
web decoy proc root/FD/environment reads. Source, launcher and proof inputs are
read-only; only work output is writable. No shared-UID fallback is allowed.

### Build isolation follow-up

The first private-user-namespace probe failed closed at uid_map EPERM before
Node or build code. No fallback was executed without separate review. The
reviewed alternative reserves otherwise unused UID61003 with the root lock and
process/account preflight, drops all capabilities, disallows namespace creation,
and proves denial against distinct backend10001/web61002 decoys. The bounded
probe passed: `.qualification/release-1790425215767269153/work/isolation-proof.json`.
The full hardened compiler then succeeded in
`.qualification/release-1790425529849974858/`. Guest-bundle and metafile match the
older build byte-for-byte, but guest WASM differs (6506844 vs6506842 bytes); no
semantic/byte-equivalence claim is made. New image
`sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d`
received fresh exact-image admission and qualification described below. Older runtime,
receipts and source/license artifacts remain retained and untouched.


### Final hardened artifact qualification

Hardened run `65e110e797dc4f22969f792af1efd8f8` completed synthetic private-owner
bootstrap, admin retirement, no-reset fingerprint repeat, and parent suites:
native29, proxy7, MCP19, browser26, actual production entrypoint4 and restart4.
The frozen combined-release receipt is
`.qualification/run-evidence-candidate-release.json`, SHA256
`de975ee9c829238d48d6163842c13bcee1ecb5ee0b36e1975e8983655bb716fc`.
One client output `.qualification/integration-mp_n57o_/dist/client` passed both
browser and entrypoint tests; digest
`2618f9708b12ef1b6bbe05c101f50dcc3e70cc2583be1385e4a09f6d836b99a4`.
Never rebuild at deployment.

Separate tooling qualification run `4befa85ebb07441aa13ff1af1e10cdb3` passed
root-file synthetic bootstrap/no-reset repeat and rendered-unit lifecycle9;
see `docs/PRODUCTION-CUTOVER-PLAN.md` for receipts, corrected deployment-path
errors and regression proofs. All acceptance targets remain physically isolated;
none is promoted into production. Human Node host-link policy exception and
masked real-owner input are still required before production provisioning.
