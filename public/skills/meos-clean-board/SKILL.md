---
name: meos-clean-board
description: Perform bounded task-board hygiene when captures, duplicates, stale entries or missing fields obstruct planning; reconciles evidenced state but does not silently reprioritize, delete or declare completion.
---

# Clean the board

**Required:** retrieve and follow the [shared operating contract](../contract.md) through a URL/resource tool before executing. Discover actual MCP/host capabilities; these procedures do not enable integrations or schedules.

Use for data hygiene, not priority decisions. Start with an explicit scope or a bounded slice of current captures/active work; report scope and exclusions.

1. Load the chosen slice and any previous cleanup cursor/checkpoint. Identify untriaged captures, likely duplicates, stale entries, unclear next actions, missing estimates and inconsistent known status.
2. Distinguish evidence from suspicion. Similar names do not prove duplicates; age does not prove irrelevance; a past scheduled slot does not prove completion. Missing estimates remain unknown until supplied or clearly labeled as proposed estimates.
3. Apply unambiguous, authorized corrections through tools. For likely duplicates, ambiguous status, merges, deletions or consequential field changes, record a proposed correction or ask for a real decision according to existing authority.
4. Do not silently change priorities or schedules, mark work complete, delete captures, or edit routine templates. Route substantive “does this still matter?” decisions to [Walk the board](../meos-walk-board/SKILL.md).
5. Verify mutations, persist unresolved issues and a resume checkpoint, and state what was intentionally left untouched. Avoid repeating the same unresolved question across rituals.

## Preserve learning evidence

Use the [learning-loop reference](../learning-loop.md) to preserve original requests, estimates, revisions, answers and provenance during cleanup. Similar titles do not make two effort episodes duplicates. Keep unknowns explicit; a missing actual is not zero and a scheduled block is not evidence of work. Propose ambiguous identity repairs instead of merging away history.

**Ideal query — design only; use discovered ordinary tools today:**

```ts
const context = await meos.learning.context({
  taskIds: cleanupSliceIds, knownAt: decisionAt,
  include: ["request", "scope", "forecast", "budget", "answers", "evidence"], limit: 20
});
return { items: context.items, coverage: context.coverage };
```

Inspect missing fields/source links, not just empty values. Route substantive questions to the shared unresolved-question record and walk/weekly decision flow; do not perform an independent estimation review or ask every missing-field question during hygiene.

**Result:** reviewed scope, verified hygiene changes, unresolved candidates and excluded/unreviewed work. A clean-looking board is not proof that all work was reviewed.
