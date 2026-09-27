---
name: meos-weekly-review
description: Review priorities and capacity across the next 14 days when the user requests weekly planning or a configured weekly review fires; composes board decisions and schedules only within existing authority.
---

# Weekly review + 14-day look-ahead

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Suggested participation: 20–30 minutes. Use for strategic weekly reconciliation and forward planning, not every calendar update.

1. Perform the weekly estimates-versus-actuals reflection: compare original estimates, planned slots and evidenced actuals, retain unknowns and confidence, and propose useful future-estimate adjustments without rewriting history. Do not treat elapsed slots as completion. Load priorities, open commitments, waiting-for items, routines and the next 14 days of availability. Record incomplete coverage and stale sources.
2. Reuse recent review progress. Invoke [Walk the board](../meos-walk-board/SKILL.md) for consequential decisions; invoke [Clean the board](../meos-clean-board/SKILL.md) only when hygiene obstructs them. Do not repeat decisions those procedures already captured.
3. Choose a few meaningful outcomes with the user or existing priority policy. Surface conflicts between deadlines, dependencies and available capacity; do not silently rewrite priority order.
4. Look for missing next actions, preparation, travel, follow-ups, routine coverage and commitments without enough capacity. Distinguish these from healthy slack. Review deadlines beyond the window only when they require preparation within it.
5. Interpret natural-language routine intent as frequency targets, soft preferred times and explicit hard rules. Build a rough capacity-aware weekly/day arrangement on the dedicated MeOS calendar, protecting rest and fixed commitments and leaving deliberate slack. Experiment/revise within the installation’s standing authority. Future blocks, including tomorrow and week two, default to TENTATIVE; use only supported schema representation or retain an explicit proposal. Explicitly defer or leave unscheduled work that does not fit.
6. Apply and verify authorized revision-checked changes; do not commit the whole look-ahead. Target-day commitment belongs to the prior-night preparation or day-of launch, with fresh capacity checks. Respect Google-wins reconciliation without losing MeOS-only notes, estimates or history. Planning farther ahead does not authorize notification scheduling beyond seven days.

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
