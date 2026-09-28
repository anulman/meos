# Contributing to MeOS

Read this guide after the [README](../README.md) when you need to change the
codebase. It is for human contributors and coding agents. You will learn how to
trace a request, identify authoritative files, and select checks. It does not
provision a production installation or grant release authority.

## Trace one change

For an occurrence edit, begin in
[`OccurrenceEditor.tsx`](../src/components/OccurrenceEditor.tsx). Follow the
operation through [`ui-repository.ts`](../src/lib/backend/ui-repository.ts), the
generated application client, and
[`transport.ts`](../src/lib/backend/transport.ts). The transport handles the
browser session boundary; the server checks identity, CSRF, and revisions.

On the backend, [`http-handler.mjs`](../backend/http-handler.mjs) dispatches
application operations to [`commands.mjs`](../backend/commands.mjs). MCP enters
through [`mcp.mjs`](../backend/mcp.mjs) and invokes the same commands under its
owner-bound grant. [`domain.mjs`](../backend/domain.mjs) and
[`scheduling.mjs`](../backend/scheduling.mjs) enforce semantics beyond the JSON
Schema. [`trailbase-port.mjs`](../backend/trailbase-port.mjs) supplies the native
transaction boundary.

If the occurrence changed elsewhere, the expected revision conflicts rather
than overwriting newer data. The editor retains its draft so the reader can
compare against a fresh record. If a schedule change succeeds, the local
transaction is complete; Calendar synchronization is still a separate step.

## Choose the change path

| Change | Inspect first | Preserve |
| --- | --- | --- |
| Today, Week, or Settings presentation | `src/routes/`, `src/components/`, `src/styles.css` | Route intent, accessibility, mobile behavior, independent loading regions |
| Resource loading or account switching | `src/lib/loading.ts`, `store.ts`, `backend/session.ts` under `src/lib/` | One owner-scoped registry, response fencing, no private browser persistence |
| Domain field or application operation | `backend/contract.mjs`, `domain.mjs`, `commands.mjs` | Owner-derived identity, semantic validation, revisions, transactional receipts |
| Recurrence or schedules | `backend/scheduling.mjs`, `src/lib/dates.ts`, `src/components/RoutinePlanning.tsx` | Original occurrence slot, explicit planning, DST handling, bounded horizon |
| Calendar context or synchronization | `backend/calendar-service.mjs`, `calendar-planner.mjs`, `calendar-cache.mjs` | Primary read-only context, Google-wins reconciliation, cache freshness and generation fences |
| Search | `backend/search.mjs`, `embedding-input.mjs`, `docs/search.md` | Owner isolation, canonical text identity, stale-result rejection, keyword fallback |
| Agent delivery | `backend/notifications.mjs`, `clients/meos-agent/`, `clients/meos-host/` | Durable handoff before ack, duplicate handling, unknown-effect reconciliation |
| Persistence | `backend/migrations/`, command code, migration tests | Existing identity/history, upgrade and rollback evidence |

Paths in the table are relative to the repository root unless stated otherwise.
Start with the smallest change that meets the requirement. A UI concern does not
necessarily need a new persisted field; a new operation does need a complete
contract and authorization path.

## Change a contract

The canonical schemas and operation metadata live in
[`backend/contract.mjs`](../backend/contract.mjs). Generated outputs are
[`docs/openapi.json`](openapi.json) and
[`src/lib/backend/generated.ts`](../src/lib/backend/generated.ts). Do not repair
those outputs by hand.

1. Change the schema and operation metadata.
2. Implement semantic validation and command behavior. JSON Schema alone cannot
   enforce ownership, valid timezone instants, or a record's current revision.
3. Update the browser types/adapters and demo behavior where the change applies.
   `src/lib/contracts.ts` is authored UI code, not the generated contract.
4. Regenerate and check the outputs in a credential-free development environment:

   ```sh
   pnpm contract:generate
   pnpm contract:check
   ```

5. Add focused coverage for behavior and failure cases, then review the generated
   diff with the command implementation. New persistent state needs a new
   migration; do not rewrite an already-applied migration.

For example, extending a routine template must not rewrite existing occurrence
snapshots. Changing a scheduling operation must retain all-or-nothing assignment
and receipt writes. Reusing a retry key with a different payload must remain a
conflict, not become an implicit second operation.

## Choose verification

Use a disposable development or CI environment without production credentials,
production data, or production database networking. A demo browser test is not
proof of native persistence; a source test is not proof of deployment.

