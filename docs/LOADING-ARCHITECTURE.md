# Loading and explicit routine planning

## About

MeOS has one in-memory data owner per authenticated browser session. The protected
layout establishes that owner with a private, no-store bootstrap response containing
identity, CSRF, preferences and content revisions. Route loaders start shared
Query reads in parallel; TanStack DB collections project those same query entries.
Missing routine instances do not block ready tasks or Calendar events. No private
data is persisted in browser storage. Session changes fence transport responses,
cancel requests and dispose the old registry before another owner can use it.

Resources have a 30-second freshness budget. The session coordinator checks
owner-scoped content revisions every 30 seconds while visible and on focus.
The first observation is a baseline. A later revision invalidates its resource;
a failed refresh remains unacknowledged and is retried on the next check. Calendar
publication timestamps are health metadata, not planner content revisions.

## Using routine planning

Plan routine instances with an agent through the backend or MCP `plan_routines`
operation. Settings and Week do not expose manual planning controls. The operation
creates missing instances from today through 14 days ahead in each routine's
timezone. Existing slots retain identity, completion, edits, skips and snapshot
fields. Flexible and unresolved recurrence requires deliberate scheduling instead.

Planning is explicit. Loading, preloading, navigating, refetching, saving a
routine template, Calendar synchronization and date rollover do not create
instances. Calendar continues to reconcile already-existing scheduled records.

The agent must retain the exact request and idempotency key until the outcome is
known. After an uncertain response, replay that request rather than creating a
replacement. A template conflict rejects the entire transaction; read the updated
routine before making a new planning decision.

Settings places archived resources, archived routines and unscheduled routine
instances after Preferences and Interface. Each list is hidden when empty.
Existing instances remain editable, including their link back to the routine.

## Reference

- `GET /api/meos/v1/bootstrap`: authenticated owner identity, CSRF, preference
  envelope and resource revision baseline. Anonymous and delegated service callers
  cannot read private browser state.
- `GET /api/meos/v1/revisions`: owner-scoped resource outbox high-water marks,
  including deletions, and the current preference revision. No domain writes.
- `plan_routines`: one `occurrences:write` operation for 1–100 routine selections.
  Each selection supplies its expected template revision, inclusive routine-local
  date window and one UUID candidate per date (at most 15). Windows cannot begin
  before the current local day or end beyond 14 days ahead. All selections and
  the command receipt commit atomically. Replaying an identical key and payload
  returns the original summary even after the local day changes; key reuse with
  different input conflicts. The response counts routines, created instances and
  preserved instances; it does not assert Calendar publication.
- `materialize_routine` remains an explicit compatibility operation. The former
  sync-only `calendar_materialize` capability is removed.
- Week selection and selected day use validated URL search state, so route intent
  and preload refer to the requested window. Queries remain the server-data cache;
  loaders do not introduce a second response cache.

The OpenAPI document and generated client are produced from `backend/contract.mjs`.
Use their schemas for exact input and output types.

## Verification

The isolated backend suite exercises batch rollback, replay, preservation, owner
separation, revision changes and pure bootstrap reads. `scripts/browser-loading.mjs`
loads the built SPA with synthetic loopback APIs, an advancing clock and 100 ms
response latency. It checks 0/3/6 routines, HTTP-cached reload, warm intent/navigation,
independent delayed occurrences, revision deduplication, absence of planning
controls and session isolation. These are fixture measurements, not production latency claims.
`scripts/browser-routine-intent.mjs` checks all eight Settings tail-list visibility
combinations, archived editors, instance editing and the routine backlink.
