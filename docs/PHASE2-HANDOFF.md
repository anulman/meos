# Phase 2 — visual shell

## Delivered

- Compact Today/date and This week/date headers; quiet Day Notes / Week Notes actions in the same row.
- Warm paper, ink and olive theme, muted task and sample routine cards, visible timeline gaps.
- Week selector, week-at-a-glance before Priorities and Routines.
- One fixed bottom navigation: Today / Week / Settings. No print/reset/secondary footer.
- Viewport-fixed floating Add task / Add outcome overlays, with pointer dragging and a keyboard-accessible corner selector. Position survives route navigation, resets on full reload, and clamps on viewport resize.
- Notes, Add and Manage actions explicitly identify themselves as visual-preview placeholders. Existing MSW-backed task completion remains functional.

## Verification

- `pnpm preview:deploy`: 220-artifact license gate, emitted-module build guard, production build, typecheck and Compose deployment passed.
- `PREVIEW_URL=http://127.0.0.1:3180 pnpm test:browser`: Journey A passed (mock PATCH, live collection update, nested reload, route retention, tab isolation, reseeding, no page errors).
- `PREVIEW_URL=http://127.0.0.1:3180 node scripts/browser-shell.mjs`: Journey E passed (390px phone, 320px narrow resize, desktop; no horizontal overflow; one nav; fixed content overlap; drag and keyboard placement; menu in viewport; route retention and reload reset; Notes dialog).
- Screenshots inspected: `artifacts/phase2-today-mobile.png`, `phase2-today-mobile-scrolled.png`, `phase2-week-mobile.png`, `phase2-today-desktop.png`, `phase2-week-desktop.png`.
- Initial qualification exposed hydration mismatches and stale active-link state in the static SPA root. Route-aware navigation/floating controls now mount after hydration; direct Week reload is covered by E.

## Boundaries and next phase

No persistence, external providers, proxy changes, printing, reset-day function, real scheduling/routines, or new dependencies. Runtime date/timezone comes from the existing configuration; midnight updating belongs to Phase 4.

Phase 3 should replace `PreviewAction`/floating creation placeholders with shared Task/Project create/edit/details and real ProseMirror notes. Keep inline status, collapsible Plan, Notes + references; Projects add Tasks before Archive. Use the existing fixed button component and wire its action rather than replacing its positioning behavior. Ensure project archive leaves tasks discoverable in No project. Phase 4 should replace the explicitly labelled sample routine cards and group scheduled/unscheduled tasks from actual planning data. Phase 5 completes Settings.

The current shell uses CSS custom properties for palette and StyleX for the app frame; it does not add a second UI library. Hosted CI status is reported separately by the parent. Build still reports a non-blocking large-chunk warning inherited from the foundation bundle.
