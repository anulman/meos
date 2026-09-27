# Search supporting context

Discover `search` in MCP before using it. The owner-bound `search:read` scope permits task, project, routine, occurrence and period-note search. It does not authorize edits or worker configuration.

Use `search` for prior decisions, related work and reflection notes; use exact agenda/date tools for schedules. Example arguments: `{"query":"weekly reflection travel","mode":"hybrid","kinds":["periodNotes","tasks"],"limit":10}`. Results include a current revision and excerpt, not necessarily the full record. Retrieve the source through an available authorized read before drawing conclusions or editing it; if that read is unavailable, state the limitation.

If `semantic` is `pending`, results are lexical. Wait `retryAfterMs` and retry at most three times, then proceed with lexical evidence and disclose the pending semantic pass. `disabled` is a valid keyword-only result. `ready` means query-vector retrieval ran; inspect `pendingDocuments` before claiming complete semantic coverage. Do not describe relevance scores as confidence or an empty result as proof of absence.

During morning planning or weekly review, search only when related work or a prior reflection would change a decision. Do not replace all-day Calendar context, exact agenda reads, or the shared operating contract with relevance-ranked results. Search does not add generic note-writing tools; saving reflections still requires an available authorized write operation.
