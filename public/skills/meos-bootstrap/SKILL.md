---
name: meos-bootstrap
description: Install MeOS for a new user from a verified supported release, prove persistent application and agent access, then configure operating skills, schedules, authority, and a supported event long-poller; inspect, update, pause, or uninstall an existing installation safely.
---

# Install MeOS and bootstrap its agent

Use when a user's agent should install MeOS from scratch or finish configuring an existing installation, including its operating skills. Reading this document alone authorizes no installation or side effects. Use supported host tools within existing authority; do not add a MeOS callback framework or invent deployment or MCP operations.

## Current packaging boundary — read first

**This repository's current `compose.yml` installs a demo preview, not a persistent MeOS application.** It builds an nginx image serving prebuilt `dist/client`, binds `127.0.0.1:3180:80`, and forces `MEOS_DEMO: 'true'`. Demo data lives in page memory and resets on reload. It provides no persistent backend, accounts, or real integrations. A healthy nginx response or successful `docker compose up` is not a completed MeOS installation.

The documented preview build uses Node 24, pnpm 10.30.3, `pnpm install --frozen-lockfile`, `pnpm run licenses`, `pnpm build`, and `pnpm typecheck`; `pnpm preview:deploy` deploys that preview after license qualification. `MEOS_TIMEZONE` and `MEOS_API_BASE` are public configuration, not secret storage. Changing the API path does not install a backend; production API mode is rejected in this preview phase.

**A verified full persistent installation package is not supplied by this Compose file.** Find a maintained full-release installation manifest and its supported artifacts before attempting a real install. Do not promote an unreleased integration branch or assemble speculative backend services into a pretend supported release. If no such release is available, report the missing persistent deployment package as the blocker. Offer the clearly labeled disposable preview only if useful to the user; do not substitute it silently or claim soup-to-nuts installation succeeded.

## Stage 1 — Discover the host and select a release

1. Determine whether this is a fresh install or an existing MeOS instance. Inspect existing services, versions, data ownership, and configuration before changing anything; never initialize over existing data. Discover available host-management tools and the host OS, architecture, resources, storage, network constraints, and Docker/Compose availability. A local shell is optional if supported remote/host tools provide the required operations.
2. Select a pinned, verified, supported release and read its maintained installation manifest, prerequisite matrix, deployment instructions, migration and recovery instructions. Verify provenance/checksums using the release's documented mechanism. Confirm that the artifacts include a persistent backend, its data services, authentication, and the web application—not just preview assets. Record exactly what is available and any missing component.
3. Reuse known preferences and ask only for materially missing choices: instance/data owner, local timezone, desired domain, private versus public access, storage location, and necessary installation authority. Do not assume a friend's host should become publicly accessible. Check disk capacity and ownership and resolve conflicting ports or an existing deployment before proceeding.

## Stage 2 — Configure and install the application

Prepare a concrete plan using the selected release's actual schema: pinned artifacts, service names, persistent storage, endpoints, exposure, owner, authentication setup, and secret references. Present the changes and apply them within established authority; obtain only genuinely missing decisions or grants.

- Install the release-defined prerequisites using supported host/package tools. For a supported full Compose release, use its supplied Compose files and documented build/start procedure; for another supported deployment path, follow that path. Do not fabricate a full-stack Compose file from the preview or invent environment variables, service names, migration commands, or health endpoints.
- Render and validate the actual release-defined configuration before startup. Keep private credentials in supported secret storage or protected configuration as documented; never request passwords/tokens in chat or put them in public client configuration, logs, or the installation ledger.
- Configure persistent storage and permissions before starting services. Identify which data survives container/service replacement. Never use reset, volume deletion, or database reinitialization as an installation shortcut. Establish the release's supported recovery procedure before migrating an existing instance.
- Bind services narrowly by default. Configure private networking or a reverse proxy and TLS only as required by the selected exposure and release instructions. Keep internal backend/data ports private. Validate the actual authentication/bootstrap-owner procedure; do not expose an unauthenticated setup flow publicly.
- Build or fetch verified artifacts, run only documented initialization/migrations, and start the actual supported stack. Capture service/resource IDs and failures without leaking secrets. Stop and report missing packaging or unsupported prerequisites rather than ad-lib production infrastructure.

## Stage 3 — Prove persistent MeOS works

Check the release-defined readiness of every required service, not only the static web server. Open the application through its intended access path and verify login with the intended owner/account. Confirm the UI is connected to the actual backend and is not in demo mode.

Within installation authority, create a clearly labeled disposable item, retrieve it through the supported application interface, perform a controlled restart of the relevant application/data services using the documented procedure, and retrieve the same item again. Record its stable identity and the persistence result; clean up only that test item when authorized. On an existing instance, coordinate any disruptive restart rather than surprising active users. If the proof cannot safely run, report persistence as unverified, not passed. Never delete volumes to test persistence.

Treat provider integrations as optional separate components. For Calendar/OAuth, use the release's real supported provider setup and consent flow, exact registered redirect URI and requested scopes, and user-controlled secret entry. Confirm connection state and supported behavior with safe, authorized checks. Missing consent or an unqualified integration must not masquerade as active sync or prevent truthful reporting of an otherwise working core installation.

Create or connect a scoped agent identity using the release's actual auth/MCP procedure. Verify authenticated discovery and a harmless read against the intended workspace/account. Record granted scopes; do not reuse an unrestricted owner credential by default. If MCP or an event API is unavailable, record that separate blocker before proceeding to the compatible parts of agent setup.

