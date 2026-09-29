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

## Installation target

Use an existing verified persistent deployment when available. The shipped path is
native backend + protected web adapter under Linux/systemd, with Docker for the
native runtime; see the [pinned host/MCP runbook](host-mcp.md). Select an exact
reviewed commit and artifact manifest, not an implicit latest release. The demo
Compose preview is not this stack. Compose or Helm is an alternative only when
the selected release actually supplies qualified persistent artifacts; do not
invent a chart or introduce a cluster solely for MeOS.

## Stage 1 — Discover the host and select a release

1. Determine whether this is a fresh install or an existing MeOS instance. Inspect existing services, versions, data ownership, and configuration before changing anything; never initialize over existing data. Discover available host-management tools and the host OS, architecture, resources, storage, network constraints, and the selected path’s prerequisites. A local shell is optional if supported remote/host tools provide the required operations.
2. Select a pinned, verified, supported release and read its maintained installation manifest, prerequisite matrix, deployment instructions, migration and recovery instructions. Verify provenance/checksums using the release's documented mechanism. Resolve the native image digest, immutable web/runtime manifest, systemd templates and private socket contract (or verified alternative packaging), application/configuration versions, required data services, and resource/storage requirements. Confirm the bundle includes the persistent backend, authentication, and web application. Record exactly what is available and any missing component.
3. Reuse known preferences and ask only for materially missing choices: instance/data owner, local timezone, desired domain, private versus public access, storage location, and necessary installation authority. Do not assume a friend's host should become publicly accessible. Check disk capacity and ownership and resolve conflicting ports or an existing deployment before proceeding.

## Stage 2 — Configure and install the application

Prepare a concrete plan using the selected release's actual schema: pinned artifacts, service names, persistent storage, endpoints, exposure, owner, authentication setup, and secret references. Present the changes and apply them within established authority; obtain only genuinely missing decisions or grants.

- Install the release-defined prerequisites using supported host/package tools. For a supported full Compose release, use its supplied Compose files and documented build/start procedure; for another supported deployment path, follow that path. Do not fabricate a full-stack Compose file from the preview or invent environment variables, service names, migration commands, or health endpoints.
- Render and validate the actual release-defined configuration before startup. Keep private credentials in supported secret storage or protected configuration as documented; never request passwords/tokens in chat or put them in public client configuration, logs, or the installation ledger.
- Configure persistent storage and permissions before starting services. Identify which data survives container/service replacement. Never use reset, volume deletion, or database reinitialization as an installation shortcut. Establish the release's supported recovery procedure before migrating an existing instance.
- Bind services narrowly by default. Configure private networking or a reverse proxy and TLS only as required by the selected exposure and release instructions. Keep internal backend/data ports private. Validate the actual authentication/bootstrap-owner procedure; do not expose an unauthenticated setup flow publicly.
- Build or fetch verified artifacts, run only documented initialization/migrations, and start the actual supported stack. Capture service/resource IDs and failures without leaking secrets. Stop and report missing packaging or unsupported prerequisites rather than ad-lib production infrastructure.

### Native Linux host

Follow the [host/MCP runbook](host-mcp.md) against the selected checkout. Keep
artifact qualification, release admission, rendering and activation separate.
Existing renderer assumptions are host-specific: a different host needs reviewed
configuration support, not copied personal identifiers or disabled checks.
For a genuinely supplied Compose/Helm release, use its own maintained instructions
and the same identity, persistence, authority and recovery gates above.

## Recovery planning and verification

Backups are optional. If no S3-compatible bucket is supplied, do nothing: do not
provision resources, request credentials, install a schedule, or warn about a
missing optional component. A requested but failing configured backup is an error,
not the same as an absent bucket. This guide itself grants no backup authority.

### Configure optional host backup tooling

For a release containing `tools/backup/meos-backup.py`, read that exact release's
`docs/BACKUP-RECOVERY.md` before installation. It targets the native/Calendar Linux
amd64 host deployment with Python 3.11+, systemd, Docker and pinned age, not an
invented Compose/Helm sidecar or MeOS API. If the selected deployment does not match
that contract, leave this optional component uninstalled and record the mismatch.

