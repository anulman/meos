# Phase 3 — resource editing

Implemented Task/Project creation and detail sheets using the shared TanStack Form and ProseMirror components. Inline status, native collapsible Plan, Notes, references and project Tasks precede Archive. Floating controls open real task forms; Add outcome starts a high-priority task (actual weekly mapping remains Phase 4).

Settings exposes Projects/New project, No project including unscheduled tasks, and archived resources with Restore. Archiving a project preserves and detaches its tasks. Rejected saves retain entered names, editor JSON and references. Closing or switching a dirty detail requires explicit discard confirmation. Native dialogs provide modal focus/escape behavior; detail content scrolls within the viewport.

## Verification

- `pnpm run licenses`: 220 artifacts, no blocked licenses, existing exact MPL exceptions unchanged.
- `pnpm build`: pass, existing emitted-module compiler guard retained. No MSW prerender errors after moving provider subscriptions behind hydration.
- `pnpm typecheck`: pass.
- `PREVIEW_URL=http://127.0.0.1:3180 node scripts/browser.mjs`: deployed A pass.
- `PREVIEW_URL=http://127.0.0.1:3180 node scripts/browser-b.mjs`: deployed B pass. One journey covers create project/task, edit/reopen ProseMirror and references, optional schedule/time/duration, rejected save preserves draft, cross-view completion, archive/unassign, unscheduled orphan discovery, restore and dirty-close cancel/discard.
- E behavior replay (Playwright): one navigation/no footer, genuine fixed add control, scroll stability, keyboard placement, drag without unwanted dialog, navigation retention, resize clamping, reload reseed, week glance hierarchy, Notes placeholder dialog, hidden FAB in Settings, desktop overflow all pass. Original E script filename was not supplied to this worker; parent can run it independently.
- `git diff --check`: pass.
- `pnpm preview:deploy`: deployed loopback port 3180; container healthy.

Image: `sha256:a9481d5a2f36a9026c4b3078f6f822a588843d85e8d6f1fd79192fb05b12cc25`.

Inspected deployed screenshots: `artifacts/phase3-task-mobile.png`, `artifacts/phase3-project-mobile.png`, `artifacts/phase3-project-desktop.png`. Dialogs have bounded vertical scrolling, no horizontal overflow, and preserve paper/ink/olive styles. Form actions may require scrolling on phones.

## Bugs caught and fixed

- TanStack Query collection retained absent optional keys after API project archival. Explicit optional-property normalization in task query results ensures project removal and cleared scheduling propagate.
- Root-level data subscriptions attempted browser MSW initialization during prerender. Hydration-gated active provider fixes that.
- Preserved PATCH on direct task-completion updates to retain the established API contract and A assertion.

## Remaining scope

Phase 4: day/week filtering, actual scheduling/defer/priority mapping, routines/occurrences and Day/Week Notes. Phase 5: full preferences and richer demo settings. Today and Week still show active demo tasks regardless of their dates until that planning work lands. No persistence, production backend, external entities, printing, reset-day or proxy changes were introduced. No new dependencies or skills consumed. Reference validation currently accepts HTTP/HTTPS only. Independent whole-product review remains Phase 6.
