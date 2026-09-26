# UI corrections handoff

Qualified application/source tree: `02d7e8647de33281bf17fbf89bad91e162e5a728` (before this documentation-only handoff). Base commit: `bf25c2c`.

## Delivered

- Shared Today/Week FloatingControls; official `@floating-ui/react-dom` exact version 2.1.9, MIT verified from package metadata. Already present transitively; now an explicit dependency.
- Main FAB retains its chosen viewport position through scroll/navigation, clamps on resize, resets on reload. Floating UI independently positions target, positioning menu and hover tooltip with automatic top/bottom flip and viewport shift.
- Anchor hidden at rest; actual drag threshold shows it. Drag end waits 500 ms, then fades 150 ms. Another drag cancels timers. Clicking during grace/fade opens persistent positioning menu. Keyboard focus exposes control; ArrowUp/ArrowDown opens placement menu directly. Escape/outside/focus departure dismiss menu.
- Resource and placeholder dialogs dismiss on backdrop activation. Pointer gesture must begin and end outside, avoiding accidental dismissal after an inside-to-outside drag. Resource dirty-discard guard is preserved; native focus restoration retained.
- Modal header/footer fixed within viewport-bounded dialog, only resource body scrolls.
- Removed visible reset-on-reload notice, without changing reset semantics.

## Evidence

- `pnpm typecheck`, `pnpm build`, `pnpm run licenses`: pass. License gate checked 220 artifacts, no blocked items. Existing build-tool MPL exception unchanged. No new license exception.
- `pnpm preview:deploy`: pass (includes gate/build/typecheck). Preview port 3180.
- Deployed image config: `sha256:f70a1ba8e06445ed523072aec4f43a07fb59a7060c2eb08917a13a1e82c6cd33`.
- Deployed Browser A: boot, nested reload, MSW read/PATCH, collection update, navigation retention, tab isolation, reseed; no page errors.
- Deployed Browser B: CRUD, notes/references, scheduling, cross-view completion, rejected-save draft retention, archival/unassignment: pass.
- Deployed Browser E: shell/navigation, fixed scrolling, drag, accessible placement, route retention, resize, reload; added target hidden/grace/fade/restart/menu-hold assertions, automatic target flip at top/bottom, inside/backdrop dismissal, inside-to-outside gesture retention, dirty cancel/discard, trigger focus return, scroll-body header/footer stability, narrow 320x620 footer visibility: pass.
- `git diff --check`: pass. Manual changed-source review complete.
- Visually inspected artifacts: `artifacts/phase2-today-mobile.png`, `artifacts/phase2-today-desktop.png`, `artifacts/ui-corrections-modal-mobile.png` (existing scripts refresh Phase2-named screenshots).
- Install uses existing project store: `pnpm add --save-exact @floating-ui/react-dom@2.1.9 --store-dir .pnpm-store`. Global configured cache path was inaccessible; no permissions/global configuration changed.

## Remaining scope

No backend, persistence, proxy or unrelated changes. Phase 4 planning/routines/Day-Week Notes, Phase 5 Settings, independent final acceptance remain for the next owner. Routine cards and Notes placeholders still honestly labelled. Parent independent review/remote CI are separate follow-up checks, not claimed completed here.
