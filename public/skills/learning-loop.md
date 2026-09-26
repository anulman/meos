# Learning through MeOS rituals

Use this reference with the [operating contract](contract.md). The skills carry the method; each user's **SQLite-backed MeOS history** carries their observations, decisions and lessons. No eval service, separate analytics database, direct SQL access or sandbox is required to start. Read and record only through discovered, authorized MeOS tools.

## Three questions, not one score

- **Interpretation:** did we understand the requested outcome, scope and definition of done? Which assumption or unanswered question mattered?
- **Effort:** how much focused work did that understood scope require? Compare completion forecasts with evidenced effort, not calendar occupancy.
- **Capacity:** did the day leave enough usable time, preparation and slack? Interruptions, waiting and changed priorities are not automatically bad estimates.

A **budget** is a chosen spending/participation limit. A **forecast** predicts effort to achieve a stated outcome, preferably as a range. A 30-minute writing budget does not promise a finished article. A scheduled slot is neither an effort observation nor a completion forecast. Preserve these meanings even when the current tool represents them as notes rather than distinct fields.

## Keep a small decision record

For consequential planning decisions, preserve the original request or its source reference, decision timestamp and context available then, task/occurrence identity, scope and definition of done, original effort forecast/range, budget if any, assumptions, questions and answers, and the selected next action. Append later revisions with reasons; do not replace the original with hindsight. Reuse existing records rather than transcribing entire conversations.

At meaningful transitions, attach evidence: focused effort when actually observed/reported, elapsed time separately, outcome and acceptance evidence, scope changes, interruptions, dependencies, rework and priority changes. Keep source, observed/reported time, recorded time, confidence and missingness. A later recollection can inform reflection but was not known at the earlier decision. Unknown is not zero. Calendar duration, location, a boundary or a task status alone cannot establish focused effort or accepted completion. Partial effort is a lower bound, not total effort.

These are conceptual record requirements, **not a new database schema**. Map to discovered structured fields or supported durable notes/review state with source references. If a required read/write is unsupported, report that gap and retain an explicit proposal through available durable tools; do not invent an API field or claim persistence. Without durable state, provide the bounded result and say cross-run learning/resumption is unavailable.

## Retrieve, infer, or ask

Before asking, retrieve available task context, prior answers and relevant lessons. Missing context in this prompt is not necessarily missing from MeOS. Distinguish a fact from a tentative interpretation. Infer only when the decision is low-cost/reversible and the assumption can remain explicit; ask when an unresolved answer could materially change the outcome, authority, sequence or feasible plan. Weigh decision value against interruption cost. Do not turn every missing field into a questionnaire.

Record the question's purpose and whether its answer changed a decision, when known. At weekly review, examine both useful questions and avoidable interruptions, plus important ambiguities left unasked. A hindsight-discovered ambiguity is a candidate lesson—not proof that asking would have helped. Check what was knowable then. Reuse stable answers until material context changes; do not ask morning what evening already settled.

## Weekly learning, light daily capture

1. Select comparable cases by work kind, outcome/scope and relevant constraints—not just matching titles. Include successes, surprises, unfinished work and unknown outcomes in coverage. Only eligible completed, scope-comparable cases with adequate effort evidence enter completion-forecast error summaries. Report exclusions and denominators; do not quietly select only successes or only overruns.
2. Separate interpretation misses, original-scope effort error, scope growth, interruptions, dependencies, rework and capacity/priority changes. Causes can coexist; preserve uncertainty and do not claim causal proof from an association. Where effort cannot be attributed between old/new scope, do not calculate original-scope estimation error.
3. Inspect individual cases alongside medians/ranges and evidence coverage. Sparse or dissimilar history supports a tentative example, not a personalized multiplier. Never inflate every estimate from one overrun. Distinguish observed variation from uncertainty in the small sample.
4. Bring the user's corrections or acceptance judgments into the assessment; model judgments remain hypotheses until calibrated against that evidence. Do not repeatedly demand ratings or equate silence with acceptance.
5. Propose **one small contextual experiment**, if the evidence warrants one: for example, retrieve the intended audience before estimating a writing task. Record supporting cases, the condition where it applies, expected benefit, burden, and how a later comparable episode will count for/against it. No new experiment is required when evidence is inadequate.
6. On later episodes, freeze the decision-time forecast/context and the experiment version before observing the result. Evaluate prospectively; never use later answers to make an earlier interpretation appear better. Compare against prior comparable cases cautiously, reporting coverage and confounders rather than claiming an A/B result. Retain, revise or retire the hypothesis after review; do not automatically rewrite skill instructions or convert a hypothesis into standing authority.

Daily rituals retrieve relevant lessons and capture material surprises. Evening closes gaps and prepares tomorrow; weekly review owns estimation critique. A missed ritual is not learning debt.

## Ideal code-mode design — not a runnable API

The examples here and in the skills describe **future query ergonomics**, not shipped functions, schemas or sandbox support. `meos.learning` is a conceptual, account-scoped facade over authorized history, not direct SQLite access. No runtime or dependency is selected by this design. Until implemented, discover ordinary tools and compose equivalent bounded reads and supported writes; unavailable history limits the result, not all useful planning. Never send these examples to an execution tool merely because they appear here.

Each example assumes `zone` is the verified IANA timezone, `decisionAt` is an ISO instant from the current decision, and IDs come from discovered state. `calendar.day(date, zone)` and `calendar.days({ through, count, zone })` denote local calendar windows with inclusive start/exclusive end instants; `through` is an included local date. They respect DST, not fixed 24-hour arithmetic. These helpers are also design-only. In weekly code, `reviewDate` is the user's local review date.

