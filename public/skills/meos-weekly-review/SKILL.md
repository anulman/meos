---
name: meos-weekly-review
description: Review priorities and capacity across the next 14 days when the user requests weekly planning or a configured weekly review fires; composes board decisions and schedules only within existing authority.
---

# Weekly review + 14-day look-ahead

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Suggested participation: 20–30 minutes. Use for strategic weekly reconciliation and forward planning, not every calendar update.

1. Reuse recent review progress and discuss priorities first: choose a few meaningful outcomes with the user or existing priority policy before collecting or decomposing tasks. Preserve the agreed priority order. Link each priority to a current MeOS project using the [project-linking policy](../contract.md#link-planning-priorities-to-projects): infer only an obvious link from recent MeOS context, otherwise ask; suggest creating a project when none is obvious or available.
2. Perform the weekly estimates-versus-actuals reflection: compare original estimates, planned slots and evidenced actuals, retain unknowns and confidence, and propose useful future-estimate adjustments without rewriting history. Do not treat elapsed slots as completion. Load open commitments, waiting-for items, routines and the next 14 days of availability. Reconcile [routine completion history and due windows](#routine-coverage) before relying on template notes. Record incomplete coverage and stale sources.
3. Reuse existing tasks for the agreed outcomes; derive additional tasks only for distinct independently tracked results, carrying their verified MeOS project IDs. Invoke [Walk the board](../meos-walk-board/SKILL.md) for consequential decisions; invoke [Clean the board](../meos-clean-board/SKILL.md) only when hygiene obstructs them. Do not repeat captured decisions. Identify preparation, travel, follow-ups, durations and dependencies; surface capacity conflicts without silently changing priorities. Review deadlines beyond the window only when preparation is needed within it.
4. Once outcomes, task estimates and constraints are sufficient, automatically begin scheduling within existing authority. If scheduling authority is missing, ask to start scheduling instead of ending with intake notes. Do not ask again when scheduling is already authorized.
5. Place tasks and routine instances on the dedicated MeOS calendar in the same planning pass. Explicitly instantiate and schedule routine coverage up to two weeks ahead using the supported planning contract; saving templates alone is not coverage. Interpret routine intent as frequency targets, duration intent, soft preferred times and hard rules. Fixed recurrence expansion yields unscheduled snapshots; choose concrete occurrence slots and durations separately. Use explicit occurrence creation for flexible targets. Preserve existing instances and calendar events, protect rest, meals and travel, and leave deliberate slack. Rebalance tasks and routines together rather than filling the calendar with tasks first. Surface unsupported recurrence or instance creation as a coverage gap; never silently omit it or invent a fixed recurrence.
6. Apply and verify authorized revision-checked changes. Respect Google-wins reconciliation without losing MeOS-only notes, estimates or history. Complete the [routine coverage check](#routine-coverage), verify task and routine coverage together and distinguish saved MeOS schedules from verified Calendar propagation. Apply the [displaced and dependent block policy](../contract.md#resolve-displaced-and-dependent-blocks) to work that does not fit, including successors whose prerequisites remain unfinished. Planning farther ahead does not authorize notifications beyond seven days.

## All-day context

Before making the planning decisions above:

- Read cached Calendar context for the next 14 days through `list_calendar_events`
  with the planning period and owner's timezone (`agenda:read` scope), following
  `nextCursor`. Include all-day context even though Today hides those cards;
  linked events are context, not duplicate commitments. If this operation or
  scope is unavailable, disclose missing coverage; do not borrow sync credentials.
- Check `status`, `lastSyncAt` and recurrence `windowStart`/`windowEnd`. Stale
  context is provisional. Unavailable data or dates outside the expansion window
  are not an empty calendar. `calendar_inventory` is not a provider-events read.
- Include events spanning the window: an all-day start date is inclusive and
  its end date is exclusive. Preserve the source dates and timezone context;
  do not turn date-only events into midnight timed commitments.
- Treat all-day events as date context, not automatic 24-hour busy blocks,
  elapsed effort or completion evidence. Mention holidays, travel, birthdays
  or deadlines only when they affect decisions, preparation or capacity—not
  as an exhaustive recital, and not as automatic task creation.

## Learning pass

Follow the [learning-loop reference](../learning-loop.md). Review available tasks and notes, including successes, surprises and unfinished work; state the period, reviewed sources and missing evidence. Compare intentions with supported outcomes without treating scheduled time as effort or inferring a universal correction factor. Keep, revise or retire the prior experiment; choose at most one next adjustment. Save the four-field reflection through an authorized notes capability or deliver it explicitly unsaved. Reuse walk/clean decisions; mutable current records do not establish what was known historically.

**Result:** chosen priorities/outcomes, verified scheduled blocks, explicit deferrals, identified gaps and a short unresolved decision list. Persist a checkpoint if the review is interrupted rather than restarting it.

## Search supporting context

Use the [search reference](../search.md) when related work or prior reflections could change a decision. Search is supporting evidence, not a replacement for exact agenda or Calendar reads.

## Save routine templates

When the user authorizes a new routine, discover `create_routine` and its schema
(`routines:write` scope). Supply a stable UUID, title, rich-text `notes` (an empty
document is `{"type":"doc"}`), and an IANA `timezone` in `value`, plus an
`idempotencyKey`. Preserve frequency in `recurrenceIntent` with the user's `text`
and a routine-local `anchorDate`; preserve duration in `durationIntent` text
and soft timing in `preferredTime.text`. For example, “three times a week,”
“roughly half an hour,” and “mornings” do not require exact weekdays or a clock
time. Do not supply removed template `weekdays`, `time` or `durationMinutes`
fields, or manufacture client-side interpretation. Read the server-derived
recurrence kind/status and preferred-time interpretation; clarify unresolved
intent only when it prevents a concrete planning decision. A flexible frequency
is valid intent, not a request to invent a fixed pattern. Exact schedules and
`durationMinutes` belong to occurrences. Saving a template does not create
occurrences or Calendar events.

Retain the returned routine ID, revision and request. After uncertain success,
replay the identical request and key; do not generate another identity. Report
the saved template separately from any subsequent planning. If creation is not
discoverable, keep an explicit unsaved proposal.

## Routine coverage

Reconcile every active routine, including flexible intervals and unscheduled
work, before closing the review. The timed agenda and template notes alone do
not establish coverage.

1. Read the current routine, relevant occurrences and any existing task used to
   cover the same outcome. Follow pagination and inspect available completion
   history far enough back to establish the latest evidenced completion. Reconcile
   dated completion evidence against older notes such as “last completion unknown”;
   do not carry the stale uncertainty forward when the records resolve it. Preserve
   history and distinguish a recorded completion date from a planned slot or an
   edit timestamp. If the date remains unknown or evidence conflicts, name the
   missing fact and next action; do not invent completion or rewrite the template.
2. Derive coverage from the routine's actual intent. For an interval after
   completion, calculate the next due window from the evidenced completion date,
   not a weekday or an uncompleted reservation. For example, completion on
   September 28 with an interval of 7–10 days gives October 5–8. Include overdue
   routines and windows intersecting the 14-day look-ahead. Later windows based
   on a future planned completion are provisional; recalculate after actual
   completion rather than treating the plan as history.
3. Check the entire due window against travel, location requirements, fixed
   commitments and protected time. A home-only routine due during an absence
   needs a feasible slot within its window while the user is home, or a surfaced
   trade-off. Do not silently move it outside the interval or assume someone
   else will do it. Reuse existing coverage, including an already linked fallback
   task, without creating a duplicate routine instance. Missing history reads,
   unsupported recurrence or unavailable instance creation is a named coverage
   blocker, not a reason to omit the routine.
4. Before closing, account for each due routine with verified feasible scheduled
   coverage, an explicit authorized disposition with its destination/review date
   and consequence, or a surfaced blocker/unresolved choice with a next action.
   Retain the completion evidence, due window and disposition in review progress
   through a supported capability; disclose unsaved progress if unavailable.
   Report incomplete coverage rather than calling a saved template, an unchecked
   reservation or an unresolved “last date unknown” a completed coverage check.
   Verify MeOS schedules and Calendar propagation separately.

When new instances are needed, use the [explicit routine planning contract](../contract.md#explicit-routine-planning)
within existing authority. Reuse the prior request receipt when coverage is
already planned. Ordinary context reads and unchanged plans do not require
another materialization command.

## Routine instances and commutes

Represent a planned repetition as an occurrence of its existing routine, using
`routineId`; do not create a standalone task for the same routine slot. Preserve
the occurrence's title, notes, completion, schedule and duration when correcting
an existing plan. Create and verify the replacement before deleting a mistaken
task with its current revision; then verify one managed Calendar event remains.

Represent travel placeholders as tasks with `type: "commute"` when the discovered
Task schema supports it. Keep their schedule, duration and any genuine project
link. Do not create a project just to hide travel, infer type from titles, or
archive travel to remove it from No project. Unclassified tasks retain normal
project rules. Routine occurrences and explicit commutes are excluded from
No project, not from the agenda or Calendar. If the live schema lacks this field,
report classification pending deployment; do not send an unsupported mutation.
