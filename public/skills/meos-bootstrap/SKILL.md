---
name: meos-bootstrap
description: Install MeOS for a new user from a verified supported release, prove persistent application and agent access, then configure operating skills, schedules, authority, and a supported event long-poller; inspect, update, pause, or uninstall an existing installation safely.
---

# Install MeOS and bootstrap its agent

Use when a user's agent should install MeOS from scratch or finish configuring an existing installation, including its operating skills. Reading this document alone authorizes no installation or side effects. Use supported host tools within existing authority; do not add a MeOS callback framework or invent deployment or MCP operations.

## Installation target

This guide targets the **post-production-cutover MeOS release**: install the persistent application first, then configure its agent. Prefer Docker Compose for a single host; use Helm when the user already operates a compatible Kubernetes cluster or explicitly chooses one. Do not introduce a cluster merely to run MeOS. Use an existing verified deployment when available.

All `REPLACE_WITH_...` values below are explicit placeholders for artifacts and settings obtained from the selected release's maintained installation manifest. They are not shipped artifact names, chart coordinates, configuration keys, or endpoints. Resolve them before executing commands; equivalent supported host tools are fine.

> Maintainer note: this guide assumes production cutover is complete; it is not evidence of current deployment. At authoring, this branch's Compose file remains a demo-only nginx preview, and production Compose/Helm coordinates have not been supplied here. Release maintainers must publish verified persistent deployment artifacts and their configuration/compatibility contract. Do not select the preview as the production artifact.

## Stage 1 — Discover the host and select a release

1. Determine whether this is a fresh install or an existing MeOS instance. Inspect existing services, versions, data ownership, and configuration before changing anything; never initialize over existing data. Discover available host-management tools and the host OS, architecture, resources, storage, network constraints, and Docker/Compose availability. A local shell is optional if supported remote/host tools provide the required operations.
2. Select a pinned, verified, supported release and read its maintained installation manifest, prerequisite matrix, deployment instructions, migration and recovery instructions. Verify provenance/checksums using the release's documented mechanism. Resolve the production Compose artifact or Helm chart, image digests, application/configuration versions, supported Docker/Compose or Kubernetes/Helm versions, required data services, and resource/storage requirements. Confirm the bundle includes the persistent backend, authentication, and web application. Record exactly what is available and any missing component.
3. Reuse known preferences and ask only for materially missing choices: instance/data owner, local timezone, desired domain, private versus public access, storage location, and necessary installation authority. Do not assume a friend's host should become publicly accessible. Check disk capacity and ownership and resolve conflicting ports or an existing deployment before proceeding.

## Stage 2 — Configure and install the application

Prepare a concrete plan using the selected release's actual schema: pinned artifacts, service names, persistent storage, endpoints, exposure, owner, authentication setup, and secret references. Present the changes and apply them within established authority; obtain only genuinely missing decisions or grants.

- Install the release-defined prerequisites using supported host/package tools. For a supported full Compose release, use its supplied Compose files and documented build/start procedure; for another supported deployment path, follow that path. Do not fabricate a full-stack Compose file from the preview or invent environment variables, service names, migration commands, or health endpoints.
- Render and validate the actual release-defined configuration before startup. Keep private credentials in supported secret storage or protected configuration as documented; never request passwords/tokens in chat or put them in public client configuration, logs, or the installation ledger.
- Configure persistent storage and permissions before starting services. Identify which data survives container/service replacement. Never use reset, volume deletion, or database reinitialization as an installation shortcut. Establish the release's supported recovery procedure before migrating an existing instance.
- Bind services narrowly by default. Configure private networking or a reverse proxy and TLS only as required by the selected exposure and release instructions. Keep internal backend/data ports private. Validate the actual authentication/bootstrap-owner procedure; do not expose an unauthenticated setup flow publicly.
- Build or fetch verified artifacts, run only documented initialization/migrations, and start the actual supported stack. Capture service/resource IDs and failures without leaking secrets. Stop and report missing packaging or unsupported prerequisites rather than ad-lib production infrastructure.

### Docker Compose — single host

Verify Docker Engine and the Compose plugin are supported by the release (`docker version`, `docker compose version`) and the daemon is reachable. Check host architecture, free disk/memory, persistent mount ownership, and the intended port/proxy setup. Download and verify the pinned production release bundle through its documented distribution channel; keep a versioned copy for recovery. If the release requires building, follow its maintained build procedure rather than the preview build.

Populate the release's configuration template using its actual keys, secret-file references, storage paths/volume definitions, image pins, auth owner setup, and external URL. Store any environment file privately (mode `0600` on POSIX, equivalent restrictive ACL elsewhere); prefer release-supported secret references for credentials. Public client configuration must contain no secrets. Use a stable Compose project name, and record which named volumes or bind mounts contain persistent data.

Command templates after substituting verified paths and chosen project name:

