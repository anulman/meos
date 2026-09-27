# Search supporting context

Discover `search` in MCP before using it. The owner-bound `search:read` scope permits task, project, routine, occurrence and period-note search. It does not authorize source edits or document indexing.

Use `search` for prior decisions, related work and reflection notes; use exact agenda/date tools for schedules. Example arguments: `{"query":"weekly reflection travel","mode":"hybrid","kinds":["periodNotes","tasks"],"limit":10}`. Results include a current revision and excerpt, not necessarily the full record. Retrieve the source through an available authorized read before drawing conclusions or editing it; if that read is unavailable, state the limitation.

If `semantic` is `pending`, results are lexical and `queryJob` describes the exact query input. If you have an authorized embedding capability for its advertised model/dimensions, generate from `queryJob.text` without modifying it. Call `search_query_commit` with its `id`, `revision`, `model`, `dimensions`, `indexVersion`, `inputVersion`, `inputHash`, and generated `embedding`, then repeat search once. This tool cannot commit document jobs. Treat `accepted:false` as stale and use the current search response. Do not approximate vectors or substitute another model.

If the capability is absent, proceed immediately with lexical evidence and disclose pending semantic coverage; do not wait for an unspecified worker. `disabled` is valid keyword-only behavior. `ready` means query-vector retrieval ran; inspect `pendingDocuments` before claiming complete coverage. Scores are not confidence and an empty result is not proof of absence.

During morning planning or weekly review, search only when related work or a prior reflection would change a decision. Do not replace all-day Calendar context, exact agenda reads, or the shared operating contract with relevance-ranked results. Saving reflections still requires an available authorized source-write operation.