1. Reuse the user's bucket/prefix and existing grants. Resolve only missing choices:
   backup cadence, maximum data-loss interval, preupgrade requirement, pause state,
   retention/deletion policy and an optional external freshness-alert destination.
   No cloud account, paid resource, deletion policy or schedule is implicit.
2. Use the source-first age installation procedure below. Identify all five
   live source roots and the actual writer closure: native depot, Calendar state,
   installed configuration, immutable release and five MeOS units. Prove no other
   host process writes these roots; a Docker volume check alone is insufficient.
   Capacity admission must cover each destination filesystem, source growth and
   the minimum 5 GiB reserve; never delete old evidence/backups to pass it.
3. Configure the private age identity and S3 credential files using supported
   private tooling, outside the archived roots. Escrow the recovery key separately
   off-host. Keep secrets out of chat and the installation ledger. Use the exact
   release's example schema, including verified runtime identity and required
   configuration roles; do not substitute stale copies for live configuration.
4. Under backup execution authority, run the documented `config-check`, `backup`
   and `status` commands. Verify upload and isolated data-restore receipts
   separately. The runner resumes recorded active writers in `finally`; reconcile
   a surviving journal with `resume-writers` before another run. Data integrity
   alone does not prove login, readiness, restart or application recovery:
   `applicationRecoveryVerified` remains false.
5. Only with scheduling authority, install the release's example service/timer
   through supported host controls, adjusting the reviewed cadence. Reuse matching
   owned units instead of creating duplicates. Verify boot startup, missed-run
   behavior, next run and observed success. Verify the independently authorized
   off-host stale-success alert; an enabled timer cannot detect a dead host.
6. Restore into a new isolated disposable target first, with real Calendar,
   messaging and notification egress denied. Use the independently escrowed key,
   compare restored identities/data, then separately qualify application login,
   readiness and restart with the exact release. Production replacement requires
   its own explicit approval and preserved rollback state; this tool never
   overwrites a live target or starts restored services.

### Install or maintain backup encryption from source

The default backup package ships MeOS source, `install-age.py` and
`source-lock.json`, not an age executable. Use the pinned release's
`docs/BACKUP-RECOVERY.md` commands and admission contract. Python manages backups;
age supplies age-format encryption/decryption. Go is needed only for a new source
build, not for running backups or reusing an admitted installation.

- **Discover:** inspect the current backup config, runtime path, admission receipt
  and ledger digest before changing anything. With no bucket, skip this entire
  optional installation. Do not install Go just for an unselected feature.
- **Build:** on the supported Linux amd64 host, install a Go launcher through
  supported host tools if needed and authorized. Run `install-age.py --output`
  with a new trusted directory. It fetches pinned Go/module source, checks source
  checksums and license hashes, verifies linked build metadata, and atomically
  publishes age plus age-keygen and a hash receipt. Check the documented 1200 MiB
  allocation plus 5 GiB reserve first. Do not substitute `go install ...@latest`.
- **Reuse:** pass `--reuse-from` plus `--admission-sha256` from a previously trusted
  installation ledger. This is offline and needs no Go. A PATH executable or its
  self-reported version alone is not admission. Without a trusted receipt, build
  the pinned source instead; never bless unknown binaries by hashing them.
- **Configure:** record the reviewed receipt digest in the ledger and the backup
  fields `ageAdmissionFile`/`ageAdmissionSHA256`, with `age` pointing at the admitted
  executable. Keep these files owned by the runtime user under trusted paths.
  Retain local dependency notices with built binaries. Generate a recovery key
  only for a genuinely new setup; preserve and escrow an existing key.
- **Inspect/repeat:** `install-age.py --output PATH --check --admission-sha256 HASH`
  is read-only, including for missing paths. An unchanged ordinary rerun also
  leaves files, services and schedules untouched. `config-check` verifies runtime
  admission without executing age or contacting the bucket; `status` only reports
  config/receipts. Neither proves current provider availability or a fresh restore.