```sh
MEOS_COMPOSE_FILE='REPLACE_WITH_VERIFIED_PRODUCTION_COMPOSE_PATH'
MEOS_PRIVATE_ENV='REPLACE_WITH_PRIVATE_RELEASE_ENV_PATH'
MEOS_COMPOSE_PROJECT='REPLACE_WITH_STABLE_PROJECT_NAME'

docker compose --project-name "$MEOS_COMPOSE_PROJECT" --env-file "$MEOS_PRIVATE_ENV" -f "$MEOS_COMPOSE_FILE" config --quiet
docker compose --project-name "$MEOS_COMPOSE_PROJECT" --env-file "$MEOS_PRIVATE_ENV" -f "$MEOS_COMPOSE_FILE" pull
docker compose --project-name "$MEOS_COMPOSE_PROJECT" --env-file "$MEOS_PRIVATE_ENV" -f "$MEOS_COMPOSE_FILE" up -d
docker compose --project-name "$MEOS_COMPOSE_PROJECT" --env-file "$MEOS_PRIVATE_ENV" -f "$MEOS_COMPOSE_FILE" ps
```

Use `pull` when the release supplies images; use the documented build step instead when it supplies a supported source-build artifact. Apply any required release-specific initialization/migration at the documented point, not an invented command. Validate without printing a fully interpolated configuration. Configure the actual proxy/TLS or private access path; keep data-service ports internal. Inspect release-defined health/readiness and perform Stage 3 even if all containers are running.

For diagnosis, request bounded logs from the actual failing service and redact them before sharing:

```sh
MEOS_COMPOSE_SERVICE='REPLACE_WITH_ACTUAL_SERVICE_NAME'
docker compose --project-name "$MEOS_COMPOSE_PROJECT" --env-file "$MEOS_PRIVATE_ENV" -f "$MEOS_COMPOSE_FILE" logs --tail 100 "$MEOS_COMPOSE_SERVICE"
```

For an authorized controlled restart, use the same project/file/env selection with `restart` and the verified service name; do not restart every data service casually. For upgrades, verify the new release, preserve the prior bundle and private configuration securely, take the release-required recovery checkpoint, review migration compatibility, then repeat validation and the documented upgrade procedure. A prior image is not necessarily compatible with a migrated database: rollback only through the supported recovery path. Pause with the same selection and `stop` when requested. Uninstall only after identifying owned resources and retention requirements; never include `down --volumes`, volume pruning, or data deletion by default.

### Helm — later or existing Kubernetes deployment

Verify the selected cluster and namespace, Kubernetes/Helm compatibility, identity/RBAC, available resources, storage class and volume retention, ingress/private-network route, and TLS/certificate mechanism. Confirm the current context before any mutation; a familiar namespace name is not proof of cluster identity. Do not install cluster-wide controllers or broaden RBAC without authority.

Discover the release's real chart coordinates and pinned chart version. Verify provenance/digests using its supported mechanism. Read that version's values schema/defaults and migration instructions before preparing overrides. Use actual chart keys for persistent storage, image pins, resource requests/limits, secret references, auth, and routing; do not invent `values.yaml` fields. Prefer references to pre-created secrets or a supported secret manager. Treat private values files and Helm release metadata as potentially sensitive; do not pass passwords via `--set` or dump values into chat.

```sh
MEOS_KUBE_CONTEXT='REPLACE_WITH_VERIFIED_CLUSTER_CONTEXT'
MEOS_HELM_RELEASE='REPLACE_WITH_STABLE_RELEASE_NAME'
MEOS_NAMESPACE='REPLACE_WITH_TARGET_NAMESPACE'
MEOS_CHART='REPLACE_WITH_RELEASE_SUPPLIED_CHART_COORDINATE'
MEOS_CHART_VERSION='REPLACE_WITH_PINNED_CHART_VERSION'
MEOS_PRIVATE_VALUES='REPLACE_WITH_PRIVATE_VALIDATED_VALUES_PATH'
MEOS_ROLLOUT_TIMEOUT='REPLACE_WITH_RELEASE_APPROPRIATE_DURATION'

kubectl config current-context
kubectl --context "$MEOS_KUBE_CONTEXT" cluster-info
helm show values "$MEOS_CHART" --version "$MEOS_CHART_VERSION"
helm upgrade --install "$MEOS_HELM_RELEASE" "$MEOS_CHART" --version "$MEOS_CHART_VERSION" --kube-context "$MEOS_KUBE_CONTEXT" --namespace "$MEOS_NAMESPACE" --create-namespace --values "$MEOS_PRIVATE_VALUES" --wait --timeout "$MEOS_ROLLOUT_TIMEOUT"
helm status "$MEOS_HELM_RELEASE" --kube-context "$MEOS_KUBE_CONTEXT" --namespace "$MEOS_NAMESPACE"
```

