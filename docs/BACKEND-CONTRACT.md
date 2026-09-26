# MeOS application contract (pre-integration)

`backend/contract.mjs` owns the JSON Schemas and domain-operation metadata. Runtime
validation, OpenAPI 3.1, generated TypeScript, and MCP discovery use these schemas.
Semantic checks (actual dates, timezone transitions, tenant references, rich-text
structure, revisions and generation limits) are additionally enforced by domain
commands. JSON Schema is not a replacement for these checks.

- `docs/openapi.json`: generated browser application API, not SQL/Record APIs.
- `src/lib/backend/generated.ts`: generated types and `ApplicationClient.call`.
- `node scripts/generate-contract.mjs --check`: deterministic drift gate in CI.
- POST `/api/meos/v1/operations/{name}`: JSON operation input, **not** the legacy
  `{value, expectedRevision}` wrapper. Existing resource/repository routes remain.
- Browser operations use the authenticated session owner, same Origin and CSRF.
  Generated client wraps the existing JsonTransport, preserving logout fencing, CSRF, response validation and redirect rejection; it does not retry mutations automatically. Keep a command's
  `idempotencyKey` stable across an uncertain-result retry; use a new key when
  changing its payload. Reuse with a different operation or payload returns409.

## Tasks, templates, and occurrences

Tasks may omit `schedule`; that means unscheduled, not midnight or “Anytime”.
`list_agenda({date, timezone})` contains only actual scheduled instants on that
local day. It excludes unscheduled, skipped and archived values. Completed items
remain available for the daily UI's collapsible completed section.

`Occurrence.date` is the **immutable original recurrence slot**, not the current
agenda date. `id` remains stable when moved. `schedule` is independently editable
and may be removed with `move_occurrence({schedule:null,...})`. Occurrence title,
notes, duration, completion and skipped state are snapshots; template edits never
rewrite existing occurrences. `templateRevision` records the snapshot source.
`edited` is set by move/completion/scheduler operations; materialization preserves
**every existing slot**, edited or not. Prefer these operations to legacy full
replacement routes, which also retain immutable original identity/slot checks.

Migration005 preserves existing IDs, original dates and completion history, and
snapshots template content. Legacy completion-only rows stay unscheduled: SQL
cannot safely infer an instant when an old local time lies in a DST gap/fold.
They remain history; schedule them explicitly if they should enter an agenda.
No old migration is edited.

`Schedule` is `{date,time,timezone,offsetMinutes?}`. Time must be `HH:mm`; the IANA
zone determines an instant. A nonexistent local time is rejected. An ambiguous
fall-back local time requires an explicit matching `offsetMinutes`; no fold
selection is guessed. `scheduledAt` in agenda entries is a derived UTC instant,
not an alternative writable source of truth. Query with the viewer's timezone.

The WASI runtime has no Intl. Generated factual ICU timezone transitions supply
2020–2040 rules and fail closed outside that range. Regenerate
`backend/timezone-rules.mjs` with `scripts/generate-timezone-rules.mjs` when tzdata
changes; review the diff and run DST/runtime qualification. Identifiers alone are
not timezone rules, and UTC must never replace an unsupported zone silently.

## Preferences and recurrence language

Both tasks and routines accept `preferredTime:{text}`. The server retains the
original text and recomputes the interpretation, ignoring forged status labels:

- “in the morning” → validated daypart preference; no invented clock boundary.
- “before lunch” → context_required relative preference; no assumed lunch time.
- “09:30” → validated clock preference; still not an assigned task schedule.
- Other text → ambiguous/unresolved for AI interpretation or clarification.

`recurrenceIntent:{text,anchorDate}` distinguishes fixed weekday/interval patterns
from flexible weekly frequency/preferred weekdays. Supported examples include
“every day”, “every weekday”, “every other monday”, and “three times a week,
preferably on weekdays”. Preserve a stable explicit anchor when changing an
interval. Unknown language remains unresolved. `weekdays` is retained for legacy
routines; when recurrenceIntent exists, its validated interpretation governs
expansion. Flexible targets are sent to scheduling, not expanded arbitrarily.

`materialize_routine` expands fixed recurrence from the actual current day in the
routine's timezone to a requested `through` date, at most **today+14** (inclusive,
15 possible dates counting today). It takes an `ids` map from original date to
fresh UUID; the database natural-key constraint prevents duplicate slots. No
caller-supplied “today”/clock is accepted. Existing slots are returned unchanged.
DST gap/fold slots materialize **unscheduled**, awaiting explicit resolution.
Flexible/unresolved/archived routines produce no automatic occurrences.