## Stage 4 — Configure the operating agent

Only after a verified instance exists should the agent configure the recurring operating skills below. For an existing instance, first reconcile its version, ownership and readiness with the installation record. Do not reinstall the application merely to update agent settings.

## Discover before configuring

1. Discover the actual host scheduling, agent execution, service supervision, configuration, and secret-reference capabilities. A filesystem or shell is not required: use supported configuration tools when available. Identify the MeOS MCP connection, authenticated account/workspace, available operations, and relevant permission scopes without exposing credentials.
2. Read the [shared operating contract](../contract.md) and the seven core skills from the [discovery index](../../llms.txt). Inspect existing schedules, services, installation records, timezone, model/reasoning preferences, quiet hours, and grants of authority. Reuse existing approvals; do not widen them.
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

## Install idempotently

Use supported host configuration tools within the user's existing authority. Compare desired state with existing state before creating or updating anything. Preserve unrelated configuration. Use stable installation and job identifiers, reuse matching resources, and record previous values for changes to shared resources. Pin or record the installed skill versions and source references so upgrades can be reviewed.

Create an installation ledger in durable host storage containing the pinned MeOS release and installation-manifest reference, artifact verification, host/deployment path, service IDs, persistent-storage references, non-secret access endpoints, workspace/account identity, skill versions, job IDs, triggers, timezone, execution settings, authority, status, verification receipts, and remaining blockers. Never store tokens or secret values in it. A job created successfully is **configured**, not proof of a successful execution.

## Configure the event long-poller

First discover and verify an actual authenticated event API and its protocol. MCP access alone does not prove such an API exists. Obtain its documented endpoint/tool, authentication mechanism, event types, cursor and acknowledgment semantics, retention/replay limits, and supported wait duration. Do not invent endpoints, MCP operations, cursor formats, or delivery guarantees.

When supported, configure a supervised durable **host service** that waits for events and wakes the agent only for actionable work. It is not a sleeping LLM, recurring chat prompt, or lifecycle callback registry. Keep credentials in the host's secret store and use references in configuration.

- Use bounded long-poll waits, documented reconnect behavior, exponential backoff with jitter, and explicit handling for authentication failure, throttling, and retention gaps. Avoid busy loops and unbounded retries.
- Persist the protocol's cursor and processing state durably. Follow its actual acknowledgment rules; do not advance past unprocessed work or acknowledge before the required durable handoff. If the protocol cannot support reliable recovery, record the limitation rather than promise exactly-once delivery.
- Deduplicate using stable event identity/revision and durable processing receipts. Serialize or claim work through supported host mechanisms; prevent duplicate consumers for the same installation. Reconcile ambiguous effects before retrying.
- On each wake, re-read current MeOS state and authority before any mutation. Discard or reconcile stale revisions and canceled boundaries. Replayed events must not repeat completed actions or communications.
- Let the platform maintain its seven-day future boundary window; do not recreate that scheduler in the host or confuse it with the 14-day planning horizon.
- Configure startup/restart recovery, observable health and last-success state, and an authorized destination for actionable failure reports. Record service ownership and how to stop it.

If the API, supervision, durable state, or necessary permissions are unavailable, record the exact blocker and leave the dependent event component uninstalled or explicitly paused. Install compatible manual/scheduled pieces independently when authorized. Do not silently substitute periodic polling for a requested long-poller, or claim event updates are live.

## Verify and hand off

Read back the actual installed configuration: resource IDs, enabled state, next scheduled times, timezone/DST handling, model/reasoning settings, delivery route, and authority limits. Confirm there is one intended consumer, not multiple overlapping installations. Capture receipts in the ledger.

Where the host/protocol supports them, use safe synthetic events and a non-mutating test target to verify receipt, actionable wake-up, cursor persistence, restart recovery, replay deduplication, stale/canceled-event handling, and health reporting. Do not mutate a real calendar, send messages, print, or trigger other external effects merely to prove installation. If a proof is unavailable, report it as unverified instead of manufacturing evidence. Enabled configuration is not evidence that the long-poller is connected and processing correctly.

Report application installation/login/persistence separately from optional integrations, MCP access, operating jobs, and event delivery. State what is configured, what is verified running, the next scheduled executions, and exact blocked/unverified parts. Include the installation record location or resource ID, non-secret access instructions, and how to inspect, pause, update, and uninstall. Do not declare the entire bootstrap complete while a requested component remains blocked, and never call a demo preview a persistent installation.

## Maintain or remove

- **Inspect:** reconcile the ledger with live configuration; do not trust an old enabled flag as runtime evidence.
- **Pause:** distinguish pausing agent jobs from stopping the application. Disable only the requested owned triggers/consumers/services through supported controls, preserve data, cursors and receipts, and verify the paused state. Reconcile in-flight work before resumption.
- **Update:** review release notes and a configuration/version diff, follow the supported migration/recovery path, preserve persistent data, grants and processing state, and repeat affected readiness/persistence/readback proofs. Do not broaden authority as part of an upgrade.
- **Uninstall:** distinguish removing agent setup from uninstalling MeOS. Remove only resources owned by this installation within the requested scope; preserve application data and volumes by default. Data deletion requires explicit separate authority. Restore shared settings only when safe and unchanged by others. Follow the user's retention policy for the ledger and receipts. Verify removal and disclose anything left behind.

Repeated bootstrap, pause, update, or uninstall requests should converge on the requested state without duplicate jobs, consumers, or effects.
