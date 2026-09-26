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

## Learning at launch

Retrieve the [learning-loop reference](../learning-loop.md), last evening's resolved questions and applicable lessons. Check only material changes to today's scope, definition of done, dependencies and capacity. Distinguish a chosen time budget from a forecast of completion. Use comparable history when an estimate genuinely needs revision; retain the prior estimate and reason. Do not reopen stable answers or run another weekly review.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const context = await meos.learning.context({
  taskIds: todayTaskIds, knownAt: decisionAt,
  include: ["request", "scope", "forecast", "budget", "answers", "evidence"], limit: 12
});
const lessons = await meos.learning.lessons({
  taskIds: todayTaskIds, knownAt: decisionAt, states: ["trial", "retained"], limit: 2
});
return { context, lessons,
  questions: learning.questions(context, { decision: "plan-day", max: 1 }) };
```

Reuse the prior-night commitment receipt independently of any learning note. Missing learning capabilities do not prevent supported, safe launch work; report which context could not be checked.

**Result:** a compact view of today, its essential outcome, first action and main risk. Do not recite the backlog or ask again for decisions already saved.
