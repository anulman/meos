# Conditional production cutover — concrete pending plan

Production cutover is user-authorized **after** relevant qualification/review
supports expected success. This is not an execution receipt. No production
provisioning or routing change has occurred.

## Exact identities already observed

- Current demo: `meos-preview`, image
  `sha256:07bd49e7e9fad365a2a06c8856a8d77b5f4775d2f3c293a58946b7dbfd8251a8`,
  no mounts, port127.0.0.1:3180 → container80.
- Caddy site `meos.aidans.computer`, reverse_proxy127.0.0.1:3180; preserve its TLS,
  Cloudflare address restriction, external Access policy and all unrelated sites.
- Backend candidate image
  `sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d`;
  source/closure receipt `docs/RELEASE-CANDIDATE.md`.
- Frozen frontend client digest: `2618f9708b12ef1b6bbe05c101f50dcc3e70cc2583be1385e4a09f6d836b99a4`, from `.qualification/integration-mp_n57o_/dist/client`.
- Combined release receipt `.qualification/run-evidence-candidate-release.json`, SHA256 `de975ee9c829238d48d6163842c13bcee1ecb5ee0b36e1975e8983655bb716fc`; source digest `8e562917d21d189123dad21ac3993a978ac0822f65df1548e856ace4bb67c732`. Browser26 and entrypoint4 passed on this SAME client output; never rebuild during staging/deployment.
- Hardened run `65e110e797dc4f22969f792af1efd8f8`: native29, proxy7, MCP19, browser26, entrypoint4 and restart4 passed. Rendered-unit lifecycle PASS9 on separate acceptance run `4befa85ebb07441aa13ff1af1e10cdb3`.
- Production release directory, instance/container/volume and secure owner input remain unallocated; qualification does not allocate or admit production.

## Gate and immutable release

1. Complete candidate browser, actual production-entrypoint, restart, focused
   tests and independent review. Freeze source commit and exact client-file
   manifest. Copy only those already-built files (do not rebuild on deployment).
2. Stage a root-owned release directory with client output, reviewed proxy
   modules/entrypoint and identity-check helper. No node_modules or synthetic
   credentials. Include manifest, source commit, approved dependency/license
   evidence. Verify every staged byte against reviewed qualification receipts.
3. Confirm existing target inventory again. Refuse an existing production volume
   or ambiguous prior deployment without read-only reconciliation. Allocate a
   fresh production-labelled volume and unique instance ID, never reuse/rename
   acceptance storage. No database import from tests.
4. A trusted bootstrap consumes owner email/password from the existing masked
   secret mechanism into a root-only temporary input. Neither argv, environment,
   chat, source tree nor logs may contain the password. Provision ordinary owner
   via the qualified private admin body API; revoke/remove bootstrap admin.
   Reconcile interruption by stable owner identity, never reset a password
   automatically. Keep registration disabled and network none (no email effects).

## Runtime topology

Backend container remains UID10001, readonly root, capability-free, network none,
only its production named volume and private server/admin Unix sockets. There
are no Docker TCP ports. Docker lifecycle is supervised by a dedicated systemd
unit; its readiness helper grants only the dedicated webUID61002 access to the
verified server socket (never the database/admin socket) and validates container/image/volume/instance identity.

`meos-web.socket` owns only127.0.0.1:3190. Its service runs the qualified Node
entrypoint as distinctUID61002 inside PrivateNetwork, with only the inherited HTTP listener,
read-only immutable release, private backend **server socket only**, and nonsecret
instance config. Production database/admin socket, Docker, host secrets and
internet remain unavailable to the web process. No MCP/bridge/private-native
routes are published. Backend restarts must restart the web service afterward
because a mounted Unix socket refers to an inode; lifecycle units use PartOf.

Unit templates under `deployment/` passed independently reviewed, isolated
rendered-unit lifecycle qualification. Production identity substitution and
admission remain pending; no production units are installed.

## Cutover and bounded smoke