The same horizon checks apply to generic occurrence creation, natural-key saves,
updates and schedule commands; changing an occurrence's timezone cannot bypass
the template's local-day limit. Calendar proactive expansion must use this
operation—never create its own unbounded repeat series. Google sync itself is
not implemented in this pass.

`preview_schedule` validates explicit assignments without writing. `apply_schedule`
checks all referenced record revisions and applies all assignments plus outbox
and retry receipt in **one transaction**, or rolls everything back. It does not
claim to be an AI optimizer: an agent uses preferences/intent to propose actual
assignments, then these operations enforce the durable contract.

## Sync foundation

Migration005 adds transactional outbox triggers for planner entities, including
project-archive-triggered task changes. Sync consumers can use the monotonic
sequence and stable entity/revision tuple. There is no active sync worker yet. A first Calendar connection must enumerate
existing records for initial sync, then consume subsequent outbox entries.
`bind_external_event` binds provider/calendar/event IDs to stable task/occurrence
IDs, rejects reassignment, and retains a remote revision for future loop/conflict
handling. Updating a different remote revision requires matching
`expectedRemoteRevision`, as well as the local entity revision. Deleting a task creates a tombstone and deletion outbox entry and marks
its mappings deleted. Its ID cannot be resurrected by a later create. Occurrences
are skipped instead of deleted, preserving their original slot. Outbox draining,
provider conflict policy, OAuth and Calendar network calls remain deferred.

## MCP and scoped credentials

The compiled guest exposes a stateless **Streamable HTTP MCP** endpoint at
`/api/meos/v1/mcp` (protocol2025-11-25; also2025-06-18/2025-03-26). It supports
initialize, initialized notification, ping, tools/list and tools/call; optional
SSE GET and DELETE return405. Input/output schemas are inlined from the same
contract. Calls invoke the same commands as browser operations. There is no SQL,
arbitrary fetch or raw database tool.

A private operator provisions a separate ordinary native-auth identity and one
`_meos_agent_grants` row: agent ID, immutable owner ID, explicit scope list, expiry
and revoked flag. Only native authenticated host context is trusted; a body
owner ID or a claimed bearer string cannot establish identity. Expired/revoked
or unbound grants fail closed, and tool discovery is scope-filtered. Browser
cookies cannot authenticate MCP, and agent identities cannot use browser
planner APIs. Production credential provisioning remains a release/setup gate;
the acceptance launcher creates synthetic credentials only.

Scopes: `agenda:read`, `tasks:write`, `routines:write`, `occurrences:write`,
`schedule:read`, `schedule:write`, `sync:write`. Assign only the scopes needed.
Pre-provisioned native tokens are used; this is **not** an implemented MCP OAuth
authorization server. Refresh/rotation belongs in the private operator client;
never put native credentials into browser bundles or public config.

The browser protected proxy deliberately denies `/mcp` and `/bridge`. A future
production gateway needs a separately reviewed MCP-only route preserving native
Bearer auth, Origin and MCP negotiation headers, never the browser cookie route.
MCPorter can use its normal HTTP server definition with a privately provided
Authorization header; no separate MCPorter API exists.

Official references checked during implementation:
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://github.com/openclaw/mcporter

## Verification

Run `sudo python3 scripts/backend-test-runner.py`: isolated network, no host
credentials, no production database path, unprivileged test UID and zero effective
capabilities. Tests use memory/temp SQLite only and include a real two-writer race.
The trusted live launcher verifies exact disposable container/volume identity
before passing only its Unix socket and synthetic credentials to tests:

```
sudo python3 scripts/backend-live-runner.py
sudo python3 scripts/backend-live-runner.py --proxy
sudo python3 scripts/backend-live-runner.py --mcp
sudo python3 scripts/backend-migration-runner.py
```

The MCP lane uses actual MCPorter0.14.1 against the actual compiled guest through a
fixed loopback-to-disposable-UDS relay inside the isolated namespace. Its exact
40 MIT/ISC package archives, notices and lock are retained privately; no MCPorter
package enters the application image. Final evidence identifies the exact image,
guest hash, migration hashes and source hashes; earlier checkpoints are not
represented as fresh exact-tree evidence.
