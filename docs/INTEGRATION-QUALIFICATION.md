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
  that new candidate needs fresh admission and exact-image checks before release.
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
- Weekday edits retained overriding natural-language recurrence: clear intent
  when explicitly editing weekdays; browser rule replacement assertion.
- Initial occurrence load could finish an old routine snapshot after a new routine
  save: explicitly cancel before invalidation; deterministic held-response browser
  regression proves new instances appear before release and survive late completion.
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
