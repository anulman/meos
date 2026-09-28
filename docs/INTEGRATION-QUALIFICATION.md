# Real-backend integration qualification

Status: qualification in progress, not production deployment. This document
supersedes historical statements that B4 had not started. User conditionally
authorized production cutover after relevant tests/review/recovery readiness;
that authorization does not turn acceptance evidence into production evidence.

## Isolation boundary

`scripts/integration-runner.py` is a trusted host-side launcher, not a test
script run under production credentials. It admits only exact disposable Docker
container/image/run identity and acceptance-labelled volume, readonly root,
network none, UID10001, no capabilities/devices/host mounts/listeners. Each run
copies a fresh source snapshot into a new sandbox and launches an isolated
systemd namespace. Only the disposable server socket (not its database/admin
socket), synthetic credentials, readonly dependencies/browser tools and source
snapshot are visible. Repository builds and tests have an allowlisted empty
credential environment, no Docker control, and no host/internet network path.

Every test run now first proves six groups: dedicated testUID61001/zero caps;
backendUID10001 live harmless process root/open-fd denial; exact environment;
production filesystem/credentials/Docker and acceptance database absence;
immediate internet/gateway/host-loopback denial; positive acceptance socket and
immutable run-identity match. Failure stops before repository tests/builds.
Request interception is not a security boundary. A review found that the earlier
sharedUID10001 runner could bypass pathname masking through same-UID /proc
paths. Qualification was held; distinct UID61001 plus exact socket-only ACL and
live decoy denial replaced that boundary. Earlier five-group evidence is
historical, not sufficient production-isolation signoff.

The production-origin guest is qualified in a physically separate **acceptance**
container/volume. Its compiled `production` application marker is necessary to
exercise the release configuration; runtime labels/storage/network remain
acceptance-only. No acceptance database or credentials will be promoted.

## Evidence epochs

- Historical backend `27b494b`: backend58, planner29/proxy7/MCPorter19, native
  migration6. Those counts do not imply same-screen integration or final artifact
  readiness.
- Initial integrated `ed9c461`: first14 browser checks.
- Current frontend source:26 browser checks pass on both accumulated baseline and
  exact production-origin candidate,60 focused backend/proxy tests,
  date and planner projection checks. Six demo suites and four candidate restart-browser assertions now also pass
  on the current application source. Independent staged-diff review found no B4
  source blocker. A hardened compiler rebuild produced a different WASM hash;
  the new artifact was admitted afresh and separately qualified (see below).
- Authoritative fresh evidence: `.qualification/run-evidence-<mode>.json`
  contains source-file hashes, client-file hashes, run ID, exit result and sandbox
  identity. Browser counts are in corresponding integration evidence. A change
  invalidates exact-tree claims until its affected checks are repeated.

## Defects and regression value

- TanStack internal query metadata leaked into repeated notes writes: strip only
  known internal fields; repeated daily-note edit browser regression.
- Cross-tab authentication and delayed JSON response could retain prior identity:
  shared opaque epoch plus before-dispatch/after-await fences; browser multi-tab,
  queued-event denial, and focused delayed-response tests.
- Pre-session collection request treated as identity change caused logout reload
  loop: unauthenticated early requests now reject without reload; real logout /
  second login browser regression.
- Uncertain outcome creation could duplicate task/membership IDs: retained IDs;
  inject lost responses after both commits and retry through editor.
- Archived project edits discarded payload: distinguish archive transition;
  edit already archived project browser regression.
- Existing occurrence duration silently could not clear: explicitly require
  replacement duration and explain limitation; browser validation assertion.
- Routine templates formerly exposed duplicate weekday/time/duration controls:
  intent-only editor and explicit occurrence scheduling replace those paths.
- Template saves no longer materialize instances. Explicit planning creates
  unscheduled snapshots; browsing and editing templates do not assign a schedule.
- Legacy demo serviceworker could survive mode cutover: unregister before session
  data loads; real worker registration/reload regression.
- Test host static/route adapter: focused denial tests plus browser using actual
  Unix upstream; isolated production-entrypoint socket activation smoke required.
- Native bootstrap path/header errors are qualified only on synthetic candidate;
  short Unix dirfd path and symlink-denial proof, native CSRF denial/success cases
  prevent repeating these deployment errors.

No tests deliberately modify production. Full Calendar OAuth/sync, media capture,
and AI scheduling execution remain out of scope. Settings time-format choice
remains explicitly session-local; timezone and week start persist.

## Final hardened artifact checkpoint

The fresh hardened image is `sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d`,
with guest `sha256:c644fca6ea9b0f6bcb73b32a9b95ee809ac4ace785ced152cf065ca5ffd8fb2b`.
Acceptance run `65e110e797dc4f22969f792af1efd8f8` passed native29,
protected-proxy7, actual MCPorter19, browser26, production-entrypoint4 and
restart-persistence4. Every repository test/build launch first passed six
isolation groups. Hardened guest compilation also used a distinct, unoccupied
build UID61003 with live backend/web-UID process denial proofs.

The combined release run builds once and tests the actual production entrypoint
and browser against **that same output**. Its frozen client digest is
`2618f9708b12ef1b6bbe05c101f50dcc3e70cc2583be1385e4a09f6d836b99a4`;
receipt `.qualification/run-evidence-candidate-release.json` SHA256 is
`de975ee9c829238d48d6163842c13bcee1ecb5ee0b36e1975e8983655bb716fc`.
The selected sandbox is `.qualification/integration-mp_n57o_`. Deployment must
copy this qualified output, not rebuild it. Restart qualification rebuilt a
separate client and does not replace this selection (prerendered shell timestamps
can differ across builds).

The legacy shared-UID backend launcher now refuses execution. Additional native,
proxy and MCP modes use the trusted distinct-UID/socket-only integration launcher.
A browser navigation timing error was fixed by awaiting the Week view before
selecting the current week; this was harness synchronization, not a product defect.
Failed release runs cannot retain a successful combined proof receipt.

Production lifecycle qualification subsequently passed **9 checks** on separate
synthetic run `4befa85ebb07441aa13ff1af1e10cdb3`: host-visible occupied webUID
prestart denial; real socket activation/private network/zero caps; exact shell;
private/demo routes denied; ordinary-owner login; backend restart with fresh
socket/web PID and session persistence; stop propagation; socket reactivation;
and no credential output. Independent review verified all50 staged manifest
files, including27 supplemental Node notices, all reviewed helper hashes, and
cleanup (proof units absent/inactive, synthetic container stopped, volume kept).
Evidence is under `/var/lib/meos-qualification/4befa85ebb07441aa13ff1af1e10cdb3/`.

Qualification caught and fixed two actual deployment-path failures: exact Docker
missing-volume diagnostic case and a hardcoded Docker data-root path. Regression
proofs admit exact absent objects/relocated data-root while rejecting daemon,
permission, wrong-object, source/name/label mismatch errors. Missing supplemental
runtime notices are rejected before stage output; all27 staged hashes are checked.
The full lifecycle is the meaningful regression for unit socket/restart behavior.

The exact Node bundled/custom grants and preserved notices passed independent
review. Explicit host glibc/GCC dynamic-link policy exception and secure
ordinary-owner input remain production-only gates; subsequent controlled cutover
must revalidate target identity and rollback readiness. No qualification tests
will run against production. Public routing and preview were not changed by this
integration lane; independent review's live cleanup proof is scoped to acceptance,
not a universal audit of production resources.
