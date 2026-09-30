---
name: meos-bootstrap
description: Install or maintain MeOS from a verified supported release; enable selected features, diagnose or repair partial setup, and configure application access, operating schedules and event delivery without resetting working state.
---

# Install MeOS and bootstrap its agent

Use when a user's agent should install MeOS from scratch or finish configuring an existing installation, including its operating skills. Reading this document alone authorizes no installation or side effects. Use supported host tools within existing authority; do not add a MeOS callback framework or invent deployment or MCP operations.

A user's bootstrap request covers the necessary supported installation and configuration dependencies of the requested setup, within that user's existing authority and standing constraints. Reconcile working components, then complete missing authorized MCP access, event listener and durable dispatcher/worker setup when included in that scope; discovery alone is not completion. Do not ask again for authority already granted. For a genuinely missing grant or decision, prepare the concrete supported changes first and ask only for that exact permission or choice, stating why it is required. Missing packaging or implementation is not a permission question: report the concrete capability gap and, when coding is authorized, assign an implementation owner instead of inventing production infrastructure. Preserve independent qualification and human-only release gates. Use supported, reversible defaults and make a recommendation when the environment or established preferences resolve the choice; proceed within authority instead of silently waiting for unnecessary decisions. Surface real blockers with their next action and owner, and continue independent work.

## Keep one completion checklist

Before installation work, create or resume one checklist in the durable host
installation ledger. Retain the user's full requested outcome and its authority
limits across turns, delegated tasks and separate runbooks. Use existing durable
host records; this procedure requires no MeOS schema, receipt API or new polling
service. If durable storage is unavailable, report that blocker instead of
claiming resumable setup.

List each requested component and its installation and verification steps. Use
the stages below to select the applicable work:

| Component | Steps to track separately |
| --- | --- |
| Persistent application | Release/artifact admission, configuration/storage, activation, owner login, restart/persistence proof |
| MCP access | Installation, doctor/protocol, personal tool call, scheduled tool call, applicable authentication lifecycle proof |
| Operating agent | Skill/authority configuration and each requested schedule's registration, readback and execution proof |
| Event delivery | Listener installation, durable outbox/dispatcher installation, supervision, actual handoff/handling, restart/replay and authorized delivery proof |
| Selected integrations | Each requested Calendar, backup, reflection or search setup and its own verification steps |

Track optional features only when selected; record exclusions without turning
them into blockers. Do not run real rituals or send test messages merely to fill
a checklist: preserve each stage's proof restrictions and mark unavailable live
proof explicitly unverified.

For **every step**, retain:

- **Actual state and evidence:** what is installed/configured, what was observed,
  when it was checked and a non-secret proof reference. Source code, a published
  PR, an enabled service or queue acceptance does not prove runtime completion.
- **Next action and blocker:** the exact missing action or proof, including any
  independent qualification, human merge, release or deployment gate.
- **Execution owner:** the responsible actor and accepted session/job/run ID when
  work is delegated; distinguish queued, running, waiting, blocked, paused and
  completed from verified execution evidence. Record no active owner explicitly.
- **Delivery route:** where the owner returns completion/failure, who consumes it
  and how the user receives the result. Keep delivery confirmation separate from
  installation proof.

Update the checklist after each step and before every handoff. A child's success
closes only its evidenced steps, not the combined request. The parent must consume
that checkpoint, reconcile actual effects and continue the remaining authorized
work or assign it to an accepted owner with a configured result route. A narrower
MCP-only handoff must not discard an already-requested listener or dispatcher.
Removing a step from scope requires the user's decision, not a worker's narrower
assignment.

Before yielding, account for every unfinished step: accepted execution ownership,
or an exact external decision/capability blocker with a responsible actor and next
action. A saved plan is not execution; if no work is running, say so. At the next
checkpoint or supported completion/failure event, reconcile the owner and resume
eligible work within existing authority. Do not bypass a human gate, invent a
watchdog or rely on another user prompt to remember the remaining steps.

## Follow the selected setup path

Start with real days, not a demo-versus-install choice. For a new personal setup,
load one step at a time in this order. For an existing setup, reconcile the ledger
and resume the first incomplete applicable step; do not replay successful work.

| Step | Load | Completion checkpoint |
| --- | --- | --- |
| 1. Settle consequential choices | [Guided setup conversation](conversation.md) | Access/hosting, Calendar, authority, cadence and quiet hours chosen or explicitly deferred; host capabilities checked |
| 2. Establish persistent access | [Application](application.md) | Owner login, persistence and selected MCP/Calendar proofs recorded separately |
| 3. Configure selected assistance | [Agent](agent.md) | Selected skills/jobs configured with limits; personal and scheduled capability proofs tracked |
| 4. Enable events, if selected | [Event delivery](events.md) | Listener, durable handoff, supervised processing and required replay/delivery proofs |
| 5. Make a useful first plan and close | [First plan](conversation.md#choose-the-first-planning-horizon), then [verification](verify.md) | Relevant planning result delivered; each selected capability verified or exact blocker assigned |

Keep the checklist above in context at every stage. Record optional exclusions;
load [recovery](recovery.md) only when selected or required by an existing-instance
migration. Do not put optional backup implementation ahead of ordinary setup.
Load [reflections](reflections.md) when the active planning request needs it.
For inspect, repair, update, pause or removal, begin with [maintenance](maintain.md)
and load only affected stages. These are reading paths, not a new workflow service.

## Installation target

The current shipped path is Linux/systemd with a Docker native runtime and a
protected web adapter. It is not a portable production installer: another host
needs reviewed configuration support and qualified artifacts. Reuse a verified
instance when available. See [application prerequisites](application.md#installation-target)
and the [host/MCP runbook](host-mcp.md); never replace missing packaging with the
root demo Compose file or copied owner identifiers.

## Stage 4 — Configure the operating agent

Continue in [agent setup](agent.md) after verified persistent access. This section
retains the existing entry link; installation, invocation, scheduled access and
user-visible delivery remain separate proofs.

### Configure per-install planning authority

Use the [authority procedure](agent.md#configure-per-install-planning-authority).
Cadence and quiet hours do not grant planner mutations. Reuse an existing grant;
never copy another owner's policy.
