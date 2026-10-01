<!-- SPDX-License-Identifier: Apache-2.0 -->
# Durable machine notification transport

## Scope and authority

Migration `U1790380806__notifications.sql` adds per-native-agent durable consumer
leases, planned event envelopes and opaque batch acknowledgements to the existing
TrailBase SQLite database. `backend/notifications.mjs` uses the existing port,
not a second database or trusted caller-supplied owner. Every transaction reads
the native principal's unexpired/unrevoked `notifications:consume` grant; its
immutable owner binding is the tenancy boundary in this single-owner-per-grant
application. Browser/Calendar principals cannot consume notifications by default.

Guest route POST `/api/meos/v1/notifications` is private to the backend Unix
socket. The normal browser proxy explicitly rejects it. Host-context identity
comes from pinned native authentication, never forwarded `__context` headers.
The separately socket-activated `scripts/serve-agent.mjs` only forwards a native
bearer and body to that fixed route, discarding caller cookie/context/forwarding
headers. It probes the exact configured instance/environment before listening.
This machine endpoint **does not alter browser Cloudflare Access**. Deploying its
own narrowly scoped reverse-proxy path/TLS and socket ACL requires the separate
release gate; source documentation does not establish that the integration is installed.

## API

POST JSON `/api/meos/agent/{poll,ack,status,configure,reconcile}` with bearer auth,
no cookies, no Origin. Server derives agent/owner. `consumer` is a random32hex
installation identity; not an authentication credential. `poll` accepts waitMs
(default25000,max60000) and limit(default50,max100). Returns `items`, `ackToken`,
`retryAfterMs`, `fence`, `retentionGap`. Empty polls check the private guest once
per second and sleep without a busy loop. Disconnect aborts wait/upstream I/O.
HTTP admission is bounded to128 concurrent calls. A separate refresh route
proxies only a native refresh-token JSON request to native auth; receiving a new
token never grants delivery authority by itself.

`ack` takes the opaque64hex token, no caller offsets/IDs. Random256-bit tokens
are stored with exact agent/fence/IDs. In one transaction, duplicate ack succeeds,
only delivered IDs become acked, and no read advances delivery. The live120s
consumer lease fences old workers after expiry/takeover. A client that loses
its lease must poll again; stable event IDs permit downstream deduplication.
Read, lease update, snapshot validity and ack are transactional. Failures roll
back. Old/revoked principals and browser cookie requests are denied before data.

## Planning and retention

Each transaction replans a complete owner-authorized snapshot of explicitly
scheduled tasks/occurrences. It coalesces starts and ends at the same instant,
keeps pre-alert groups separate, includes source kind/id/revision, and reuses
persisted stable IDs for the same complete bucket. Revisions/cancellation,
explicit block archiving/skipping and changed group membership invalidate old
pending buckets. Completion alone does not cancel a scheduled block: it keeps
mandatory boundaries and is included in member metadata. Archiving a routine
template does not cancel already materialized independent scheduled instances.
Routine/instance/agent pre-offset overrides are persisted per subscribing agent.
`[]` remains explicit. Starts and ends are not configurable off.

The notification window is rolling7days; agent planning can independently use
14days. Recurrence expansion/materialization and local DST resolution remain the
existing scheduling/Calendar responsibilities. Pure all-day imports have no
explicit local schedule and remain quiet. A timed block must have explicit
`durationMinutes` to define its end; this transport never invents a duration or
turns all-day events into midnight alarms. `status`/doctor reports
`unsignallableMissingDuration`; resolve these blocks in planning before expecting
paired machine boundaries. Primary Google imports remain
read-only Calendar display, not planner notification records. Google still polls
at60seconds; no watch/webhook is introduced.

First subscription starts at now, not historical backlog. Future buckets are
persisted ahead of time. After downtime, still-valid retained boundaries replay
as delayed; pre-alerts whose start already passed are invalidated. New past
buckets older than the prior planning checkpoint are not introduced. More than
7days downtime or expired unacked rows produces a persisted retention gap,
requiring explicit reconciliation. A `reconcile` command clears that indicator
only after the caller has reconciled current agenda with durable runtime work.
Rows/tokens older than7days are pruned. A5000 scheduled-record snapshot bound
fails closed rather than truncating silently; it is not a claim of unbounded
multi-tenant capacity. Planning is on demand when clients connect, not a second
unowned timer; already planned due rows remain durable while disconnected.

Scheduling decisions and planning interpretation belong in agent operating
skills. This transport does not schedule blocks, rewrite imported calendars,
or invent planning product rules.
Envelope schema can be extended without changing stable-ID handoff semantics.

## Qualification and release boundary

Run backend tests only through the hardened existing launcher and Go tests through
the dedicated launcher. Tests use disposable on-disk SQLite plus synthetic TLS;
never production credentials, data or network. Source tests are not proof that
the updated WASM guest or public route has been deployed. Before deployment:

1. Review the exact source and its Calendar integration. Keep qualification
   evidence bound to that revision outside the source tree.
2. Build exact guest via existing admitted isolated release builder; qualify
   migrations and native bearer/grant against a fresh isolated candidate. The
   release builder now includes the append-only0806 migration and rejects edits
   to previously admitted migrations. For a retained `/data` volume, changing
   image IDs alone cannot replace guest/config/migration files hidden by the
   mount: qualify a separately admitted preserved-volume file/schema transition
   before production. The existing Calendar image-transition helper is not
   asserted sufficient for this new schema.
3. Provision a distinct notification-only principal through the existing
   qualified native-principal process, with protected refresh credentials. The
   concrete `scripts/notification-principal.py` derivative requires its own
   `approved-notification-principal` exact-helper/state admission and is inert
   without that independently reviewed admission.
4. Admit exact machine-host files, Unix socket ACL and reverse-proxy route; TLS
   and refresh traffic must reach only the fixed existing backend origin.
5. Run a real dispatcher durable acceptance/restart proof and test grant
   revocation, cancellation and lease takeover before enabling supervision.
6. Human merge/deployment gates remain separate. A source PR or built archive
   is not evidence of a published binary, installed service or live delivery.

## Optional record updates

`recordUpdates:true` notification preferences opt into committed source-update envelopes. Both `notifications:consume` and `search:index` are required; boundary-only subscriptions remain unchanged. Enabling starts from current outbox high water, so backfill comes from pending search jobs. `record.updated` contains `source:{kind,id,revision,operation}` and `sequence`; event IDs remain 48 hex characters. The durable client forwards the envelope unchanged, with no token in child environment. Configure a host dispatcher to select `meos-on-event-updated`; the client does not install a skill router. Keep timed-boundary handling unchanged.

Durable accepted receipt and ack mean admission, not embedding completion. Missing provider capability is a normal no-op. Pending jobs survive ack/failure for bounded existing-pipeline reconciliation; lease expiry does not execute a worker. Commit writes derived search tables only and cannot produce another update notification. The seven-day retention/gap contract also applies to updates; reconciliation must inspect pending jobs as well as agenda state.