### A small read vocabulary

```ts
// DESIGN ONLY. All result envelopes include coverage; no silent truncation.
const context = await meos.learning.context({
  taskIds, knownAt: decisionAt,
  include: ["request", "scope", "forecast", "budget", "answers", "evidence"],
  limit: 20
});
const cases = await meos.learning.episodes({
  window: calendar.days({ through: reviewDate, count: 42, zone }),
  knownAt: decisionAt,
  comparableTo: taskIds, // use context then available; expose match rationale
  select: ["decision", "revisions", "effort", "outcome", "causes"],
  limit: 60
});
const lessons = await meos.learning.lessons({
  taskIds, knownAt: decisionAt, states: ["trial", "retained"], limit: 3
});
```

- `context` accepts either `taskIds` for task-level context or `occurrenceIds` for exact occurrence context, never both. It returns `items` with explicit task/occurrence and episode identities, requested projections, source references and revisions. A task-level read must not select an arbitrary occurrence: return task-level facts and identify any unresolved occurrence selection. Boundary reads use the verified occurrence ID. `answers` includes supported question purpose, source checks, asked/resolved timestamps, resolution, applicability and whether the answer changed a decision; unavailable history remains explicit. Superseded answers remain history. `knownAt` excludes records not yet available at that instant, including backdated observations recorded later.
- `episodes` returns bounded `items`, match rationale and coverage. Its window selects decision timestamps; it includes subsequent revisions/outcomes only if known by `knownAt`. The `decision` projection includes the frozen scope/forecast/context, selected action and any applicable experiment ID/version and exposure timestamp recorded before the outcome; absent exposure remains unknown, not proof the experiment was used. It also includes available question/source-check history and decision effects, with missingness disclosed. For a retrospective cohort queried today, use each episode's frozen `decision` snapshot when judging the original choice. `comparableTo` is optional; omit it for a broad review, then group by reference class rather than mixing tasks. Matching is inspectable, not evidence of causality.
- `lessons` returns contextual hypotheses with applicability, supporting case IDs, version, status and later test results—not new permissions or unquestionable facts. Empty results are valid.
- Every envelope carries `coverage`: requested scope/window, returned count, eligible count if knowable, excluded counts/reasons, missing/unavailable fields, freshness and `nextCursor` or explicit truncation. Fetch further pages only within the ritual budget; otherwise disclose partial coverage. Limits bound returned rows; a limit is not proof that the whole history was examined. Joined/computed outputs preserve source coverage.

### Local composition and units

`learning.summarize` is a conceptual **pure** helper over retrieved episodes, not a hidden second data fetch. `learning.questions` is a pure prioritizer over retrieved context, not a source of new facts. Their inputs are envelopes so missingness follows the computation.

```ts
const reflection = learning.summarize(cases, {
  by: ["referenceClass"],
  measures: ["focusedMinutes", "forecastErrorMinutes", "withinForecastRange"],
  include: ["successes", "surprises", "causeCounts", "coverage"]
});
return { reflection, lessons, coverage: cases.coverage };
```

For each group, return sample count per measure, median and observed min/max where meaningful, cause counts (non-exclusive), and excluded/unknown counts. `focusedMinutes` uses adequately evidenced total focused effort, never elapsed minutes. `forecastErrorMinutes` is actual minus original point forecast in minutes; if only a range exists, report range coverage rather than inventing a midpoint. `withinForecastRange` reports eligible count and count inside the **original** range; a stated range without a probability is not a calibrated 80% interval. Exclude budget-only, incomplete-effort and changed/unattributable-scope cases from these forecast measures while retaining them in review coverage. Do not emit quantiles or ratios that the evidence cannot support.

```ts
const questions = learning.questions(context, {
  decision: "choose-next-action", // also estimate, plan-day, or reconcile-outcome
  max: 1
});
return { questions, coverage: context.coverage };
// Each candidate: question, unresolved fact, source checks already made,
// decision affected, why asking beats an explicit assumption, interruption cost.
// No candidate is a valid result. A resolved/reusable answer is not a candidate.
```

The prioritizer offers candidates, not automatic messages or a numerical oracle. Human judgment, current mode and authority still decide whether to interrupt.

### Recording without pretending a script is a transaction

Conceptually, `meos.learning.record` accepts one evidence observation, decision revision, question resolution, or hypothesis with stable episode/source identity. The final schema is deferred; use only current discovered equivalents. Ordinary writes have the same constraints as future code mode:

```ts
// DESIGN ONLY; learningEntry is a bounded, provenance-bearing record above.
const receipt = await meos.learning.record(learningEntry, {
  expectedRevision, idempotencyKey: `${episodeId}:${sourceEventId}:${entryKind}`
});
return { operationId: receipt.operationId, status: receipt.status };
```

A key identifies the same semantic operation across retries and rituals, not an entire week's edits or a fresh invocation. Here `entryKind` distinguishes an observation from a question resolution from the same source; the shared episode/source identity must survive workflow changes. Distinct observations need distinct identities. Verify the stored result and preserve its receipt. On a changed value, use a distinct revision/operation identity rather than reusing a key for different content. On timeout, retrieve operation/live state before retrying. A script is **not atomic**: if a note succeeds and a schedule edit fails, retain the note receipt and reconcile only the unresolved edit. Concurrent rituals must use supported claims/revisions and shared episode/question identities; absent safe semantics, withhold affected automated writes and report the limit. Learning writes never authorize calendar mutations, third-party messages, new schedules or skill rewrites.