Before switching Caddy, prove private listener serves exact config/static bytes,
correct production instance and ordinary authenticated owner session, and denied
private routes. No synthetic fixtures or destructive suite on production.
Back up only the relevant live Caddy configuration for exact rollback, validate
the candidate config, replace only MeOS reverse_proxy3180 with3190, and reload.
Preserve the running demo container/image for rollback.

Smoke checks after routing: TLS/origin response, real-mode config, normal login,
read-only preferences/empty planner, raw admin/MCP/bridge denial. Any persistence
write must be a clearly named reversible ordinary-user smoke item and is optional
if existing fresh-volume bootstrap/restart proof suffices. Never run qualification
scripts with production endpoint/credentials.

## Rollback and recovery

If routing/authentication/health smoke fails, restore the exact old Caddy MeOS
upstream3180 and validate/reload. Confirm public demo response; keep new backend
volume and receipts intact. Routing rollback does not roll back or overwrite
user data. Stop new writes before any later recovery decision.

Before migrations on an existing future production volume, stop writes/runtime,
make and verify a coherent main.db/auxiliary/config snapshot including WAL state,
and qualify restore in a fresh isolated volume. Initial cutover has no prior
persistent production database to migrate; if inventory contradicts this,
reconcile instead of proceeding under that assumption. Never replace a live
volume with acceptance data or automatically restore over post-cutover writes.


## Concrete tooling checkpoint — isolated qualification passed

No production objects, real owner, persistent installed units or routing changes
were created by this lane. Unique transient acceptance proof units were installed
and removed after qualification. The new hardened backend artifact is a separate candidate,
not represented as byte-equivalent to the older guest: native/migrations/config
match, but the guest snapshot differs despite byte-identical input bundle. Parent has completed the exact-image suites listed above. Rendered-unit lifecycle
qualification passed separately below; production-specific admission remains pending.

### Frozen release staging

`production-stage.py --qualification FILE --admission ROOT0600_FILE --output DIR`
copies one already-tested combined release-mode client output, its exact adapter source
closure, reviewed trusted helpers, and the exact Node binary/notices. It executes
no repository code and never rebuilds. Output parents must already be root-owned
and not group/world-writable; output must not exist. It emits readonly files and
manifest. The staging admission must identify:

- `status: approved-for-release-staging`, reviewer and review evidence;
- SHA256 of the exact successful combined release-mode receipt (entrypoint and browser on one build), sourceDigest and
  clientArtifactDigest (which fix the SSR shell timestamp rather than rebuilding);
- final sourceCommit and pinned candidate image;
- exact hashes of production-ready.py, production-web-exec.py and
  production-uid-check.py;
- Node binary SHA256, full LICENSE SHA256, exact27 supplemental source notice
  paths/hashes in nodeSupplementalNoticeFiles, explicit nodeRuntimeLicenseReview and
  licenseEvidence. Build-tool approval alone does not admit a shipped runtime.

The immutable release contains no node_modules, test credentials, bootstrap
input or production data. Existing `production-ready.py` remains parent's helper
and is included in independent review without modification by this lane.

### Owner bootstrap plan and secret interface

`production-bootstrap.py --plan ROOT0600_FILE --owner-file ROOT0600_FILE
--receipt-dir ROOT0700_DIR` is a trusted controller, **not a test runner**. Only
paths are arguments; email/password values must arrive through the masked broker
into the root-only file. Parent owns broker interaction and actual provisioning.
No chat fallback, environment variable, CLI password argument, raw upstream
response or exception value is permitted. Input is bounded JSON containing only
`email` and `password`, with O_NOFOLLOW, root ownership, single hard link,
mode0600, stable fstat and root0700 parent checks; ancestors cannot be writable
by nonroot. Input is never copied to release, Docker mounts, receipts or logs.
The controller does not delete broker-owned input; parent/broker expires it after
successful delivery or cancellation.

The separate nonsecret plan has exactly:

