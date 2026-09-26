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
- Planner `/api/meos/v1/resources/{kind}` and commands use the existing typed
  transport/repository contract. All scheduled tasks require explicit time;
  there is no Anytime representation. Writes carry expected revision where
  required. Clear user-scoped client caches and in-flight queries on identity
  changes. Retry only known idempotent operations.
- Bridge ingress is **not a browser API**; public proxy denies it. Separate native
  bridge identity is owner-bound and cannot access planner resources.

## Remaining frontend B4 proof

Run same screens for Today/Week, projects/tasks/notes/routines, preferences and
weather disabled/fallback; persisted reload, second-user isolation, CSRF, stale
revision recovery, occurrence retry and logout/cache clearing. Browser proof is
not replaced by the46 focused or live HTTP checks. Production release remains a
later explicit gate. Exact local image is `backend/reviewed-artifacts.json`.

## Evidence epochs

Earlier development acceptance `48c006581c5494589e69af1b123dec97` and restore
`ab9603e037e143889b27a7f3d3478cbb` prove lifecycle, data restore, private cron,
bridge isolation and actual provider transport/cache. Their guest hashes and
checks are preserved; they are not represented as full exact-final-image reruns.
Final fresh-image smoke is recorded separately in `live-final-image-evidence.json`.
All suite counts include overlapping login assertions.
