---
name: meos-evening-close
description: Reconcile today and prepare tomorrow when the user requests shutdown or a configured evening close fires; captures actuals and gives unfinished work explicit dispositions without automatic rollover.
---

# Evening close + tomorrow prep

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Suggested participation: 5–10 minutes. Use for closing the day, not for assuming scheduled work was completed.

1. Load today's planned slots, recorded actuals/outcomes, captures and prior review decisions. Preserve original estimates and planned history; distinguish missing observations from failures.
2. Reconcile known outcomes using fresh evidence: distinguish intention, travelling and settled/engaged activity, with confidence and uncertainty. Ask only about material unknowns; leave other outcomes explicitly unknown. Capture concrete follow-ups without falsely marking source work complete. Keep estimates-versus-actuals reflection for weekly review; discuss only urgent actionable reflections tonight.
3. For each relevant unfinished item, choose continue, reschedule, unschedule or drop using existing authority or a necessary user choice. Do not automatically move all work to tomorrow, silently delete it or rewrite a routine template.
4. Inspect tomorrow's commitments, preparation and realistic capacity. Propose a feasible plan and first concrete action; preserve protected time and slack. Leave excess work explicitly deferred/unscheduled.
5. Under recorded standing authority, automatically commit tomorrow’s feasible execution plan now as the prior-night preparation for that target day, using actual supported state transitions. Recheck current revision/capacity and prior receipts before applying; never commit an infeasible draft silently. This commits only tomorrow, not the entire 14-day look-ahead; other future blocks remain tentative. If commitment is unsupported or a material trade-off remains, save an explicit proposal/blocker. Verify applied changes and save the target date, revision and receipts for idempotent morning catch-up. Persist unresolved questions once so morning does not repeat answered ones.

## Capture without a nightly critique

Use the [learning-loop reference](../learning-loop.md) to reconcile only material gaps. Preserve evidence of effort and accepted outcomes separately; leave unobserved effort unknown. Record changed scope, interruptions or blockers when already known or worth one useful question. Save tomorrow's outcome, assumptions and answers for morning reuse. Do not ask for minute-by-minute reconstruction or critique estimation every night.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const context = await meos.learning.context({
  taskIds: [...todayTaskIds, ...tomorrowTaskIds], knownAt: decisionAt,
  include: ["scope", "forecast", "budget", "answers", "evidence"], limit: 20
});
return { context,
  questions: learning.questions(context, { decision: "reconcile-outcome", max: 1 }) };
```

Record only new evidence/resolutions using the shared receipt and retry rules. A successful outcome note is not a successful target-day commitment; verify each separately. Save unresolved gaps once instead of asking again on every resume.

**Result:** known outcomes and actuals, follow-ups, unfinished-work dispositions, tomorrow's first action and any necessary decision. A missed close is absorbed into the next launch, not accumulated as review debt.
