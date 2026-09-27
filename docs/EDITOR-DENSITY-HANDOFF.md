# Shared editor and Today density

## Implemented

- Existing schema-basic JSON remains unchanged. Standard ProseMirror base commands replace bespoke Enter splitting; Mod-B/I, Mod-Z, Shift-Mod-Z/Mod-Y and Shift-Enter support formatting, history and soft breaks. No new toolbar controls or persistence.
- Bold/Italic report pressed state from selection/stored marks and retain editor selection/focus on toolbar activation. Resource forms explicitly flag document changes dirty, including keyboard-only formatting and undo/redo; existing dirty Escape guards remain.
- Today alone has tighter task/routine padding, title/metadata line spacing and row gaps. Completion targets are now 44×44 CSS px. Existing title/defer hit areas remain at least 44 px high; Week and detail spacing are unchanged.
- Exact new direct dependencies: prosemirror-commands 1.7.2, prosemirror-history 1.5.0, prosemirror-keymap 1.2.3 (MIT). License gate covers 225 installed artifacts with zero blocked entries; prior scoped selections unchanged.

## Evidence

Local development origin http://127.0.0.1:3182, MSW synthetic page-memory fixtures only:

- `node scripts/browser-editor.mjs`: desktop and mobile-emulated touch; Enter/Shift-Enter, paste parser, selection formatting, toolbar pressed/focus, undo/redo, day-note failed save + retry + reopen, dirty Escape cancellation, keyboard-only task formatting dirty guard, week/routine rich-note save/reopen, Today completion, 44px completion targets, no horizontal overflow.
- Paste uses a dispatched ClipboardEvent with text/plain data, not the operating-system clipboard. Selection collapse before paste uses DOM selection setup. Toolbar taps are actual Playwright touchscreen taps.
- Existing browser B passes project/task notes, create/save/reopen/rejected save recovery and cross-view completion.
- Existing browser D passes captured-period drafts across midnight/week rollover, preferences and page-memory reset behavior.
- `pnpm typecheck`, `pnpm build`, `pnpm run licenses`, `git diff --check` passed. Existing bundle-size advisory remains.
- Inspected screenshots: `artifacts/editor-today-mobile.png` (390×844), `artifacts/editor-today-desktop.png` (1280×900). Readable wrapping and timeline alignment retained. Fixed floating/nav controls retain their existing overlap/scroll behavior.
- Manual implementation diff review completed. Independent review and deployment remain parent-owned. No claim of real iOS keyboard/IME qualification.

## Proposed follow-ups (not implemented)

1. Reduce repetitive Today metadata: cards repeat the timeline date/time and generic Task label, consuming vertical space. Explore one compact metadata line while retaining full scheduling detail in sheets.
2. Move Tomorrow into a compact task action placement: its separate 44px row currently dominates vertical rhythm even after reducing card padding. Keep a clear accessible defer action.
3. Defer-load the editor until a note sheet opens: the production build still emits an approximately 1 MB main JS chunk, even when only reading Today.