- **Repair/recover:** changed or partial installed files fail closed. Build a new
  runtime, verify it, then switch only backup config within repair authority;
  preserve keys, objects, receipts, schedules, planning state and client cursors.
  An interrupted build never selects its staging directory. If the final path
  exists, verify it before retrying. Otherwise retry installation without replaying
  key generation, uploads or scheduler activation. Coordinate only shared backup
  resource mutations; unrelated planning can continue.

Environment-specific tooling may implement the same workflow, but the current
installer does not automatically admit alternate encryption implementations or
platforms. Require age-format compatibility, authenticated restore/tamper proofs,
source provenance and license review before claiming equivalent support. Do not
invent cryptography to avoid installing Go or carrying redistribution notices.

### Inspect, pause, update and remove optional backups

- **Inspect:** use `status` and actual scheduler/provider receipts. Record backup
  and data-restore times, separate application-recovery evidence, policy, owned
  unit IDs and alert verification in the ledger without credentials.
- **Pause:** `paused: true` suppresses scheduled `due` runs but fails explicit or
  required preupgrade backups. `enabled: false` disables all operations; do not
  use it to conceal a configured failure. Preserve keys, objects and receipts.
- **Update:** reverify bundle/source hashes and compatibility. The Calendar upgrade
  guard holds the backup lock through the transition and rejects failed required
  preupgrade backups. Preserve the retained-depot/runtime admission checks; do
  not bypass the guard or reinterpret source qualification as deployment approval.
- **Retention:** `keepLast: 0` retains everything. Inspect `retention` first;
  `retention --apply` deletes only under explicit deletion authority. Provider
  lifecycle policies are separate and must not expire the only recovery copy.
- **Uninstall:** stop/remove only owned backup triggers/services within scope.
  Preserve remote objects, private recovery keys, receipts and application data
  unless their deletion is separately authorized. Record what remains recoverable.

Report configured, uploaded, data-restored and application-recovery-qualified as
separate states. Real-provider compatibility, installed writer closure and
application recovery need installation evidence; synthetic source tests do not
satisfy those gates.

## Stage 3 — Prove persistent MeOS works

Check the release-defined readiness of every required service, not only the static web server. Open the application through its intended access path and verify login with the intended owner/account. Confirm the UI is connected to the actual backend and is not in demo mode.

Within installation authority, create a clearly labeled disposable item, retrieve it through the supported application interface, perform a controlled restart of the relevant application/data services using the documented procedure, and retrieve the same item again. Record its stable identity and the persistence result; clean up only that test item when authorized. On an existing instance, coordinate any disruptive restart rather than surprising active users. If the proof cannot safely run, report persistence as unverified, not passed. Never delete volumes to test persistence.

Treat provider integrations as optional separate components. For Calendar/OAuth, use the release's real supported provider setup and consent flow, exact registered redirect URI and requested scopes, and user-controlled secret entry. Confirm connection state and supported behavior with safe, authorized checks. Missing consent or an unqualified integration must not masquerade as active sync or prevent truthful reporting of an otherwise working core installation.

Connect MCP using the release's supported authentication procedure on behalf of the intended user. When the user delegates their access to the operating agent, reuse that authorized user identity; do not create a separate agent principal by default. Identity and credential scoping are separate choices: use a supported delegated or appropriately scoped credential for the same identity when available, without inventing token-exchange capabilities or narrowing access below the requested operations. An explicitly delegated owner credential is not categorically forbidden. Protect credentials and refresh state in supported secret storage/private files; verify effective identity, workspace and permissions with authenticated discovery and a harmless read. Record only non-secret references and effective permissions, and distinguish technical restrictions from instruction-only authority limits.