```json
{
  "schema": 1,
  "environment": "production",
  "instanceId": "<fresh 32 lowercase hex digits>",
  "image": "sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d",
  "origin": "https://meos.aidans.computer",
  "timezone": "<owner-approved IANA zone>",
  "reviewStatus": "approved-for-production-bootstrap",
  "reviewer": "<independent review identity>",
  "reviewEvidence": "<exact artifact/tooling/qualification evidence>",
  "releaseManifestSHA256": "<64 hex digits>",
  "releaseManifestFile": "<absolute immutable root-owned manifest.json>",
  "ownerInputKind": "masked-owner-file"
}
```

The root-owned plan records previously established authority; writing a status
string does not create user authority or substitute for independent review.
No real input is needed to review this source. For isolated proof the same
controller requires environment=acceptance, reviewStatus=
approved-for-isolated-qualification, ownerInputKind=synthetic-only-file and an
example.invalid owner. The test target is a **new** acceptance-labelled volume,
never the running browser candidate. Compiled guest environment remains
production in either physical lane.

Stable root0600 intent/phase receipts precede mutations. A random provisioning
nonce labels both fresh container and volume, allowing interrupted creates to
be reconciled only against their precise original intent. Existing targets
without that intent are rejected; acceptance storage cannot be promoted.
Owner creation uses private admin HTTP body/native password hashing. On an
interrupted create, the existing ordinary verified UUID and original supplied
password must match; no password setter/reset is called. Bootstrap admin is
demoted, sessions revoked, then deleted; owner remains ordinary. Completed
reruns only recheck live state and return without reading the secret or resetting
anything. Preferences initialize only when absent. No bridge/agent identity is
silently provisioned for the real owner.

### Rendered lifecycle proof, distinct from an adapter smoke

`production-render.py --state ROOT_STATE --release IMMUTABLE_RELEASE
--output NEW_ROOT_DIR` verifies the manifest and every staged byte then renders
three units; it does not install them. Production prefix is meos/port3190;
acceptance prefix is meos-proof-<run>/port3191. State/manifest paths are strict
root-owned nonwritable ancestors; substitutions reject systemd metacharacters.

The web unit runs a tiny reviewed root prestart UID-availability check, then
trusted setpriv drops to61002, clears groups/capabilities, and invokes the
nonroot production-web-exec.py. That wrapper verifies real inherited FD3 and
LISTEN_PID, zero capabilities, private host-path denial, then execs Node with a
clean allowlisted environment while preserving PID. Numeric systemd User=61002
is deliberately not used because it fails without an NSS account on this host.
Reserve UID61002 exclusively: production and proof units must never run
concurrently. The + prestart prefix is intentional for the reviewed identity
check to inspect host processes, not for application code. No application module
executes as root. Backend UID10001 and test UID61001 remain separate.

`production-lifecycle-proof.py --render-dir DIR --bootstrap-dir DIR
--synthetic-owner-file ROOT0600_FILE` passed **nine checks** on a separately
provisioned acceptance target after independent source review. It
accepts only a separately bootstrapped acceptance target carrying the matching
provisioning nonce; the current browser candidate lacks that nonce and is
rejected. It verifies rendered hashes, runs systemd-analyze verify, installs only
uniquely named transient proof units under /run/systemd/system, and binds
127.0.0.1:3191. It exercises actual socket activation/UID61002/zero caps/private
network, exact shell bytes, private-route denial and synthetic owner login.
Then backend restart must replace socket inode and web PID while preserving the
owner session; backend stop must stop web; a socket request must reactivate both.
It checks journal credential absence, stops/removes only the proof units it
created, and preserves volume/receipts. No production listeners, Caddy, existing
preview, main browser candidate or acceptance data are altered. Production execution remains gated; the isolated proof is complete.

### Remaining release decisions

- Preserve completed independent source review and synthetic helper/lifecycle
  receipts; reconcile any later changes before production admission.
- Admit exact staged Node runtime/license closure and helper hashes.
- Preserve the frozen, tested client output and independently qualified hardened backend listed above; no rebuild at deployment.
- Obtain owner input only through the masked mechanism; parent handles it.
- Production unit installation/routing must follow recorded readiness and
  existing conditional user authority; these scripts do not switch Caddy.


### Node runtime review packet

