# Application contract

Read this guide when changing planning operations or integrating an agent. It
explains the invariants shared by browser HTTP and MCP, not installation status
or an exhaustive API reference. Start with the [planning model](../README.md#planning-model).
Use [OpenAPI](openapi.json) for browser schemas and installed MCP discovery for
the tools available to a particular grant.

## One operation registry

[`backend/contract.mjs`](../backend/contract.mjs) defines operation metadata and
JSON Schemas. Runtime validation, generated TypeScript, OpenAPI, and MCP discovery
use that registry. Domain commands additionally validate real dates, timezone
transitions, owner-bound references, document structure, revisions, and limits.
Schema validation alone does not establish permission or transactional safety.

Browser operation requests use `POST /api/meos/v1/operations/{name}` with the
operation input, not the legacy resource route's `{value, expectedRevision}`
wrapper. The generated client uses the session-fenced browser transport. Requests
must satisfy the session, origin, and CSRF checks; a body cannot select its owner.

For an uncertain mutation, retry the identical payload with the same
`idempotencyKey`. A different operation or payload with that key conflicts.
Resolve revision conflicts against a fresh record; do not silently overwrite it.
See [changing a contract](CONTRIBUTING.md#change-a-contract) for generation and checks.

## Intent, instances, and schedules

Routine creation saves a template, not occurrences or Calendar events.
`recurrenceIntent`, `durationIntent`, and `preferredTime` express intent.
Flexible or unresolved language does not authorize invented dates or clock times.

Explicit `plan_routines` and `materialize_routine` operations create missing fixed
recurrence slots within the routine-local horizon: today through at most 14 days
ahead. New instances are unscheduled and have no concrete duration. Existing
slots are preserved. Planning agents can then propose explicit assignments;
browsing records does not schedule them.

An occurrence's `date` is its immutable original recurrence slot. Its ID survives
moving or completing the instance. Title, notes, and completion belong to the
snapshot; template edits do not rewrite it. Use the current `schedule` or
`list_agenda` for agenda placement, not the original recurrence date.

A missing task schedule means unscheduled, not midnight. A schedule contains
`date`, `time` (`HH:mm`), and an IANA `timezone`. Nonexistent local times are
rejected; ambiguous times require a matching `offsetMinutes`. Display timezone
changes do not rewrite the source schedule. The WASI guest's generated
[timezone rules](../backend/timezone-rules.mjs) cover 2020–2040 and fail closed
outside that range. Regenerate and qualify those rules when updating tzdata.

`preview_schedule` validates assignments without writing. `apply_schedule`
checks revisions and writes assignments, outbox entries, and the retry receipt
in one transaction. It is not an AI optimizer. Calendar synchronization is a
separate private-worker operation; a local commit does not prove provider delivery.
Each change supplies `kind`, `id`, `expectedRevision`, and `schedule` (or `null`
to unschedule). Optional `durationMinutes` sets the planned interval length to an
integer from 1 through 1440; omission preserves its current value. This changes
neither the original estimate in `durationIntent` nor `actualDurationMinutes`.
The preview returns the proposed start and duration together, without changing
revisions or emitting sync work. It validates records, not overlaps: callers must
compare proposed intervals with the fresh agenda and Calendar context. On apply,
one stale or invalid change rolls back the entire batch. Routine changes affect
only the selected occurrence, not its original slot, template, or siblings.
See [Calendar cache](calendar-cache.md) for publication and freshness boundaries.

## Separate browser and agent authentication

The native MCP endpoint is `/api/meos/v1/mcp`. It requires native bearer
authentication and an active owner-bound grant; browser cookies are rejected.
Tool discovery filters the shared registry by the grant's scopes. Calls invoke
the same command layer as browser operations, without exposing SQL or arbitrary
network requests. Never put native credentials in browser configuration.

The browser proxy denies the native MCP and bridge paths. A machine integration
needs its admitted transport and private credential boundary, not a browser-route
bypass. For connection setup, use the [host MCP guide](../public/skills/meos-bootstrap/host-mcp.md).
For search and durable notifications, read [search](search.md) and
[notification transport](agent-notifications/ARCHITECTURE.md).
