# Configure the operating agent

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

## Stage 4 — Configure the operating agent

Only after a verified instance exists should the agent configure the recurring operating skills below. For an existing instance, first reconcile its version, ownership and readiness with the installation record. Do not reinstall the application merely to update agent settings.

## Discover before configuring

1. Discover the actual host scheduling, agent execution, service supervision, configuration, and secret-reference capabilities. A filesystem or shell is not required: use supported configuration tools when available. Identify the MeOS MCP connection, authenticated account/workspace, available operations, and relevant permission scopes without exposing credentials.
2. Read the [shared operating contract](../contract.md) and only the selected procedures from the [discovery index](../../llms.txt). Inspect existing schedules, services, installation records, timezone, model/reasoning preferences, quiet hours, and grants of authority. Audit saved skill references using [Keep operating skills current](../skill-updates.md): identify checkout/commit pins, copied instructions, missing installations and stale local versions. Reuse existing approvals; do not widen them.
3. Identify which settings are known, inferred, unsupported, or genuinely missing. Ask only for choices that materially affect the installation and cannot be resolved from the environment or established preferences. Do not guess account identity, timezone, or permission to send communications.

## Build a concrete installation plan

Show the exact proposed jobs and service changes before applying them. Include each job's purpose, trigger, timezone, interaction mode, model/reasoning policy, authority, delivery destination, and missed-run behavior. Existing authorization can cover these changes; ask only for an actual missing decision or grant, not another blanket approval.

| Skill | Intended trigger |
| --- | --- |
| Morning launch | User's local morning schedule |
| Evening close | User's local evening schedule |
| Weekly review | User's chosen local day and time |
| Walk the board | Composed into review or invoked on demand |
| Clean the board | Composed into review or invoked on demand |
| Rescue the day | Contextual request or an explicitly authorized condition |
| Event companion | Verified actionable events from a supported event stream |

Do not create seven independent cron jobs. Avoid duplicate walk/clean execution when the review already includes them. Respect the individual skills' contracts and guided/adaptive/quiet modes. Configure named local timezones and verify daylight-saving behavior rather than substituting a fixed UTC offset. Specify missed-run/coalescing behavior to avoid replaying obsolete rituals after downtime.

Discover the host's supported models and reasoning controls. Honor configured preferences, use effort proportional to the work, and record any fallback explicitly. Do not hard-code vendor model IDs or pretend an unsupported reasoning setting was applied. Separate inexpensive waiting from agent reasoning.

Record authority separately for each job: permitted reads, planner/calendar mutations, schedule changes, external communications, protected-time constraints, and actions that require user input. A grant to install jobs is not permission for those jobs to perform every available tool action. Carry these limits into the job instructions; use technical host restrictions where supported and disclose instruction-only limits.

### Configure per-install planning authority

Offer the choice explicitly and record the answer: proposal-only planning, or standing autonomy over MeOS-owned blocks on the dedicated MeOS calendar (create, move, resize, unschedule/remove planning blocks, revise and commit, constrained by user intent). Reuse an existing grant without asking again; never copy another user's grant into a new installation. Example opt-in policy: “Manage my MeOS blocks autonomously within my constraints; keep imported primary-calendar events read-only and ask before changing other commitments.” Guided/adaptive/quiet delivery modes are independent of this authority choice. Offer a **sample/proposal-only mode** to show a rough week/day plan without calendar writes; do not mistake sample success for installed scheduling.

