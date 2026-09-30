# Guide personal setup

Read the [bootstrap entry point](SKILL.md) and resume its one durable
[completion checklist](SKILL.md#keep-one-completion-checklist). Start with real
days. Reuse settled answers instead of making the user repeat an interview.

Ask one small group at a time. Recommend the smallest supported choice, explain
its consequence, and record the answer or explicit deferral before proceeding.
Use the host's structured question tool if available; ordinary chat is a complete
fallback. Never collect passwords, API keys or tokens in chat. Missing packaging
or host capabilities are implementation gaps, not questions the user can answer
with permission.

## 1. Access and hosting

Confirm the owner and local timezone. Ask whether the planner needs to work from
their phone and remain available when their laptop is off. Establish intended
devices and private/public access. Inspect existing installation and host
capabilities before recommending infrastructure; do not ask a novice to choose
Docker versus systemd or promise an unsupported alternative.

Record which environment can provide persistent storage, secure login, MCP,
skill discovery, durable scheduled execution, proactive delivery and optional
event listening. A model name establishes none of these capabilities. If an
existing verified instance is available, reuse it. Otherwise resolve the current
[application prerequisites](application.md#installation-target) and assign exact
packaging/configuration gaps before attempting deployment.

## 2. Calendar and planning boundaries

Ask which account and calendars should provide context, and identify the dedicated
MeOS calendar for managed blocks. Use the supported secure browser consent flow.
Calendar may be explicitly deferred; do not infer free time from missing context
or claim synchronization is active.

Explicitly choose proposal-only planning or authority to manage MeOS-owned blocks
within the user's constraints. Keep imported commitments read-only. Record the
answer independently of interaction style, using the
[planning authority procedure](agent.md#configure-per-install-planning-authority).
No sample plan, job installation, or quiet mode grants calendar mutations.

## 3. Cadence and contact

Offer a small starter rhythm: morning launch, evening preparation and weekly
review, adjusted to waking and working hours. Ask where the assistant should
reach the user, choose quiet hours and whether advance/start/end event messages
are useful, and capture missed-run behavior. Offer on-demand assistance when
preferred or when the host lacks supported proactive capabilities; label it as
such rather than promising reminders. Record how the user can pause owned jobs.

These decisions specify desired behavior, not verified installation. Continue
with [application setup](application.md), then only the selected
[agent](agent.md) and [event](events.md) stages. Each stage updates the same
checklist with evidence and its next action/owner; missing durable storage is a
blocker to resumable setup, not a reason to forget decisions.

## Choose the first planning horizon

Once usable access is established, ask: **“Would you like to talk about today,
tomorrow, this week, or next week?”** Reuse an explicit horizon already given.
Load the shared operating contract and only the applicable planning skill:

| Horizon | Procedure |
| --- | --- |
| Today | [Morning launch](../meos-morning-launch/SKILL.md), or [Rescue the day](../meos-rescue-day/SKILL.md) when a plan needs repair |
| Tomorrow | [Evening close + tomorrow prep](../meos-evening-close/SKILL.md), focused on tomorrow; do not invent today's actuals |
| This week | [Weekly review](../meos-weekly-review/SKILL.md), focused on the current week |
| Next week | [Weekly review + 14-day look-ahead](../meos-weekly-review/SKILL.md), focused on next week |

Collect one to three outcomes, essential routines, fixed commitments, work windows
and slack. Make a small useful proposal before collecting a complete life inventory.
Within recorded authority, save a real planning change and verify its Calendar
result when selected; otherwise deliver the proposal explicitly unwritten.
Keep the chosen horizon, settled decisions, receipts and next action durable so
an interruption resumes the same plan. Disclose unavailable persistence.

Finish with [verification and delivery](verify.md): the next action, next check-in
if selected, what the agent may change, how to pause, and exact remaining blockers.
A useful proposal does not close unverified installation steps.