Prefer a local Unix socket when the release supports one, using a supported stdio MCP adapter if the agent host requires stdio. Socket permissions restrict connection access; they do not replace application authentication unless the release explicitly supports that mechanism. HTTP can be preferable across hosts, across container boundaries without a shared socket, or for managed/remote MCP clients that do not support local stdio/socket access. Use the release's actual HTTP transport, supported authentication and TLS appropriate to exposure; do not add public routing or a new auth server merely because HTTP is available. Verify endpoint/adapter capabilities rather than assuming a backend socket or HTTP API already speaks MCP.

Before declaring MCP ready, verify the deployed backend's authentication and
refresh contract, not just transport access. Distinguish short-lived access tokens
from the server-side session's lifetime: refreshing a bearer need not extend that
session. Follow the shipped token-reuse or rotation behavior; do not require a new
refresh token when the backend reuses it. Qualify expiry and renewal with discovery
and a harmless read, including the scheduled agent context when used. See the
[host authentication lifecycle](host-mcp.md#verify-the-authentication-lifecycle)
for MeOS-specific session policy and proof requirements.

Track MCP readiness as separate receipts, in order:

1. **Installed:** pinned bridge, private configuration and persistent registration.
2. **Doctor/protocol:** host probe, authenticated initialization/tool discovery,
   effective identity/workspace and a harmless direct-protocol read.
3. **Personal runtime:** the actual personal agent invokes a discovered harmless
   MeOS tool; retain its tool-call/result evidence, not an assistant assertion.
4. **Scheduled runtime:** a restricted one-shot isolated/scheduled agent invokes
   a harmless tool with delivery disabled. Do not run real morning/evening/review
   rituals as installation tests or permit planner/calendar/messaging writes.

Use [the runbook’s catalog-refresh continuation](host-mcp.md#catalog-refresh-and-recovery)
when new tools are absent from the current turn. Persist the exact missing proof,
obtain an accepted fresh-turn owner through supported host controls, and configure
its result-delivery route before yielding. An installed registration, queued job,
or saved checklist is not active execution. Do not restart a healthy gateway or
wait for the user to prompt “And?” merely to refresh a turn’s tool catalog.

A missing connection is setup work when the supported procedure and authority are available, not a reason to stop at discovery. If the release requires a separate principal but the user chose delegated identity, report an implementation capability mismatch and route authorized coding work to an owner; do not provision against that decision. If MCP or an event API is unavailable, distinguish missing configuration, an exact missing grant, and an unsupported capability; apply the continuation rule above and proceed with compatible parts of agent setup. Never substitute an unrelated service's credential to bypass a missing grant.

## Stage 4 — Configure the operating agent

Only after a verified instance exists should the agent configure the recurring operating skills below. For an existing instance, first reconcile its version, ownership and readiness with the installation record. Do not reinstall the application merely to update agent settings.

## Discover before configuring

1. Discover the actual host scheduling, agent execution, service supervision, configuration, and secret-reference capabilities. A filesystem or shell is not required: use supported configuration tools when available. Identify the MeOS MCP connection, authenticated account/workspace, available operations, and relevant permission scopes without exposing credentials.
2. Read the [shared operating contract](../contract.md) and the seven core skills from the [discovery index](../../llms.txt). Inspect existing schedules, services, installation records, timezone, model/reasoning preferences, quiet hours, and grants of authority. Audit saved skill references using [Keep operating skills current](../skill-updates.md): identify checkout/commit pins, copied instructions, missing installations and stale local versions. Reuse existing approvals; do not widen them.
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

Update the same [completion checklist](#keep-one-completion-checklist), not a
separate ledger that loses the broader request. For each maintenance run, record
the selected mode/features, observed starting state, intended changes, completed
effects and unresolved steps. Keep secret
references, never secret contents. An unchanged run records a no-change result
without rewriting managed resources.

### Reflection capability

Read the [learning-loop reference](../learning-loop.md) and discover `get_period_note` (`planning:read`) and `append_period_note` (`notes:write`) in the selected release. The owner MCP principal receives both; existing delegated service grants retain their explicit scopes and require separately authorized provisioning if note writes are needed. Verify actual tool availability and the effective grant rather than borrowing owner credentials. If note access is unavailable, record the precise blocker and deliver reflections unsaved (or persistence unverified after an uncertain write). Verify saved-note readback separately from planning and notification readiness; no learning service or new schema is needed.

## Configure the event long-poller

First discover and verify an actual authenticated event API and its protocol. MCP access alone does not prove such an API exists. Obtain its documented endpoint/tool, authentication mechanism, event types, cursor and acknowledgment semantics, retention/replay limits, and supported wait duration. Do not invent endpoints, MCP operations, cursor formats, or delivery guarantees.

When supported, configure a supervised durable **host service** that waits for events and wakes the agent only for actionable work. It is not a sleeping LLM, recurring chat prompt, or lifecycle callback registry. Keep credentials in the host's secret store and use references in configuration.

### Select and install the transport

For a release containing `clients/meos-agent`, read that pinned checkout's
`clients/meos-agent/README.md`, `main.go`, and
`docs/agent-notifications/ARCHITECTURE.md` before selecting the transport. The
supported distribution is source-only; do not look for a precompiled consumer
archive or treat a private qualification artifact as a release.

- **Go-capable Linux/macOS host:** install the reviewed source commit or module
  version with the command below. Verify that the host compiler satisfies
  `go.mod`. Discover `GOBIN` or `$(go env GOPATH)/bin` and use that exact installed
  executable in the supervisor, rather than assuming `~/.local/bin`.
- **Another environment:** use the pinned source and durable-dispatch contract
  to implement an equivalent host-specific client. Preserve native bearer
  authentication and refresh persistence, bounded waits/backoff, lease fencing,
  stable IDs, durable deduplication, handoff-before-ack, cancellation, explicit
  gap reconciliation and restart recovery. Qualify it before enabling it.

```sh
go install github.com/anulman/meos/clients/meos-agent@REPLACE_WITH_REVIEWED_COMMIT_OR_VERSION
```

Resolve the placeholder before execution; do not select `latest` implicitly.
Verify the selected release's notification authentication contract. A requirement
for a distinct `notifications:consume` principal, if present, is an implementation
constraint, not a universal bootstrap policy. Prefer supported credentials acting
on behalf of the delegated user; do not create another identity against the user's
choice. If the current endpoint/client only accepts distinct principals, record
that concrete mismatch and route authorized implementation to a coding owner while
continuing MCP and ritual setup independently. Keep protected credentials, refresh
state and configuration outside the ledger. The client requires an idempotent durable dispatcher:
its matching `accepted:true` receipt means persisted queue admission, not merely
that a process started or an agent completed work. Supervise both that queue's
worker and the client. Follow the pinned guide's `install`, `doctor`, `run` and
`status` procedure, verify restart/replay, and record the actual installed commit,
service IDs and receipts. Installation alone does not prove the machine endpoint
is deployed or reachable.

This transport signals explicitly timed MeOS task/occurrence blocks. Imported
primary-calendar events remain display-only; do not invent notification records
or permission to mutate that calendar. Source installation does not grant planning
or external-communication authority.

### Select the durable outbox for this deployment

Use the simplest supported durable outbox/dispatch store that fits the deployment,
not one universal broker requirement:

- **Single persistent VPS (including this installation):** use a local SQLite
  outbox on persistent storage and a supervised worker. Preserve its database and
  processing receipts across service/container replacement; keep writes and work
  claims coordinated. SQLite on an ephemeral container filesystem is not durable.
- **Shared or multiworker deployment:** prefer an existing transactional database
  outbox with supported atomic claims/leases and, where applicable, atomic
  application-write/event publication. Do not assume multiple hosts can safely
  share a SQLite file or introduce a second database without a need.
- **Ephemeral/serverless deployment:** use a supported managed durable queue or
  platform durable store with recovery, retention and worker ownership semantics;
  local scratch storage is insufficient. Provision paid/external resources only
  within the user's authority.

For every strategy, persist admission before acknowledging the producer. Track
stable event/revision IDs, deduplication, bounded retries, claimed runs and handling
receipts separately. An accepted enqueue or a successful agent turn is not proof
that the requested work was handled: require a validated handling outcome and the
protocol's actual acknowledgment/delivery receipts. Keep blocked or unverified
outcomes actionable, preserve run IDs, and reconcile unknown effects before retry
rather than replaying them blindly. Verify that required receipt/freshness APIs
exist; a worker prompt cannot supply missing capabilities. Report actual delivery
and recovery guarantees; do not claim exactly-once effects from queue durability.

### Configure recovery and supervision

- Use bounded long-poll waits, documented reconnect behavior, exponential backoff with jitter, and explicit handling for authentication failure, throttling, and retention gaps. Avoid busy loops and unbounded retries.
- Persist the protocol's cursor and processing state durably. Follow its actual acknowledgment rules; do not advance past unprocessed work or acknowledge before the required durable handoff. If the protocol cannot support reliable recovery, record the limitation rather than promise exactly-once delivery.
- Deduplicate using stable event identity/revision and durable processing receipts. Serialize or claim work through supported host mechanisms; prevent duplicate consumers for the same installation. Reconcile ambiguous effects before retrying.
- On each wake, re-read current MeOS state and authority before any mutation. Discard or reconcile stale revisions and canceled boundaries. Replayed events must not repeat completed actions or communications.
- Let the platform maintain its seven-day future boundary window; do not recreate that scheduler in the host or confuse it with the 14-day planning horizon.
- Configure startup/restart recovery, observable health and last-success state, and an authorized destination for actionable failure reports. Record service ownership and how to stop it.

If the API, supervision, durable state, or necessary permissions are unavailable, first reconcile and complete supported setup within existing authority. For unresolved dependencies, record the exact blocker and leave the dependent event component uninstalled or explicitly paused; request an exact missing grant or route authorized implementation work to an owner as described above. Record that owner's scope, current state and completion-delivery route; do not present an unowned next step as work in progress. Install compatible manual/scheduled pieces independently when authorized. Do not silently substitute periodic polling for a requested long-poller, or claim event updates are live.

## Verify and hand off

Reconcile every requested step in the [completion checklist](#keep-one-completion-checklist)
with its proof before closing the combined request. Report partial completion
when any requested installation, verification or delivery remains unresolved;
retain its next action and owner even when a narrower task is complete.

Read back the actual installed configuration: resource IDs, enabled state, next scheduled times, timezone/DST handling, model/reasoning settings, delivery route, and authority limits. Confirm there is one intended consumer, not multiple overlapping installations. Capture receipts in the ledger.

Verify affected installation paths with before/after evidence: first install;
an unchanged repeat with identical managed configuration and resource IDs;
selective enablement with unrelated features unchanged; read-only diagnosis
followed by separately authorized scoped repair; and recovery from a partial
run without duplicate resources or lost state. Use disposable fixtures for
interruption tests, not a live installation. Distinguish executable evidence
from a procedure review: this skill does not provide a universal host installer,
and these instructions alone do not prove live idempotence. Report unsupported
host cases as unverified rather than claiming all five paths passed.

Where the host/protocol supports them, use safe synthetic events and a non-mutating test target to verify receipt, actionable wake-up, cursor persistence, restart recovery, replay deduplication, stale/canceled-event handling, and health reporting. Do not mutate a real calendar, send messages, print, or trigger other external effects merely to prove installation. If a proof is unavailable, report it as unverified instead of manufacturing evidence. Enabled configuration is not evidence that the long-poller is connected and processing correctly.

Report application installation/login/persistence separately from optional integrations, MCP access, operating jobs, and event delivery. State what is configured, what is verified running, the next scheduled executions, and exact blocked/unverified parts. Include the installation record location or resource ID, non-secret access instructions, and how to inspect, pause, update, and uninstall. Do not declare the entire bootstrap complete while a requested component remains blocked, and never call a demo preview a persistent installation.

For MCP readiness, include all four Stage 3 receipts for the intended identity and workspace; doctor/direct protocol success is not personal or scheduled model-tool evidence. For event readiness, include an actual event's durable queue handoff and supervised worker processing, plus the required restart/replay proof; installed services or synthetic qualification alone are not live end-to-end evidence. Report which dependencies were completed under existing bootstrap authority, and separate configured components from verified operation and any remaining permission or implementation blocker.

### Learning and delivery closeout

For evidenced setup defects, record the failure, concrete upstream correction
and regression proof; link the source commit/PR rather than leaving a local
workaround as the lesson. Repository-owned bootstrap/template fixes go through
repository review, not an installed-skill workshop. Preserve unrelated content
and authorization gates. Distinguish source fixed, PR published, release admitted,
and runtime installed/verified; a merged document does not update a live host.
Record unperformed proofs explicitly (for example, forced live expiry or full
backend/socket rebind). Deliver the bounded result through the user’s actual
channel and retain its send receipt separately from saved completion. A saved
report or child completion is not confirmed user-facing delivery.

## Maintain or remove

- **Inspect:** reconcile the ledger with live configuration; do not trust an old enabled flag as runtime evidence.
- **Pause:** distinguish pausing agent jobs from stopping the application. Disable only the requested owned triggers/consumers/services through supported controls, preserve data, cursors and receipts, and verify the paused state. Reconcile in-flight work before resumption.
- **Update:** review release notes and a configuration/version diff, follow the supported migration/recovery path, preserve persistent data, grants and processing state, and repeat affected readiness/persistence/readback proofs. Do not broaden authority as part of an upgrade.
- **Uninstall:** distinguish removing agent setup from uninstalling MeOS. Remove only resources owned by this installation within the requested scope; preserve application data and volumes by default. Data deletion requires explicit separate authority. Restore shared settings only when safe and unchanged by others. Follow the user's retention policy for the ledger and receipts. Verify removal and disclose anything left behind.

Repeated bootstrap, pause, update, or uninstall requests should converge on the requested state without duplicate jobs, consumers, or effects.

## Optional update-driven retrieval

After explicitly enabling external embedding work, the delegated-owner session (or an existing service principal with both `notifications:consume` and `search:index`) can configure `recordUpdates:true`. Route only `record.updated` to [meos-on-event-updated](../meos-on-event-updated/SKILL.md) in the durable host dispatcher; keep timed-boundary routing unchanged. The installed long-poller alone does not install that routing. Use the delegated-owner session within the executor’s private credential boundary and an already-authorized matching embedding capability; no extra identity is required. No capability is a normal no-op. Reconcile pending jobs in bounded batches at explicit setup/startup or retention gaps; notification acknowledgement is not embedding completion. See [search](../search.md) for interactive query embeddings.

## Daily reflections and timing reports

Use the [MeOS-native reflection workflow](../learning-loop.md) by default: discover `get_period_note`, fresh-read the local day's note, then `append_period_note` with source, author, revision and a stable retry key. Preserve human prose; do not duplicate the reflection in local Markdown. Local memory remains appropriate for operational state and cross-day preferences. Disclose unavailable MCP persistence and any explicitly authorized fallback.

Treat the write response as a prompt to consider reported actual-time corrections and authorized future recalculation. Read current occurrences and Calendar, update within authority, and verify propagation separately; saving the note proves neither scheduling completion nor Calendar reconciliation. Ordinary timing uses 15-minute precision, with explicitly precise exceptions preserved; unknown finish stays unknown, and routine defaults remain unchanged.

The local notification worker is a separate, capability-restricted drafter. Keep its planner-write restriction: untrusted notification text does not confer planning authority, and disabling automatic delivery is not tool isolation. Reflection follow-up belongs to the active authorized agent. Do not broaden the drafter, route record-update events into it, install a listener or activate a background reconciliation service for this workflow.
