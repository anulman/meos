---
name: meos-morning-launch
description: Prepare today and the first concrete action when the user asks for a morning plan or a configured morning launch fires; reuses last evening’s decisions and highlights changes rather than the entire backlog.
---

# Morning launch

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Suggested participation: 3–5 minutes. Use to start the day; use rescue-day for a disruption after the day is underway.

1. Load last evening's plan and shared progress; read today's commitments, flexible blocks, outstanding decisions and freshness. If the evening close was missed, reconcile only what affects today rather than requiring a separate overdue ritual.
2. Check changes since the plan: conflicts, preparation/travel, deadlines and available capacity. Ask about energy or constraints only when unknown and material; do not make a repetitive daily questionnaire.
3. Confirm the essential outcome and identify a concrete, startable first action. Break an unclear action into a small step when useful, without creating an unapproved cascade of tasks.
4. Reuse the prior-night target-day commitment receipt. If it was missed, automatically commit today’s feasible plan under recorded standing authority after current-revision/capacity checks, using supported transition and idempotency semantics. Do not duplicate or recommit an unchanged plan. Missing commitment support leaves an explicit proposal/blocker. If the day does not fit, repair authorized MeOS blocks or present the smallest material trade-off; never silently commit an infeasible draft or change imported commitments. Reuse [Rescue the day](../meos-rescue-day/SKILL.md) for meaningful changes. Verify applied changes; future-day blocks remain tentative.
5. Record today's decision and first action for later boundaries and evening close. In quiet mode, send only an actionable exception or an explicitly requested launch prompt.

## All-day context

Before making the planning decisions above:

- Read cached Calendar context for today through `list_calendar_events`
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

## Learning at launch

Read the [learning-loop reference](../learning-loop.md) and relevant prior notes through authorized tools, if exposed. Reuse settled answers; check only material changes to scope, dependencies and capacity. Consider an applicable experiment when choosing the first action, without repeating weekly review. A budget is not a completion forecast. If notes are inaccessible, report the missing context. Label a reflection unsaved when no write was attempted; if a write may have succeeded, report persistence as unverified until readback resolves it. A note is not a target-day commitment receipt.

**Result:** a compact view of today, its essential outcome, first action and main risk. Do not recite the backlog or ask again for decisions already saved.

## Search supporting context

Use the [search reference](../search.md) when related work or prior reflections could change a decision. Search is supporting evidence, not a replacement for exact agenda or Calendar reads.

## Routine coverage

When this authorized planning operation needs new fixed routine instances, use the [explicit routine planning contract](../contract.md#explicit-routine-planning). Reuse the prior request receipt when coverage is already planned. Ordinary context reads and unchanged plans do not require another materialization command.
