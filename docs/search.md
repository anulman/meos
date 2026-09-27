# Search planning records

Search retrieves tasks, projects, routine templates, routine occurrences and day/week notes. It does not retrieve external Calendar events or replace date-exact agenda reads. The shared operation registry generates the application client, OpenAPI and MCP tool schemas.

## Use search

Call `search` through `ApplicationClient.call` or MCP `tools/call`. MCP requires the owner-bound `search:read` scope; `sync:read` does not grant search. This scope deliberately includes period-note excerpts. Provision it only for agents permitted to read all five indexed record kinds.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"travel preparation","mode":"hybrid","kinds":["tasks","periodNotes"],"limit":20}}}
```

Search is read-only with respect to planning records; hybrid calls can populate an owner-isolated derived query cache. `query` is plain text, not SQL or FTS syntax. The query must contain 1–500 characters. `kinds` defaults to all five kinds; `includeArchived` defaults to false; `limit` defaults to 20 and permits 1–50. Keyword matching uses up to 32 Unicode word tokens, combined with OR. Titles receive five times the BM25 weight of note text. Punctuation-only queries return no keyword matches.

`items` contains kind, stable ID, current revision, title, an unhighlighted 300-character note excerpt and a ranking score. Fetch the source record before editing it. No result count means “all relevant records”; each retrieval channel contributes at most 100 candidates. Ranking uses reciprocal rank fusion with constant 60 and deterministic kind/ID tie breaks. Scores are not confidence or probability.

`semantic` states what happened:

- `disabled`: keyword-only, either explicitly requested or embeddings not enabled.
- `pending`: the query embedding is queued; returned items are keyword results. The response includes `queryJob`. If an authorized matching embedding capability is available, generate from its exact text, call `search_query_commit` with its complete identity, then repeat search. Otherwise use keyword results immediately; pending is not evidence that a worker is running.
- `ready`: the cached query embedding was used. `pendingDocuments` reports indexed records still awaiting embeddings; zero semantic hits is not proof that no relevant source exists.

The query cache expires after one hour and retains at most 100 queries per owner. Title/note-text changes immediately invalidate their vectors; completion, schedule and other metadata-only edits retain them while results return the current source revision. Keyword search continues when provider processing is disabled or unavailable.

## Storage and update handling

Migration `0807` backfills canonical search documents and FTS5 from existing records. Ordinary SQL triggers maintain document revisions and embedding jobs on every source create, update and delete. The command transaction flushes dirty FTS/vector entries before commit; search flushes first to reconcile an out-of-band database write. This avoids unsafe virtual-table trigger access under TrailBase's trusted-schema restrictions. Do not disable those restrictions.

The admitted host already contains FTS5 and sqlite-vec. Version 1 fixes the embedding identity to OpenAI `text-embedding-3-small`, 1,536 dimensions. Changing either requires a versioned migration/rebuild, not an environment override. Notes contribute at most 16,000 characters to lexical indexing; embeddings use at most the first 6,000 UTF-8 bytes of title plus note text. Source records are unchanged.

Vector retrieval computes exact cosine distance over the owner/kind/archive-filtered candidate set, rather than using global top-k then dropping other owners. This is linear in the eligible corpus and intended for personal planning datasets, not a large shared search service.

Job IDs are monotonically increasing. Searchable-text edits replace old jobs; late results for replaced IDs/content revisions return `accepted:false`. Metadata-only edits retain the existing vector or in-flight job; its revision identifies the searchable content, not the latest schedule/completion revision. Deletes remove jobs and vectors in the command transaction. Claims start with a one-minute lease and back off exponentially to one hour. Expiry permits another claim; it does not run a producer. A process crash leaves a retryable job. Commits are idempotent. There is no provider call inside a database transaction.

## Use an external embedding producer

Keyword search requires no provider. MeOS stores and validates jobs; your authorized agent or existing pipeline generates vectors. No embedding daemon is installed or included in the standard release closure.

1. Admit a release containing the search and update-notification migrations and rebuilt guest through the normal release process. This PR does not authorize live installation.
2. Use your delegated-owner session for the producer; it needs no extra identity. An existing service integration can instead use an expiring owner-bound `search:index` grant. This privileged scope reads all five indexed source kinds, including period notes. Obtain consent before sending that text to the embedding provider. Use an admitted native MCP transport; the notification machine proxy is not a general MCP proxy and the public browser route does not bypass Access.
3. Call `configure_search` with `{"enabled":true}`. Claim up to eight jobs with `search_index_batch`; optionally target `id` or `source:{kind,id}`. Claims are atomic, owner-bound and bounded. A descriptor identifies `document` or `query`, its exact canonical `text`, and model/dimensions/index/input identity.
4. Generate the advertised model using the returned text unchanged. Submit `search_index_commit` with `id`, `revision`, `model`, `dimensions`, `indexVersion`, `inputVersion`, `inputHash`, and `embedding`. A stale or incorrect identity returns `accepted:false`; malformed vectors fail validation. Successful replays cannot replace a stored vector. Numerical validation cannot prove which model a producer used; producer correctness remains a trust boundary.
5. Inspect `search_index_status` for pending work. Drain bounded batches during explicit setup/startup/reconciliation if eventual coverage is required. Failed or unavailable capabilities leave jobs pending. Acknowledging an update does not finish its job. Disabling search preserves vectors but stops their use and new claims/commits.

Version 1 uses `indexVersion=planning-v1`, `inputVersion=utf8-prefix-6000-v1`, and SHA-256 of the exact canonical UTF-8 bytes. Canonicalization truncates at a Unicode code-point boundary to at most 6,000 bytes, preserving a leading BOM. Clients must not transform that text. Job text is retained with its vector so identity validation also applies to idempotent replays.

Interactive query generation is separate: `search:read` returns only the caller's query descriptor and permits `search_query_commit`. That operation rejects document jobs and other owners' IDs, so ordinary search callers need not receive all-document indexing authority. Query creation/commit emits no source event. Query jobs expire after one hour and share the 100-query owner bound.

## Opt into source-update notifications

Configure notification preferences with `recordUpdates:true`. Delegated-owner sessions include both capabilities. A service notification principal must hold both `notifications:consume` and `search:index`; existing boundary-only principals gain no new visibility. Keep its token out of dispatcher children and supply the executor's delegated-owner credential through its private credential boundary. Configure your host dispatcher to invoke [meos-on-event-updated](../public/skills/meos-on-event-updated/SKILL.md) only for `record.updated`. No universal or live-installed skill router is supplied here.

Enabling starts at the owner's current committed outbox high-water mark. Existing pending jobs provide backfill; the system does not fabricate historical source events. Each notification transaction consumes at most 100 owner outbox rows, stores stable 48-hex event IDs and advances its checkpoint atomically. The envelope contains kind, ID, revision and operation, not source text. Notifications are at-least-once; resolve the current targeted job before embedding. Metadata-only changes may need no work; deletes never require generation.

Timed boundaries and update envelopes retain independent active state. Scope loss suppresses update delivery without disabling boundaries. Updates use the same seven-day retention, opaque ack, consumer lease/fence and durable admission contract. A retention gap requires bounded pending-job reconciliation as well as agenda reconciliation. Search commits mutate derived tables only: no source revision, source outbox or recursive update emission.

The source includes an optional reference provider adapter for independently admitted integrations. Its installer/timer is not in the default release and is not required. Do not install it against an incomplete standard release closure.

## Verification

Run the trusted `sudo python3 scripts/backend-test-runner.py` launcher for isolated command, scope, canonical-input, no-recursion, replay and synthetic socket coverage. Unit vectors use a declared scalar adapter. Run the native proof against an exact candidate image for real FTS5/vec0 migration/ranking checks, and rebuild/qualify the guest before publication. Go dispatcher tests verify the raw update envelope survives forwarding and still requires durable acceptance. No check needs production data or provider credentials.
