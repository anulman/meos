# Install and verify the persistent application

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

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


Next: [configure the operating agent](agent.md) when selected, or [verify and hand off](verify.md). Load [recovery](recovery.md) only when selected or needed for an existing-instance migration.