| Scope | Check or fixture | What it establishes |
| --- | --- | --- |
| Generated contract | `pnpm contract:check` | OpenAPI and generated client match the canonical contract |
| Frontend | `pnpm licenses`, `pnpm typecheck`, `pnpm build` | License gate, type consistency, bundled SPA build |
| Dates and clock | `node scripts/test-dates.mjs`, `node scripts/test-planner-clock.mjs`, `node scripts/test-timezones.mjs` | Focused date, clock, and timezone behavior |
| Demo UI | `pnpm test:browser`; `scripts/browser-b.mjs` through `browser-d.mjs` | Baseline navigation/reseed and resource/planning/preferences journeys |
| Real-mode UI fixtures | `scripts/browser-loading.mjs`, `browser-calendar-startup.mjs`, `browser-routine-intent.mjs` | Synthetic API loading, Calendar startup, and routine/commute interactions |
| Backend | `scripts/backend-test-runner.py` | Isolated command, contract, ownership, scheduling, and related tests |
| Native integration | `scripts/backend-live-runner.py`, `backend-migration-runner.py`, `integration-runner.py` | Disposable native runtime and migration/integration paths with admitted prerequisites |
| Agent integration | `scripts/agent-client-test-runner.py`, `host-test-runner.py` | Native-client and host-dispatch behavior under isolation |

The `scripts/*-runner.py` launchers are operator-oriented Linux tooling. Inspect
their prerequisites before use: some pin a host Node path, require root/systemd,
reserve a test UID, or expect previously admitted artifacts under
`.qualification/`. They are not portable fresh-clone commands. Do not bypass
isolation or substitute a production socket when an artifact is missing.

The [default workflow](../.github/workflows/check.yml) is the executable baseline
for hosted checks. Agent-client and backup workflows are path-filtered. Use the
workflow at your revision for exact test selection; a green PR does not imply
that every browser, native, or production lane ran.

For browser scripts, inspect their URL variables and fixture requirements before
running them. Some launch synthetic APIs; others expect an already-built app and
the loopback static server described in the [README](../README.md#run-the-local-demo).
Never point acceptance scripts at a real user's planner.

### Diagnose the boundary that failed

| Symptom | Inspect | Next action |
| --- | --- | --- |
| Edits disappear on reload | `public/config.js` and the active runtime config | If `demo: true`, this is expected; use the native installation path for persistence |
| UI cannot reach the API | Browser network response and session bootstrap | Check that real mode has the protected API; do not disable origin/CSRF checks |
| An edit conflicts | Current record revision and preserved draft | Reread and compare before submitting a new decision |
| A mutation response is uncertain | Original payload and idempotency key | Retry the identical operation, not a newly invented request |
| A routine has no instances | Recurrence interpretation and explicit planning result | Plan fixed routines within the horizon; deliberately place flexible ones |
| Calendar context is unavailable or stale | Cache metadata and private worker status | Recover synchronization; do not interpret missing context as free time |
| Search returns keyword results only | `semantic` status and pending jobs | Use lexical results or run an authorized producer; pending does not mean a worker is running |
| Agent transport acknowledged work but nothing happened | Durable dispatcher/run state and delivery evidence | Distinguish admission from completion; reconcile unknown effects before retrying |

## Read documents in context

Use this precedence when repository documents disagree:

1. **Current executable source and generated contracts** establish implemented
   behavior. Check the actual branch/revision before describing a feature.
2. **Topic guides** explain the model: [loading](LOADING-ARCHITECTURE.md),
   [Calendar cache](calendar-cache.md), and [search](search.md).
3. **Operating skills** define agent procedures. Start at the
   [shared contract](../public/skills/contract.md); a procedure is not evidence
   that its optional integration is installed.
4. **Handoffs, qualification packets, and release plans** describe a checkpoint
   and its evidence. For example, the historical
   [backend contract narrative](BACKEND-CONTRACT.md) retains pre-integration
   statements about deferred Calendar sync. Read its domain discussion alongside
   current source; do not treat that historical status as today's capability.

Use [OpenAPI](openapi.json) for the browser operation schemas and MCP tool
discovery for the installed agent surface. Both originate in the same operation
registry, but authentication and transport are different. Deployment status
requires a live verification record outside this documentation.

## Finish a change

Review the exact diff against the intended base. Record the checks that ran,
what they prove, and any unverified boundary. Keep source qualification, PR
publication, merge, and deployment distinct. Documentation or green tests alone
do not authorize the latter operations.

For a documentation-only change, verify source claims, relative links, code
listings, and diagrams. Do not rebuild or mutate a live service to validate prose.
For application changes, choose focused checks from the map above and expand
coverage when the affected boundary requires it.
