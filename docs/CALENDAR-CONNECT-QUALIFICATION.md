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
fabricated end time. Google-only changes update the existing entity through CAS;
local/remote concurrent edits remain conflicts. Local tombstones conditionally
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

150 isolated backend tests and isolated TypeScript/license/build checks pass.
Actual new-WASM bridge/browser qualification is pending independent admission of
`.qualification/release-1790450631810096659/candidate.json` into the fixed fresh
`.qualification/release-calendar-acceptance/` namespace. Do not claim live bridge
readiness from source/unit tests alone. `scripts/calendar-acceptance.py` is a
synthetic-only launcher; it creates a separate sync-scoped synthetic principal.

Varlock schema/launch documentation is provided, but the Varlock binary is not
installed or qualified in this candidate. No dependency was silently introduced.
Real Google client/consent, live import, writes and polling remain unverified.

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
