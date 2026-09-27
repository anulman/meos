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
- `pending`: the query embedding is queued; returned items are keyword results. Wait `retryAfterMs`, then retry at most three times. Use the keyword results and report pending status if the worker has not completed.
- `ready`: the cached query embedding was used. `pendingDocuments` reports indexed records still awaiting embeddings; zero semantic hits is not proof that no relevant source exists.

The query cache expires after one hour and retains at most 100 queries per owner. Title/note-text changes immediately invalidate their vectors; completion, schedule and other metadata-only edits retain them while results return the current source revision. Keyword search continues when provider processing is disabled or unavailable.

## Storage and update handling

Migration `0807` backfills canonical search documents and FTS5 from existing records. Ordinary SQL triggers maintain document revisions and embedding jobs on every source create, update and delete. The command transaction flushes dirty FTS/vector entries before commit; search flushes first to reconcile an out-of-band database write. This avoids unsafe virtual-table trigger access under TrailBase's trusted-schema restrictions. Do not disable those restrictions.

The admitted host already contains FTS5 and sqlite-vec. Version 1 fixes the embedding identity to OpenAI `text-embedding-3-small`, 1,536 dimensions. Changing either requires a versioned migration/rebuild, not an environment override. Notes contribute at most 16,000 characters to lexical indexing; embeddings use at most the first 6,000 UTF-8 bytes of title plus note text. Source records are unchanged.

Vector retrieval computes exact cosine distance over the owner/kind/archive-filtered candidate set, rather than using global top-k then dropping other owners. This is linear in the eligible corpus and intended for personal planning datasets, not a large shared search service.

Job IDs are monotonically increasing. Searchable-text edits replace old jobs; late results for replaced IDs/content revisions return `accepted:false`. Metadata-only edits retain the existing vector or in-flight job; its revision identifies the searchable content, not the latest schedule/completion revision. Deletes remove jobs and vectors in the command transaction. Worker leases start at one minute and retry with exponential backoff capped at one hour. A process crash leaves a retryable lease. Commits are idempotent. There is no provider call inside a database transaction.

## Enable the optional embedding worker

Keyword search requires no worker or provider secret. The worker sends planning text and search queries to OpenAI; obtain the owner's explicit consent before enabling it. Installation does not activate it.

1. Admit a release containing migration `0807` and the rebuilt guest. Preserve the normal database rollback copy. The existing production install/admission procedure remains authoritative.
2. Provision a separate expiring native agent identity bound to the owner with **only** `search:index`, using the existing admitted agent-grant procedure. Do not reuse the browser owner, Calendar sync token, or give this scope to ordinary search clients. The grant can read indexed text and commit vectors; it is a privileged worker credential.
3. Privately provision `/etc/meos/search.env`, root-owned mode 0600, matching `deployment/search.env.schema`: `MEOS_SEARCH_ENABLED=true`, the HTTPS `MEOS_PUBLIC_ORIGIN`, `MEOS_SEARCH_AGENT_TOKEN`, and `MEOS_OPENAI_API_KEY`. Leave `MEOS_SEARCH_SOCKET=/run/meos-search/backend.sock`. Never put these in a PR, chat, or shell history. The provider endpoint is fixed; custom base URLs and redirects are rejected. The worker uses the admitted private native Unix socket, with the installation HTTPS origin as its Host/context. It does not request the public Access-protected browser route, and does not change Access policy. Native bearer authentication and the `search:index` grant remain mandatory.
4. Validate the configuration with the admitted Varlock CLI. Install `sh scripts/install-search-worker.sh /absolute/admitted/release /absolute/admitted/backend.sock` as root. Inspect the generated unit and verify the unit uses the admitted `runtime/node/bin/node` from that release, not an unqualified system Node. The release staging closure now includes the worker, client, unit/schema files and independently admitted installer. The installer leaves the timer disabled.
5. In the same private environment, run `node scripts/search-worker.mjs --doctor`. Run doctor in the installed unit namespace, where the admitted backend socket is bound to `/run/meos-search/backend.sock`; for a manual host check, set `MEOS_SEARCH_SOCKET` to that same admitted source socket. It checks configuration and native scope/readiness without leasing work or contacting OpenAI. Missing or expired credentials fail closed. A successful doctor does **not** prove provider access.
6. After consent and network admission, call `configure_search` with `{"enabled":true}` using the worker's native grant. Enable `meos-search.timer`. Check the service's bounded completion/failed counts and `search_index_status` backlog. Provider verification must be a separately approved synthetic round trip; it was not performed by this PR.

Each timer activation processes at most eight records serially and exits. The systemd unit binds only the admitted native socket, has no database mount and runs as a dedicated user. Stopping the timer prevents future runs; stopping the active service can interrupt a request, whose uncommitted lease retries later. To stop processing, disable the timer and call `configure_search` with `{"enabled":false}`. Existing vectors remain stored but are not used while disabled. Rotate/renew native credentials before expiry through the normal admitted credential procedure; the worker does not create grants or bypass their expiry.

## Verification

Run `node --test scripts/backend-search-tests.mjs scripts/backend-search-socket-tests.mjs` for command, scope, provider-mock and retry coverage. This suite uses a declared scalar-vector unit adapter. Run `python3 scripts/search-native-proof.py` for the real FTS5/vec0 migration, ranking and mutation proof in the pinned production image, with a disposable synthetic depot and no network. The socket suite runs the installed doctor entrypoint against a synthetic private native socket, exercises a mocked-provider batch, and verifies wrong-scope/invalid-token denial without requesting the public origin. No check uses production data or provider credentials.
