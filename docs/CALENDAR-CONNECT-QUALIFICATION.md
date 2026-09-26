# Calendar connection increment — qualification, not deployment

This increment adds the production-host Calendar route seam, Settings connection
card, cookie-bound OAuth callback, private SQLite service, fixed-target Google
broker, private Unix RPC, and separately sandboxed sidecar templates.

The frozen OAuth callback is `/api/calendar/google/callback`; Google's independent
notification endpoint is `/api/calendar/google/notifications`. Callback requests
remain Access-gated. Only the exact notification POST bypasses Access, and it
must pass channel/token/resource validation before durable acknowledgement.

## Evidence

- Trusted no-network backend test launcher: all Calendar and existing tests.
- `.qualification/run-evidence-candidate-release.json`: built client, 26 existing
  browser checks, 6 Access checks, 4 production-entrypoint checks.
- `.qualification/candidate-calendar-browser-evidence.json`: 4 additional checks
  exercise the real entrypoint, Settings, RPC, durable OAuth service, callback,
  reload/disconnect and rejected unbound callback with a synthetic Google provider.
- `.qualification/calendar-isolation-proof.json`: systemd allow/default-deny
  enforcement, with an independently reachable synthetic denied-peer positive
  control and permitted peer. No production endpoint or credential used.
- `.qualification/calendar-lifecycle-proof.json`: actual rendered temporary
  sidecar units, UID 61004/capability drop, SQLite persistence across restart,
  owner rejection, disconnect and journal credential-denial check.

## Qualification findings resolved

The VPS cannot resolve unregistered numeric identities in systemd `User` or
`SocketUser`. Service privilege drop uses the established trusted `setpriv`
pattern; the root-owned socket is chowned to the reserved web UID after creation.
The service exposes only its private state at `/data`, since binding a child below
an inaccessible `/var/lib` still denies traversal. These were found using
synthetic lifecycle runs, before any production change.

Browser tests must wait for the specific application response or rendered state,
not global network idleness. The routine-race test now awaits the occurrences
response following release of its deliberately blocked request; its bounded
instance-count and persistence assertions are preserved.

## Remaining release boundary

Nothing here is installed or deployed. Preserve the existing production database,
volume, Access policy, rollback release and owner. Independently review the exact
source and staging helper changes, admit the release, render runtime config from
the protected dedicated-client handoff without printing credentials, and qualify
its exact staged closure before installing the sidecar/web socket binding.

`calendar-render.py` only renders a new private bundle; it never installs units.
Its production hostname reflects the existing approved deployment; configurable
public/Tailscale origins and Varlock belong to the authorized serial followup.

## Not yet implemented / not implied by connection success

Full primary collection ingestion and visible-window expansion; durable
incremental page/sync-token consumption and acknowledgement; managed calendar
outbox/baseline reads, bidirectional merge/conflicts/deletion semantics; automatic
planner UI updates; full sync deployed-path qualification. Watch signals are
queued durably but no production pull consumer exists yet. `subscriptionsActive`
means both watch registrations exist, not that import or bidirectional sync has
completed. Real Google client/consent and public webhook reachability remain
unverified until the qualified deployed connection flow is exercised.

The standalone agent-notification core remains separate and undeployed. Integrate
INSTALL-AGENT-NOTIFICATIONS-41878 only after Calendar lands, preserving complete
recipient/boundary-bucket rebuild on changed events.
