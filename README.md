# MeOS
A small, mobile-first personal planner for days, weeks, projects, and routines.

## Client-only planning preview
React/TypeScript, TanStack Start SPA + Router, TanStack DB Query collections + Query, TanStack Form, Base UI, StyleX, ProseMirror and MSW. Today projects scheduled tasks and recurring routine occurrences into the display timezone. Week keeps explicit task-linked outcomes separate from task priority and schedule. Day/Week Notes capture inclusive calendar periods. Settings exposes project/unassigned cleanup, routine management, display timezone, week start, time format and floating-position reset.

**Demo only:** all entity data lives in page memory. Route navigation preserves it; hard reload resets it. Browser tabs are independent. MSW's service worker intercepts requests; it is not a PWA and does not persist entity data. No localStorage, IndexedDB, SQLite, real API, accounts, notifications, or secrets.

## Commands
Node 24 and pnpm 10.30.3. All package versions and transitive resolutions are pinned.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm run licenses
pnpm build
pnpm typecheck
# Two terminals for static browser acceptance:
node scripts/serve.mjs
pnpm test:browser
# After license qualification passes:
pnpm preview:deploy
```

`CHROMIUM_PATH` overrides `/usr/bin/chromium-browser` in the browser acceptance script. `PREVIEW_URL` overrides its default `http://127.0.0.1:3181`. Script A checks nested reload, MSW read/write, TanStack DB mutation, route retention, independent tabs and reload reseeding. Screenshot: `artifacts/phase1-mobile.png`.

## Deployment
Build static files on the host first. The final nginx image contains `dist/client` only, not Node, pnpm, server bundles or build dependencies. Compose binds `127.0.0.1:3180`, uses a healthcheck and restart policy, no secrets or host mounts. Compose plugin validated during setup: v2.39.4 from Docker's official release with SHA-256 release checksums.

Runtime public configuration is generated at container startup: `MEOS_TIMEZONE` (default UTC), `MEOS_API_BASE` (default `/api`, same-origin path), demo always true. Local development uses `public/config.js`. Configuration is public and must never contain credentials. Production API mode is intentionally rejected in this phase. Invalid timezone fails clearly in the client; runtime strings are allowlisted against script injection.

A host reverse proxy can use `reverse_proxy 127.0.0.1:3180`; hostname and access policy are deployment concerns, not hardcoded in this app. Public routing is not part of this worktree's deployment script.

## Data contracts
`src/lib/contracts.ts`: UUID identity, tasks with date/time + IANA timezone, projects with optional date-only targets, routines with weekday rules, dated occurrences, priorities, internal entity references, serializable ProseMirror-shaped notes, settings. Seed task dates follow the current date in configured timezone (therefore current week). Seed UUIDs are stable; future created entities should use `crypto.randomUUID()`.

## Qualification / limits
Dependency license gate is fail-closed. See `docs/LICENSE-REVIEW.md` for exact approved build-tool exceptions and retained notices. Apache-2.0 project license is preserved. GitHub checks perform license qualification, build and typecheck only; no automatic deployment.

The client-only demo does not include persistence, search, external integrations, weather/location feeds, accounts, notifications or printing. Resources use archive/restore rather than destructive deletion. Paper is the fixed theme. No visible reload/reset banner is shown, per approved steering. See `docs/PHASE45-HANDOFF.md` for planning semantics and qualification evidence.

## Planning acceptance

```sh
node scripts/test-dates.mjs
node scripts/test-planner-clock.mjs
PREVIEW_URL=http://127.0.0.1:3181 node scripts/browser-b.mjs
PREVIEW_URL=http://127.0.0.1:3181 node scripts/browser-c.mjs
PREVIEW_URL=http://127.0.0.1:3181 node scripts/browser-d.mjs
PREVIEW_URL=http://127.0.0.1:3181 node scripts/browser-shell.mjs
MEOS_TEST_URL=http://127.0.0.1:3181 node scripts/browser-anchor.mjs
```

`browser.mjs` is journey A; B is resource editing, C planning/routines/period notes, D preferences/midnight/reset, E (`browser-shell`) mobile/desktop and floating/modal behavior. Anchor checks preserve the previously approved 48 mouse/touch/keyboard corner cases. Test-only static origin stays loopback on 3181; deployed preview stays loopback on 3180.

## Agent operating skills

Discover the tool-only MeOS planning and board procedures through [llms.txt](llms.txt). The canonical [shared contract](public/skills/contract.md) and seven skills live under `public/skills/`; Vite serves these files unchanged at `/skills/` and the public index at `/llms.txt`. Publishing these documents does not enable recurring prompts, notifications or Calendar sync.
