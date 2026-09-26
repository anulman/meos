# Backend acceptance handoff (not production)

Backend source is on `backend/persistence` in the `meos-backend` worktree. Use the
same client adapters/screens against the real handler; do not copy backend domain
logic into a new frontend mock. No personal data or production credentials.

## Connection contract

- Origin compiled in guest: `https://meos-acceptance.invalid`.
- Runtime has **no network** or published TCP ports. Current verified Unix socket
  and container/run ID are in private `.qualification/acceptance-endpoint.json`.
- Use a trusted isolated browser/proxy launcher. Bind only the checked disposable
  socket into its namespace at `/run/meos-acceptance-data/server.sock`; mount no
  Docker socket or production paths, forward no inherited credentials, and prove
  host/production network denial before repository/browser tests. Do not expose
  the server directly or relax the existing foundation guard silently.
- `createProtectedApiProxy({origin, upstream})` in `backend/protected-proxy.mjs`
  accepts Fetch Requests. `upstream` must implement Request -> Response over the
  verified disposable Unix socket. Returns undefined for non-API static paths.
  Preserve multiple Set-Cookie headers. The tested implementation example is
  `scripts/backend-proxy-live.mjs`; its launcher is `backend-live-runner.py --proxy`.
- Form POST `/api/auth/v1/login`: email/password only, same Origin. Credentials
  are synthetic and retained0600 in `.qualification/synthetic-credentials.json`;
  the trusted launcher copies only the current run's credentials into sandbox.
  Never print them, embed in bundles, or send through chat.
- GET `/api/meos/v1/session`: safe user UUID and CSRF; no auth/refresh token body.
- POST `/api/meos/auth/logout`: same-origin and `X-CSRF-Token` from session. Native
  GET logout and raw native status/token/admin/record/signup routes are denied.
- Planner `/api/meos/v1/resources/{kind}` and legacy commands remain.
  New operations use the generated `ApplicationClient` wrapping the existing
  session-fenced `JsonTransport`; see `BACKEND-CONTRACT.md` and `openapi.json`. All scheduled tasks require explicit time;
  there is no Anytime representation. Writes carry expected revision where
  required. Clear user-scoped client caches and in-flight queries on identity
  changes. Retry only known idempotent operations.
- Bridge ingress is **not a browser API**; public proxy denies it. Separate native
  bridge identity is owner-bound and cannot access planner resources.

## Remaining frontend B4 proof

Run same screens for Today/Week, projects/tasks/notes/routines, preferences and
weather disabled/fallback; persisted reload, second-user isolation, CSRF, stale
revision recovery, occurrence retry and logout/cache clearing. Browser proof is
not replaced by focused or live HTTP checks. Production release remains a
later explicit gate. Exact local image is `backend/reviewed-artifacts.json`.

## Evidence epochs

Earlier development acceptance `48c006581c5494589e69af1b123dec97` and restore
`ab9603e037e143889b27a7f3d3478cbb` prove lifecycle, data restore, private cron,
bridge isolation and actual provider transport/cache. Their guest hashes and
checks are preserved; they are not represented as full exact-final-image reruns.
Final fresh-image smoke is recorded separately in `live-final-image-evidence.json`.
All suite counts include overlapping login assertions.

## New contract integration requirements

- Import new operation types from `src/lib/backend/generated.ts`; do not retain
  the old completion-only `OccurrenceCompletion` as the UI's complete model.
- `Occurrence.date` is the original immutable slot. Display/group current agenda
  date using its `schedule` or server `list_agenda`, never the original slot.
- Load daily/weekly tasks from actual scheduled instants. Unscheduled tasks and
  instances remain available outside daily views; no default times.
- Use `move_occurrence` / `complete_occurrence` to update an independent instance.
  Preserve template and siblings. Keep the same idempotency key for uncertain
  retries, but use a new key for a different intended change.
- Fixed recurrence expansion uses `materialize_routine` with original-slot UUIDs,
  bounded by the server's actual local today+14. Flexible recurrence is intent
  for scheduling, not a license for the UI to synthesize infinite items.
- Preferred-time text is guidance, not schedule. Render contextual/ambiguous
  interpretations honestly; do not turn “morning” or “before lunch” into an
  invented hard time. Explicit DST folds require `offsetMinutes`.
- Handle409 as a revision conflict and reload/reconcile, not overwrite.
- Do not put MCP credentials in the browser. Browser proxy denies the MCP path;
  authenticated MCP was qualified separately over the disposable native socket.

Backend qualification evidence for this pass is `backend/contract-evidence.json`.
Its exact-image checks cover runtime/API/MCP, not same-screen frontend behavior.
The final-image Unix socket and current synthetic credentials remain private in
`.qualification`; no endpoint/token is baked into the generated client.