Chart repository registration or OCI authentication, if needed, must follow the actual release instructions with credentials entered through supported private tooling. Validate the private values against the chart schema and its documented checks before installation. Avoid sharing rendered manifests or dry-run output containing Secrets. Do not use automatic rollback flags blindly when migrations may be irreversible. `--wait` confirms Helm's supported readiness checks, not persistence, successful login, or every application dependency; run Stage 3 and any release-defined migration-job checks separately.

Inspect only actual release-owned resources using the manifest's resource names/labels; avoid broad secret/configuration dumps. An authorized restart can use `kubectl rollout restart` and `kubectl rollout status` for the actual supported workload type/name, never an invented deployment name or indiscriminate data-service restart. Record release revision and previous artifact/version. Before upgrading, verify storage recovery and migration compatibility; review the new chart/schema and apply the validated values with the pinned new chart. `helm rollback` does not undo database migrations or restore external data: use it only when the release's compatibility rules permit it. Before uninstalling, inspect PVC retention, chart deletion hooks and external resource ownership; preserve data by default and do not delete the namespace as a shortcut.

## Recovery planning and verification

This guide does **not** enable backups or recovery. Before installation/upgrade approval, explain the selected release's recovery path, expected data-loss window and restoration limits using evidence, not promises. Reuse existing approvals; otherwise obtain the actual backup destination, retention/deletion policy, access authority and any costs before provisioning. Do not assume a vendor, retention period or cloud spending grant. Compose is the first single-host path; keep the maintained Helm example for a later cluster installation, not a prerequisite.

- Use the release/database-supported **consistent snapshot or export** mechanism, not a live database-file copy. Cover persistent application data plus the private configuration and secret material needed to restore; protect and restore secrets safely without putting them in receipts or chat.
- Verify an authorized **off-host copy** by its actual upload/integrity receipts; a local snapshot alone does not cover host loss. Document what is excluded and how encryption keys/configuration are recoverable by the owner.
- Restore into an **isolated** disposable target with verified test data/service identities and blocked real-provider egress (including Calendar sync, messaging and notifications). Verify restored data identities, intended login and supported migration behavior without touching production or exercising real providers. Record the restore result and remaining gaps.
- Verify scheduler startup at boot, durable/persistent missed-run handling, bounded retry behavior, health and last-success evidence. Verify an authorized **external stale-backup alert** that can detect host/scheduler failure, not only an alert running on the backed-up host.
- Record timer/job identity and next run, successful backup/run and off-host upload receipts, isolated restore receipt, and alert verification separately in the installation ledger. Do not claim recovery is enabled/verified from this text, an enabled timer or a configured destination alone. Report missing receipts or unsupported components explicitly.

This section is a planning/verification requirement, not a backup implementation or permission to create services or spend money.

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

### Configure per-install planning authority

Offer the choice explicitly and record the answer: proposal-only planning, or standing autonomy over MeOS-owned blocks on the dedicated MeOS calendar (create, move, resize, unschedule/remove planning blocks, revise and commit, constrained by user intent). Reuse an existing grant without asking again; never copy another user's grant into a new installation. Example opt-in policy: “Manage my MeOS blocks autonomously within my constraints; keep imported primary-calendar events read-only and ask before changing other commitments.” Guided/adaptive/quiet delivery modes are independent of this authority choice. Offer a **sample/proposal-only mode** to show a rough week/day plan without calendar writes; do not mistake sample success for installed scheduling.

Capture natural-language routine intent, frequency targets, soft time preferences and hard constraints separately. Explain future tentative defaults and target-day automatic commitment in prior-night preparation, with morning catch-up and current-revision/capacity checks. Verify actual schema support before enabling this behavior; record unsupported transitions as blockers. Record the Google-wins synchronization policy and protection of MeOS-only notes/estimates/history. Configure evidence-aware actuals and weekly estimation reflection; do not enable media capture or assume a tentative-notification suppression policy.

## Install idempotently

Use supported host configuration tools within the user's existing authority. Compare desired state with existing state before creating or updating anything. Preserve unrelated configuration. Use stable installation and job identifiers, reuse matching resources, and record previous values for changes to shared resources. Pin or record the installed skill versions and source references so upgrades can be reviewed.

Create an installation ledger in durable host storage containing the pinned MeOS release and installation-manifest reference, artifact verification, host/deployment path, service IDs, persistent-storage references, non-secret access endpoints, workspace/account identity, skill versions, job IDs, triggers, timezone, execution settings, authority, status, verification receipts, and remaining blockers. Never store tokens or secret values in it. A job created successfully is **configured**, not proof of a successful execution.

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
Provision a distinct `notifications:consume` principal through the release's
qualified native-principal procedure. Keep protected credential/configuration
files outside the ledger. The client requires an idempotent durable dispatcher:
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

### Configure recovery and supervision

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
