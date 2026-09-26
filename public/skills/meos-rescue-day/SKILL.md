---
name: meos-rescue-day
description: Repair a disrupted day after lateness, an overrun, low energy or a new commitment; preserves fixed/protected time and moves the smallest authorized set of flexible blocks.
---

# Rescue the day

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Use on a meaningful disruption or an explicit “help me recover today” request, not after every routine state update.

1. Identify the disruption and remaining usable time from current state. Ask only for a missing constraint that changes the repair; do not assume low energy means every commitment should move.
2. Preserve fixed commitments, protected rest, travel/preparation and recorded priority order. Separate genuinely flexible blocks from commitments whose changes require a decision.
3. Find the smallest feasible change set. Prefer keeping unaffected blocks stable; show what would move, what would shrink only if authorized, and what no longer fits. Do not reshuffle the whole week automatically.
4. If no feasible plan meets all constraints, explain the concrete trade-off and ask for the necessary choice. Leave excess work explicitly unscheduled/deferred instead of hiding overload.
5. Preview, apply and verify authorized revision-checked changes. Preserve estimates versus actuals and occurrence history. Reconcile uncertain writes before retrying.
6. Save the revised first action and dispositions so the next boundary, evening close and morning launch reuse them.

## Diagnose before resizing

Use the [learning-loop reference](../learning-loop.md) to distinguish original-scope effort, added scope, interruption, dependency and priority changes. More elapsed time does not identify the cause. Reuse prior answers, retrieve available context first, and ask only what changes the repair. Resizing a block changes today's budget/capacity allocation, not the original completion forecast. Record the reason and preserved scope; do not teach a global estimate multiplier from a disrupted day.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const context = await meos.learning.context({
  taskIds: affectedTaskIds, knownAt: decisionAt,
  include: ["request", "scope", "forecast", "budget", "answers", "evidence"], limit: 10
});
const lessons = await meos.learning.lessons({
  taskIds: affectedTaskIds, knownAt: decisionAt, states: ["trial", "retained"], limit: 2
});
return { context, lessons,
  questions: learning.questions(context, { decision: "choose-next-action", max: 1 }) };
```

Use the evidence to choose the smallest repair through actual scheduling tools. Learning history does not expand authority or make imported commitments writable.

**Result:** a workable next action plus a concise change summary and explicit deferrals. No promise of new notifications without verified platform support/receipts.