Read-only exact artifact assessment is retained at
`.qualification/release-node-runtime-assessment/assessment.json` and its copied
full LICENSE. Version24.19.0 was confirmed by header and clean-environment binary
metadata. Binary SHA256:
`bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`;
LICENSE SHA256:
`148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5`.
The packet indexes44 distributed notice sections and records component versions,
selected permissive alternatives and build/test/CLI-only exclusions. It is an
assessment, not an admission or a claim of an exhaustive binary SBOM.

The binary dynamically uses unchanged host glibc2.39-0ubuntu8.9 and GCC runtime
libraries14.2.0-4ubuntu2~24.04.1; no .so is copied by staging. Their LGPL/GPL+runtime
exception boundaries require an explicit applicable policy/exception determination
in independent review, not a blanket “Node is MIT” statement. ICU's GPL notices
name build-only Autoconf files and supply exceptions; those files are not staged.
Exact release archives now reconcile SQLite public-domain source/version and
retain ICU custom data grants plus V8 subnotices/build exclusions for independent
review; see docs/RELEASE-NODE-RUNTIME.md. Human runtime-link exception remains open.
No new dependency was installed and no approval was invented.

The rendered lifecycle proof now includes a live inert hostUID61002 decoy before
web activation. ExecStartPre must fail with the specific UID-occupied marker and
no webMainPID; only after decoy exit/reset-failed may activation proceed. This
proves the + prestart actually sees host processes despite the service's
ProtectProc settings, instead of trusting systemd semantics without evidence.


Qualification-only staging uses a distinct root admission status
`approved-for-isolated-staging` with nodeRuntimeUse=
`qualification-only-existing-build-runtime`. Its manifest is marked
`qualification-only`, runtimeUse=`isolated-test-only-no-production-admission`,
and nodeRuntimeLicenseReview=null. No production license approval is fabricated.
Production bootstrap opens and hashes the plan's actual root-owned immutable
manifest; both bootstrap and renderer reject qualification-only status for a
production target. The exact human exception packet is
`docs/RELEASE-NODE-RUNTIME.md`; no production execution proceeds without the
recorded exception and masked owner input.


### Executed isolated tooling proof

Separate disposable run `4befa85ebb07441aa13ff1af1e10cdb3` used the frozen client
and hardened image, never main candidate storage. Root evidence directory:
`/var/lib/meos-qualification/4befa85ebb07441aa13ff1af1e10cdb3`.

- Qualification-only immutable manifest:
  `e8f5b1c8949a48d606f0c8d8962d9e9c6ddef633e0c2fe1c27f246cd7b7dbe9a`.
- All27 supplemental notice hashes verified; omission rejected before output.
- Bootstrap ordinary synthetic owner completed; rerun was already-complete/no-reset.
- Lifecycle PASS9: occupiedUID61002 prestart denial; real socket activation with
  UID61002/private network/zero caps; exact shell bytes; private/demo routes denied;
  owner login; backend restart replaced socket inode and web PID while session
  survived; backend stop stopped web; socket request reactivated both; no secrets
  in journals.
- Lifecycle receipt SHA256:
  `996ada08fecc0b504111c5b84af3596446275edfcf68c8bc8a6f4167c87086ec`, mirrored at
  `.qualification/release-lifecycle-proof/lifecycle-proof.json`.
- Proof cleaned up its unique transient units and stopped its disposable backend;
  volume and receipts remain. Public preview, main candidate and production unchanged.

Two concrete failures were fixed and independently reviewed before retry:
Docker's lowercase absent-volume diagnostic is now matched exactly by object kind,
name, exit code and empty result; permission/daemon/wrong-name errors reject.
Renderer now derives socket-only bind from actual Docker Mountpoint after exact
containerID/image, volumeName/driver and identity-label/mount checks; the host's
relocated Docker data-root passed, while source/name/label mismatches reject.
Neither fix relaxes namespace, credential or identity boundaries.

Production remains held for the explicit human Node host-link policy exception
and masked real-owner input; isolated qualification does not satisfy either gate.
