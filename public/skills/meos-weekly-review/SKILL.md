---
name: meos-weekly-review
description: Review priorities and capacity across the next 14 days when the user requests weekly planning or a configured weekly review fires; composes board decisions and schedules only within existing authority.
---

# Weekly review + 14-day look-ahead

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Suggested participation: 20–30 minutes. Use for strategic weekly reconciliation and forward planning, not every calendar update.

1. Reuse recent review progress and discuss priorities first: choose a few meaningful outcomes with the user or existing priority policy before collecting or decomposing tasks. Preserve the agreed priority order.
2. Perform the weekly estimates-versus-actuals reflection: compare original estimates, planned slots and evidenced actuals, retain unknowns and confidence, and propose useful future-estimate adjustments without rewriting history. Do not treat elapsed slots as completion. Load open commitments, waiting-for items, routines and the next 14 days of availability. Record incomplete coverage and stale sources.
3. Derive tasks from the agreed outcomes. Invoke [Walk the board](../meos-walk-board/SKILL.md) for consequential decisions; invoke [Clean the board](../meos-clean-board/SKILL.md) only when hygiene obstructs them. Do not repeat captured decisions. Identify preparation, travel, follow-ups, durations and dependencies; surface capacity conflicts without silently changing priorities. Review deadlines beyond the window only when preparation is needed within it.
4. Once outcomes, task estimates and constraints are sufficient, automatically begin scheduling within existing authority. If scheduling authority is missing, ask to start scheduling instead of ending with intake notes. Do not ask again when scheduling is already authorized.
5. Place tasks and routine instances on the dedicated MeOS calendar in the same planning pass. Explicitly instantiate and schedule routine coverage up to two weeks ahead using the supported planning contract; saving templates alone is not coverage. Interpret routine intent as frequency targets, soft preferred times and hard rules. Preserve existing instances and calendar events, protect rest, meals and travel, and leave deliberate slack. Rebalance tasks and routines together rather than filling the calendar with tasks first. Surface unsupported recurrence or instance creation as a coverage gap; never silently omit it or invent a fixed recurrence.
6. Apply and verify authorized revision-checked changes. Future blocks, including tomorrow and week two, default to TENTATIVE; use only supported schema representation or retain an explicit proposal. Target-day commitment belongs to prior-night preparation or day-of launch, with fresh capacity checks. Respect Google-wins reconciliation without losing MeOS-only notes, estimates or history. Verify task and routine coverage together and distinguish saved MeOS schedules from verified Calendar propagation. Explicitly defer work that does not fit. Planning farther ahead does not authorize notifications beyond seven days.

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
document is `{"type":"doc"}`), distinct `weekdays` (0 is Sunday), and an IANA
`timezone` in `value`, plus an `idempotencyKey`. `time` is optional; do not invent
a clock time from a soft preference. Use supported `preferredTime` and
`recurrenceIntent` fields to preserve intent, and inspect their returned status.
If required weekdays are unresolved, clarify them rather than inventing a fixed
pattern. Saving a template does not create occurrences or Calendar events.

Retain the returned routine ID, revision and request. After uncertain success,
replay the identical request and key; do not generate another identity. Report
the saved template separately from any subsequent planning. If creation is not
discoverable, keep an explicit unsaved proposal.

## Routine coverage

When this authorized planning operation needs new fixed routine instances, use the [explicit routine planning contract](../contract.md#explicit-routine-planning). Reuse the prior request receipt when coverage is already planned. Ordinary context reads and unchanged plans do not require another materialization command.
