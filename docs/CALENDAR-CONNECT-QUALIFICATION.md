# Calendar polling candidate — not deployed

Telegram41897 replaces Google watch notifications with 60-second incremental
polling (±5 seconds jitter; exponential failure backoff capped near 15 minutes).
There is no notification route, Access exception, watch registration, renewal,
channel stop, or alternate Google update transport. Agent notification long
polling is unrelated and preserved.

## Implemented

- Browser OAuth callback `/api/calendar/google/callback`, private durable tokens,
  one-use session binding, refresh fencing and protected Unix RPC.
- App-created MeOS calendar; primary import is read-only. Both collections use
  persisted incremental tokens. Complete pages and token commit atomically;
  failed pages retain the preceding snapshot. HTTP410 performs a full resync.
- Durable poll ownership prevents overlap across processes; every page and commit
  checks lease and connection generation. Disconnect fences in-flight commits.
- Recurrence instances for current/next-week planner views use Google's expansion
  endpoint in a moving -32/+64-day window. Full collection sync remains unbounded
  by that window. Cancelled events do not render.
- Calendar events appear in the planner. Managed event create/edit/delete uses a
  durable outbox, generated insert IDs, conditional ETags and baseline reads.
  Uncertain writes reconcile before retry; remote change/cancellation retains a
  local conflict draft instead of overwriting or resurrecting the remote event.
- UI rereads Calendar every15 seconds; provider polling remains every60 seconds.
- Renderer accepts a configurable canonical HTTPS origin and install-specific
  credentials from Varlock's environment, never a shell-profile fallback.
  Copy `deployment/calendar.env.schema` to the private install directory as
  `.env.schema`; provision the three named values privately; invoke the reviewed
  renderer under `varlock run --path <private-install-directory>/ -- python3 ...`.
  No installation shares Aidan's OAuth client implicitly. Callback registration
  must exactly match that installation's origin plus callback path.

## Qualification

Use `sudo python3 scripts/backend-test-runner.py` for credential-free, no-network
backend tests. `sudo python3 scripts/integration-runner.py candidate-release`
asserts the disposable acceptance identity/network/storage before license gate,
TypeScript, build and real browser entrypoint checks. Synthetic Calendar provider
only; no test contacts Google. `calendar-lifecycle-proof.py` renders temporary
isolated units and proves UID/capability drop and SQLite restart persistence.
Receipts in `.qualification/` are exact-source artifacts, not deployment claims.

## Existing planner bridge candidate

The continuation adds dedicated native-agent `sync:read` / `sync:write` operations
for owner-scoped inventory, committed outbox, current entity/tombstone, bounded
routine materialization, and Calendar-only revision-checked apply. Browser APIs
remain forbidden to this principal. Sidecar access uses a protected Unix socket
and a separate agent credential, never the owner's browser password.

Existing scheduled tasks and independent routine instances export their planned
duration, location and notes. Unresolved duration is a visible conflict, never a
fabricated end time. Google changes update the existing entity through CAS and win concurrent edits.
The bridge retains displaced local intent before applying Google. A local CAS
race retries on a later poll; unsupported Google shapes and deleted, archived or
skipped local entities block export rather than overwrite the Google winner. Local tombstones conditionally
cancel Google; Google cancellation unschedules rather than destroys the task.
Stable IDs and persisted baselines reconcile uncertain writes. Rich notes remain
unchanged if their exported text has not changed. Duration intent and actual
observed duration are retained independently. Fixed routine instances materialize
through the established14-day planner horizon without an open browser; future
agent notifications remain separately bounded to7 days.

Planner display rereads on Calendar receipts and invalidates affected task and
occurrence collections; mounted editors retain their old revision and draft for
normal conflict detection. Full historical snapshots are chunked behind atomic
SQLite commits, avoiding a single JSON-record size ceiling.

## Source qualification checkpoint

The source candidate passed 167 isolated backend tests, license qualification,
TypeScript/build checks, and 44 mounted browser checks (8 Calendar, 6 Access,
4 actual entrypoint and 26 baseline planner checks). Historical source and
artifact receipts remain in `.qualification/`; a final handoff must bind its
current commit to fresh affected-check evidence rather than reuse these counts
as an exact-tree claim.

The admitted Calendar candidate uses image
`sha256:6f7651d44cae5a840a41508305f30fcf12eed869116734eafe0b7cfa6f051e9c`.
The isolated retained-depot proof verified the mounted guest, not only the image:
`649ccf1b734a21257c70953cc47fb65b22dadf17a751c29e1e67ee8a449f9bfe`.
All eight runtime files were checked after replacement; owner/domain rows were
preserved, and the old runtime and cold database copy were retained. A separate
native proof exercised sync-only export, Google-wins CAS import, token refresh
and no provider echo using one disposable task, then deleted that task.
Independent closure of those deployment-tool proofs remains a separate gate.

Use `sudo python3 scripts/integration-runner.py calendar-release` for the admitted
Calendar fixture. The older `candidate-release` fixture does not establish the
new guest's planner bridge. These launchers admit only disposable, no-network
acceptance containers; no qualification run uses production credentials.

Calendar is not live. Narrow protected OAuth configuration and sync-only principal
preparation have occurred; backend services have not been switched. Exact inert
staging, manifest-bound runtime rendering, retained-depot upgrade, and service
activation require their separate admissions. Real Google consent, import, writes
and polling remain unverified. Source review readiness does not authorize merge
or production activation.

## Review and preserved-data staging

1. Independently review the exact candidate; rerun isolated candidate-release
   checks after accepted changes. Freeze the source digest and git commit.
2. Use existing `production-stage.py` admission flow; preserve the current release,
   planner database, owner policy, rollback artifact and all volumes.
3. Render a new private Calendar bundle using the reviewed release, existing
   owner policy, and install-owned Varlock configuration. Do not install from an
   unreviewed or qualification-only manifest.
4. Install only the qualified Calendar sidecar/socket and reviewed web closure;
   retain existing Access enforcement. No Google notification ingress is needed.
5. Browser Connect → Google consent → Settings shows actual completed pull state;
   verify primary read-only events and managed create/update/cancel roundtrip.
   Do not label synchronization complete until the bridge has independent and
   deployed-path evidence.

Sources: https://developers.google.com/workspace/calendar/api/guides/sync and
https://developers.google.com/workspace/calendar/api/v3/reference/events/update.
