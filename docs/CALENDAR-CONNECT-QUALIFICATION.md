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

## Remaining objective, not implied by this candidate

Existing planner tasks/occurrences are not automatically exported into managed
Google events, and Google managed changes are not yet applied to those existing
domain entities. Calendar events currently have a separate managed editing
surface. The sidecar deliberately has no planner database/socket/password; a
scoped durable planner bridge is still required before claiming full planner
bidirectional integration. Location and free-text duration intent for existing
planner entities are also outstanding. Agent notification runtime follows that
Calendar completion serially, with a rolling7-day future horizon.

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
   Do not label existing task/occurrence synchronization complete until its bridge
   has independent and deployed-path evidence.

Sources: https://developers.google.com/workspace/calendar/api/guides/sync and
https://developers.google.com/workspace/calendar/api/v3/reference/events/update.
