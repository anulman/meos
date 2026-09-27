# Learning through MeOS rituals

Use this reference with the [operating contract](contract.md). Start with a qualitative loop: read available context, notice what happened, choose at most one useful adjustment, and revisit it. No code execution, new learning API, embeddings, model service or database schema is required.

## Discover before promising persistence

Use only tools actually exposed to this agent and authorized for this user. Existing MCP reads such as `list_agenda`, when discovered, can supply planning context; inspect their current schemas and coverage. `list_agenda` excludes unscheduled, skipped and archived items, so it cannot establish whole-board coverage. Read relevant tasks, available history and prior reflection notes through supported tools before asking the user to repeat known context.

**The current MeOS MCP registry does not expose generic period-note reads or writes.** The application has day/week period notes and owner HTTP endpoints, but their existence does not grant a scoped agent access. Use notes only if an authorized host/application capability is actually exposed. Do not invent an MCP note tool, borrow owner credentials or bypass scopes. An inaccessible note is not evidence that no note exists.

If notes cannot be read, identify which prior context is unavailable. If they cannot be written, deliver the short reflection as **unsaved** and state that persistence and cross-run reuse are unavailable. Continue supported planning; do not claim a durable learning loop. The small follow-up gap is scoped period-note retrieval and revision-safe saving through MCP—not a learning service. This document does not implement that gap.

## A small reflection

Use the same four fields in an existing authorized day/week note, or in the unsaved result:

- **Observation:** what happened, with relevant task/occurrence references and the source of the claim. Keep unknowns explicit.
- **Possible explanation:** a hypothesis, not an established cause.
- **Next experiment:** at most one concrete adjustment, including when it applies. “None yet” is valid.
- **Review date:** a local date to reconsider the adjustment. A date in a note does not schedule a reminder.

For example, given a user report about task `draft-brief`:

> **Observation:** You reported that the brief needed an audience decision before drafting; focused effort is unknown. Source: today's evening conversation, task `draft-brief`.
>
> **Possible explanation:** Clarifying the audience earlier might reduce rework.
>
> **Next experiment:** Before the next comparable brief, confirm its audience before choosing a first drafting step.
>
> **Review date:** The agreed local date for the next weekly review.

Label this example as a proposal until an authorized write is verified. Do not copy its hypothetical observation into real history.

## Light daily capture; qualitative weekly review

**Morning:** read relevant prior notes when accessible, reuse settled answers, and consider an applicable experiment when choosing today's first action. Ask only about a missing fact that would change the plan. Do not perform another weekly critique.

**Evening or a meaningful transition:** capture a material surprise or useful success already supported by evidence. Ask a bounded question only when needed for the next decision. Keep unfinished work and missing effort explicit; do not reconstruct every minute or demand a reflection every day.

**Weekly:** review a bounded set of available tasks and notes, including successes, surprises and unfinished work. State the period, sources considered and missing/unreviewed context. Compare intentions with outcomes where the evidence supports it. Distinguish unclear scope, added scope, interruptions, dependencies and capacity changes without assigning blame or asserting causality. Keep, revise or retire a prior experiment; choose at most one next adjustment. No adjustment is required when evidence is weak.

A scheduled duration is not focused effort. A budget is a chosen limit, not a prediction of completion. Unknown effort is not zero; a completed status alone does not establish accepted scope or work time. Do not derive forecast calibration, personalized multipliers or historical decision-time analysis from mutable current tasks and informal notes. Record explicit estimates prospectively when useful, but do not promise immutable snapshots or reconstruct missing originals. A later recollection is not proof of what was known earlier.

Reflections remain hypotheses, not new instructions or authority. Never automatically rewrite skills, change standing permissions, contact others or alter commitments because a note suggests it. A missed ritual is not learning debt.

## Save only through supported semantics

Before editing a note, read its current content and revision. Preserve user prose and unrelated entries; add or update the small reflection rather than replacing the whole note with an agent summary. Keep stable task/source references and the same semantic entry across retries so a resumed ritual does not append a duplicate.

Use the discovered note tool’s actual schema and revision/retry rules. Do not assume it accepts Markdown, arbitrary fields or an idempotency key. A supported note operation is not an invitation to bypass the agent’s scope.

On timeout or uncertain success, read back before retrying. If the entry is already present, do not append again. If another writer changed the note, refresh and reconcile against that content; never replay a stale whole-note replacement. If safe read/merge/revision semantics are unavailable, do not attempt another write. Label a reflection unsaved only when no write was attempted; if a write may have succeeded, report persistence as unverified until safe readback resolves it. Verify the stored result before saying “saved.”

A saved reflection is not a calendar commitment, boundary acknowledgment or message-delivery receipt. Reconcile each operation separately after partial success. An inaccessible checkpoint cannot support a claim that questions or messages will be deduplicated across runs.