Capture natural-language routine intent, frequency targets, duration intent, soft time preferences and hard constraints separately; keep exact slots and durations on concrete occurrences, not routine templates. Configure the [project-linking policy](../contract.md#link-planning-priorities-to-projects): priorities must link to MeOS projects, infer only obvious links from recent MeOS context, otherwise ask and suggest project creation when none is obvious or available. Explain future tentative defaults and target-day automatic commitment in prior-night preparation, with morning catch-up and current-revision/capacity checks. Verify actual schema support before enabling this behavior; record unsupported transitions as blockers. Record the Google-wins synchronization policy and protection of MeOS-only notes/estimates/history. Configure evidence-aware actuals and weekly estimation reflection; do not enable media capture or assume a tentative-notification suppression policy.

## Install idempotently

Use supported host configuration tools within the user's existing authority. Compare desired state with existing state before creating or updating anything. Preserve unrelated configuration. Use stable installation and job identifiers, reuse matching resources, and record previous values for changes to shared resources.

Install the [chief-of-staff / executive-assistant entry point](../meos-assistant/SKILL.md) through the host’s supported skill mechanism when agent skill setup is authorized. Keep its natural-language intent description in the locally discoverable entry so ordinary chat about daily triage, weekly priorities, next actions and MeOS operations can select it without a scheduled trigger or explicit MeOS mention. Verify discovery separately from invocation and schedule registration; MCP connection alone does not install this entry.

Recommend installing operating skills as lightweight proxies to the verified deployment's stable published URLs. Follow [Keep operating skills current](../skill-updates.md) to resolve and record the published content at each invocation without editing jobs after each deployment. A local-copy installation is an explicit alternative: configure invocation-time periodic upstream checks and a durable, deduplicated upgrade-offer sentinel; never overwrite it silently. Audit and repair stale/pinned saved jobs within existing authority, preserving every unrelated scheduler field. An intentional pin remains until the user changes that policy.

Bootstrap is an ongoing maintenance workflow, not a one-time setup. Select the
requested mode before acting: install, enable a named feature, inspect, repair,
update, pause, or uninstall. An unchanged repeat must make no changes: do not
reinstall matching artifacts, restart healthy services, rewrite configuration,
or recreate jobs, recipients, registrations or seed data merely to rerun this skill.

- **Inspect:** compare the ledger with current versions, feature configuration
  and observable health using read-only host tools. Command names do not prove
  read-only behavior. In this release, `meos-agent doctor` can initialize local
  state, refresh credentials and plan events or renew a server lease; it is an
  active verification step, not read-only diagnosis. `status` reads local state
  but its loader can create a missing state directory. Inspect existing files
  and service metadata directly when no mutation is authorized.
- **Enable or repair:** change only the selected feature and necessary
  dependencies. Reuse existing authority, but do not treat diagnosis as a grant
  to repair or broaden activation/migration authority. Preserve configuration,
  secrets, user data, cursors, acknowledgements and accepted-work receipts.
- **Resume partial setup:** reconcile actual effects with the ledger before
  retrying. Reuse completed resources; do not replay an uncertain external or
  destructive action. Record the next safe step and exact unresolved effect.
  Reconcile persisted mint/refresh intents and native session state; reuse the
  live private rotating credential file, never restore an obsolete issuance copy
  or remint blindly. Record the runtime owner/run ID, verified state, last
  progress, next action and configured delivery route; resume only missing steps.
- **Keep planning independent:** installation maintenance must not reset
  planning state or overwrite local operating skills. Pin application artifacts
  and bootstrap independently. Operating proxies follow their recorded published
  source policy; replacing a local copy requires the user’s upgrade decision.
  Coordinate changes to shared resources, but let unrelated planning runs continue. Stop only the affected
  client when its documented operation requires exclusive state ownership.

Keep the installation ledger current with the pinned MeOS release and installation-manifest reference, artifact verification, host/deployment path, service IDs, persistent-storage references, non-secret access endpoints, workspace/account identity, skill versions, job IDs, triggers, timezone, execution settings, authority, status, verification receipts, and remaining blockers. Never store tokens or secret values in it. A job created successfully is **configured**, not proof of a successful execution. Install authorized morning/evening/review schedules independently of the event pipeline. Missing MCP access may block a ritual's planning execution, not its schedule installation: require an access preflight, explicit blocked reporting and no invented plans. Reuse known times and ordering; when a weekly review follows evening close, sequence them in one execution rather than creating concurrent jobs.

Update the same [completion checklist](SKILL.md#keep-one-completion-checklist), not a
separate ledger that loses the broader request. For each maintenance run, record
the selected mode/features, observed starting state, intended changes, completed
effects and unresolved steps. Keep secret
references, never secret contents. An unchanged run records a no-change result
without rewriting managed resources.

### Reflection capability

Use the [reflection workflow](reflections.md) during normal planning, not as an installation test.

Read the [learning-loop reference](../learning-loop.md) and discover `get_period_note` (`planning:read`) and `append_period_note` (`notes:write`) in the selected release. The owner MCP principal receives both; existing delegated service grants retain their explicit scopes and require separately authorized provisioning if note writes are needed. Verify actual tool availability and the effective grant rather than borrowing owner credentials. If note access is unavailable, record the precise blocker and deliver reflections unsaved (or persistence unverified after an uncertain write). Verify saved-note readback separately from planning and notification readiness; no learning service or new schema is needed.


Next: [event delivery](events.md) only when selected; otherwise [verify and hand off](verify.md).
