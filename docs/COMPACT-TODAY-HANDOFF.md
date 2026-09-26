# Compact Today and timed tasks

## Approved changes

- Today rows now contain one title and, only when relevant, a quiet priority/project/duration line. The timeline owns the displayed time; repeated date, timezone, generic Task label and separate Tomorrow action are removed. No inline rescheduling was added.
- Task rows are approximately 58px without metadata and 80px with metadata; title and completion targets retain 44px minimums. Routine rows also use tighter typography and padding.
- Completed tasks move into a native disclosure, collapsed initially, with visible task completion progress. Reopening returns a task to the timed agenda. Week/detail grouping remains unchanged.
- Scheduled task DTOs require time. Form and MSW writes reject dated tasks without a valid time. Every scheduled synthetic fixture has an explicit time. Unscheduled backlog remains supported; routines retain their separate optional-time semantics.
- Legacy date-only tasks are excluded from the timed projection and exposed in an actionable “Tasks needing a time” section, without invented times or an Anytime task bucket.
- Includes the earlier shared editor command/history/formatting-state work at 907e6c.

## Qualification

- Typecheck, production build, 225-artifact license gate (zero blocked), planner projection test and diff whitespace check pass. No new dependencies or license exceptions introduced.
- Browser density journey on 390px touch-capable and 1280px desktop: timed fixture/API validation; form missing-time rejection and draft retry; initial collapsed completed group; completion/reopen/progress; rejected optimistic completion error and rollback; 44px targets; no horizontal overflow.
- Existing editor desktop/touch, B (resource lifecycle) and D (planner clock/preferences) browser journeys pass.
- Screenshots artifacts/compact-today-390.png and compact-today-1280.png visually inspected. Readable title wrapping and substantially shorter rows; all five active fixture rows and completion disclosure fit above floating controls.
- Independent reviewer /root/meos_frontend_finish/review found one P2: completion failure error state was lost when optimistic grouping unmounted a row. Fixed by routing errors to stable agenda state; regression added. Reviewer rechecked and approved with no remaining blocking findings.

## Publication boundary

Existing reset-on-reload MSW static preview only. No backend data, credential, instance, or persistent production cutover. Local deployed-container browser checks and served asset verification are recorded in the owner state. Real iOS keyboard/IME and authenticated external Access path are not qualified here. Existing large main-chunk build advisory remains.
