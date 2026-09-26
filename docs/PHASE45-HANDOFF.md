# Phase 4/5 — planning, routines and preferences

## Behavior

- Today shows only tasks and routine occurrences projected into its calendar date, sorted with floating all-day entries first, then chronological timed entries. Task cards retain their source timezone label; timeline times use display preferences.
- Tomorrow moves the original task by one calendar day in its schedule timezone, preserving its clock time and zone. Detailed date/time/duration scheduling remains in the shared task form.
- Week has inclusive, captured start/end periods, configurable Sunday/Monday start, this/next selection, and clickable day agendas. Weekly outcomes reference existing task IDs; selecting/creating/removing membership never changes task priority or copies tasks. New outcome tasks start with priority `none`. Task priority remains independently editable.
- Routine definitions retain weekday/time/timezone/duration/notes. Completion is stored per routine ID + routine-local date. Editing/archive does not erase prior completions. Both Week and Settings expose create/edit/archive/restore.
- Day/Week Notes capture a frozen period when opened. Background midnight refresh does not remount or overwrite the editor. Save failures preserve drafts; dirty Escape/backdrop/Close require discard confirmation.
- Settings exposes display timezone, Sunday/Monday week start, 12/24-hour display, fixed Paper theme and floating-position reset. Preferences and all records remain page memory; navigation retains them, reload and new tabs reseed independently. No reset notice/banner or Reset day action.
- Existing floating primary drag/corner logic and Floating UI companion behavior are unchanged. Settings reset clears only remembered placement while the floating control is unmounted.

## Date semantics

`src/lib/dates.ts` uses actual Gregorian date validation and calendar arithmetic. `DatePeriod.end` is inclusive. DST folds select the earlier instant; gaps advance by the offset change, including half-hour and whole-day transitions. All-day schedules preserve literal dates. Timed schedules project into the display zone without rewriting source timezone intent. Midnight timer is bounded to one hour and refreshes immediately on focus/visibility return.

## Checks

Local static origin 127.0.0.1:3181:

- Build and strict typecheck passed; the existing bundle-size advisory remains.
- Fail-closed dependency license gate: 220 artifacts, no blocked entries; exact existing exceptions unchanged. No new dependency or skill.
- Pure date and planner projection checks passed.
- Browser A/B/C/D/E passed, including original CRUD/floating/modal regressions.
- 48 mouse/touch/keyboard corner selections passed after drag and resize, on Today/Week and phone/desktop.
- C checks defer/selected-week association/no duplicate tasks/independent priority, routine-local completion, archive/restore preserving history, Week-note period isolation and note drafts. It also verifies a rejected routine save retains input.
- D checks an open rich-note draft through midnight, non-default timezone/Sunday week, 12/24-hour display, floating-position reset, invalid timezone error, navigation retention, independent tab and reload reseed.
- Mobile Today/Week and desktop Week screenshots captured under `artifacts/phase4-*`; inspected against approved paper/ink/olive baseline.

## Boundaries and follow-up

Backend worktree is untouched. MSW owns all UI data; no credentials, production resources, persistence or live weather/location integration. Weather preference DTO is defined only for later adapter compatibility and is not a live feature. External hostname/Access validation remains parent-owned; deployment uses the already-authorized existing Compose preview only.

Independent review and deployed exact-tree evidence are recorded at closeout, not inferred from this implementation document.

## Qualification correction

ProseMirror suppressed native Escape while its editor had focus. The shared NotesEditor now delegates Escape to `dialog.requestClose()`, preserving each existing cancel/dirty guard and focus restoration. C awaits the actual discard dialog (rather than merely observing the editor remained open), then tests cancellation and subsequent save. Corrected C passes.
