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

## Learning pass

Use the [learning-loop reference](../learning-loop.md) before step 1. Review both successful and surprising cases; separate misunderstood outcomes, original-scope effort error and changes to the day. Preserve the original forecast. Show comparable-case counts and missing evidence, not a universal correction factor. For forward planning, retrieve relevant lessons and choose at most one contextual experiment with a later review criterion. Record what was knowable at each decision; later answers cannot improve an earlier score retroactively. Reuse walk/clean progress and ask only a decision-changing question.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const cases = await meos.learning.episodes({
  window: calendar.days({ through: reviewDate, count: 42, zone }),
  knownAt: decisionAt,
  select: ["decision", "revisions", "effort", "outcome", "causes"], limit: 60
});
const lessons = await meos.learning.lessons({
  taskIds: nextFortnightTaskIds, knownAt: decisionAt,
  states: ["trial", "retained"], limit: 3
});
return {
  reflection: learning.summarize(cases, {
    by: ["referenceClass"],
    measures: ["focusedMinutes", "forecastErrorMinutes", "withinForecastRange"],
    include: ["successes", "surprises", "causeCounts", "coverage"]
  }), lessons
};
```

Use the bounded summary to select cases worth discussing, not to assign blame. A reference class with one case or poor coverage is a hypothesis source, not a calibrated forecast. Save the review window, considered case IDs and experiment version with the checkpoint so reruns do not invent a second experiment or repeat delivered questions.

**Result:** chosen priorities/outcomes, verified scheduled blocks, explicit deferrals, identified gaps and a short unresolved decision list. Persist a checkpoint if the review is interrupted rather than restarting it.
