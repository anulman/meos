---
name: meos-walk-board
description: Review active work, waiting-for items, commitments and backlog to make deliberate next-action and capacity decisions; used on demand or by weekly review, not as a status recital.
---

# Walk the board

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Use for decisions about work. Weekly review composes this procedure rather than independently repeating its questions.

1. Establish review scope and load prior decisions/checkpoints, priorities, capacity and live task state. Review active work first, then blockers/waiting-for items, upcoming commitments, and the relevant backlog. Explicitly report any portion not reviewed.
2. For each relevant item, determine: does it still matter; what concrete next action advances it; what blocks it; and is there capacity? Reuse existing answers. Do not force a choice for every backlog item if a bounded review is sufficient.
3. Expose dependency/deadline conflicts and waiting-for items needing a follow-up. Draft or record a follow-up action; contacting another person requires existing authority, not merely the existence of a blocker.
4. Make or request explicit decisions: keep, clarify, break down, defer, schedule or drop. Respect standing priority order and mutation authority. When an item needs only hygiene, use [Clean the board](../meos-clean-board/SKILL.md) without duplicating review progress.
5. Preview capacity-aware scheduling changes where needed; do not force every retained item onto the calendar. Apply only authorized decisions, verify and persist their rationale plus outstanding choices.

## Interpret the work once

Follow the [learning-loop reference](../learning-loop.md). Retrieve original intent, definition of done, prior answers and applicable lessons before choosing a next action. Surface a missing audience, deliverable or dependency only when it changes a decision. Reuse resolutions across walk, weekly, evening and morning; one shared unresolved question is not four prompts. Separate a proposed interpretation from an accepted scope revision.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const context = await meos.learning.context({
  taskIds: reviewSliceIds, knownAt: decisionAt,
  include: ["request", "scope", "forecast", "budget", "answers"], limit: 20
});
const lessons = await meos.learning.lessons({
  taskIds: reviewSliceIds, knownAt: decisionAt, states: ["trial", "retained"], limit: 3
});
return { context, lessons,
  questions: learning.questions(context, { decision: "choose-next-action", max: 1 }) };
```

If a consequential forecast needs support, compose a bounded `episodes` read with `comparableTo: reviewSliceIds` as defined in the reference. Do not ask the user to reconstruct facts already available to tools. Save coverage and decisions for weekly review instead of rerunning its learning pass here.

**Result:** decisions, next actions, blockers with a next step, explicit deferrals and remaining capacity conflicts—not a recital of statuses. Save coverage/checkpoint so a later weekly review resumes rather than repeats the walk.
