# Phase 1 evidence

Status: implementation + static browser proof complete; deployment/publication blocked by license gate.

- `pnpm build`: pass (TanStack Start prerenders `/_shell.html`; only client assets intended for image).
- `pnpm typecheck`: pass.
- `pnpm test:browser`: pass using existing system Chromium headless on a loopback-only acceptance server, no production credentials.
- Browser A: direct `/week`, reload `/week`, seeded MSW GET, successful PATCH completion through TanStack DB, Today navigation retention, second-tab independence, hard reload reseed, no page errors, no localStorage.
- Screenshot inspected: `artifacts/phase1-mobile.png` (390px mobile; warm ivory/olive/serif hierarchy and three-tab navigation).
- `docker compose config --quiet`: pass.
- `git diff --check`: pass.
- `pnpm run licenses`: expected fail, 220 installed artifacts checked. Exact blockers in LICENSE-REVIEW.md.
- No Docker image/container created and no commit/push performed before license resolution.

Filesystem impact: worktree 244 MiB including dependencies/local pnpm store. Attached-volume available space moved approximately 5.7 → 5.3 GiB; root 2.5 → 2.4 GiB (rounded; other concurrent jobs may contribute). Compose v2.39.4 binary in user's Docker CLI plugin directory; official release checksum verified. No unrelated pruning or deletion.

Temporary local acceptance server: `node scripts/serve.mjs` on 127.0.0.1:3181 was stopped after verification (not a durable deployment; no preview process remains running). Planned Compose endpoint 127.0.0.1:3180, initially verified free. Host proxy/Cloudflare intentionally untouched.

Build emits a >500kB main-chunk advisory (~569kB uncompressed /173kB gzip); optimization deferred with functional phases. ProseMirror and Form packages intentionally pinned but unused until next implementation phase. No final CRUD/editor/planner claims.

## Resumed qualification — 2026-09-25

The license blocker above is resolved by Aidan's scoped MPL approval (Telegram41727). License review/selections now retain full shipped notices and exact-artifact hashes. `pnpm run licenses`: PASS 220 artifacts, zero blockers. No blanket copyleft approval.

- Added a Vite emitted-module guard rejecting the reviewed build-only dependencies in output chunks. Rebuilt successfully with guard; typecheck PASS.
- Docker Compose static preview deployed at `http://127.0.0.1:3180` (container `meos-preview`, image `meos-preview:local`); health is healthy, port bound only to loopback.
- Browser A repeated against the actual container: PASS nested reload, MSW PATCH, live collection mutation, navigation retention, separate-tab independence, hard-reload seed reset and zero page errors.
- Container inspection found no Lightning CSS artifacts, node_modules, native .node files or Node executable in client/server-tool locations. Docker context excludes all dependencies and server output; only static client output and nginx configuration copied.
- Host proxy untouched. Parent must wire only the new hostname and report preview; user verifies Cloudflare Access on mobile.
- Remaining Phase 2+ work is unchanged: approved visual shell/detail flows, Form/ProseMirror integration, planning/routines, settings and independent integrated qualification. This is a foundation preview, not a completed planner.

Run/rollback: `docker compose up --build -d` after gated build; stop only this preview with `docker compose stop preview`. No other services changed. Rebuild a prior git tree then recreate to roll back its static assets. Public DNS/access policy remain outside this checkout.
