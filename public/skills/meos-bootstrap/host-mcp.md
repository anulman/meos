# Connect the native host to an agent

Use this reference for a Linux/systemd host running the persistent native backend
and protected web adapter. It covers delegated-owner MCP, not notification worker,
backup, Calendar consent or planner activation. Those remain separately selected
features. You need installation authority and independently admitted artifacts;
reading this runbook grants neither release nor deployment authority.

## Pin and reconcile the application

Use the same reviewed checkout for this guide, `deployment/` and
`clients/meos-host/`. Record its full commit, native image digest and immutable
release manifest in the installation ledger. Never combine helpers from one
revision with another revision’s admission hashes.

The shipped path uses a network-isolated Docker native runtime with persistent
depot storage, a protected web adapter, systemd socket activation and private
Unix sockets. It is not the demo nginx Compose preview. Inspect these canonical
sources in your **pinned checkout**, in lifecycle order:

- `scripts/production-stage.py`: exact qualified artifacts plus independently
  admitted runtime/helpers into a new immutable release; no build or activation.
- `scripts/production-bootstrap.py`: admitted instance/owner initialization;
  reconcile existing identity first, never initialize over a live depot.
- `scripts/production-render.py` and `deployment/meos-{backend,web}*`: render
  reviewed units into a new directory, not install/start them.
- `scripts/production-ready.py`: validate native image/container/volume/instance
  identity and grant only server-socket access to reserved service identities.
- `clients/meos-host/README.md`: delegated credential admission and optional
  event-worker contract; MCP-only setup stops before listener/worker installation.

The current production helpers contain host-specific origin/runtime assumptions.
They are not a universal installer. On another host, obtain reviewed configuration
support and exact artifact/license admission before running them; do not copy
another installation’s identifiers, rewrite checks ad hoc, or use acceptance
bootstrap as production authorization. Reuse a verified existing deployment.
Render, review and validate units before authorized activation. Preserve current
storage, rollback artifacts and human release gates.

## Issue or reuse the delegated credential

1. Verify the deployed native revision supports ordinary-owner MCP and the
   expected migrations. Source presence does not prove deployed support.
2. Inspect only non-secret state/receipts to locate the existing owner’s live
   client credential. If that client already has a valid rotating pair, reuse
   it. For a new client, follow the admission schema in
   `clients/meos-host/README.md` and `scripts/delegated-session.py`: an independent
   reviewer binds the helper, state and access-config hashes, environments,
   existing owner and output path. Invoke only the admitted helper:

   ```sh
   # Replace each placeholder with a verified private path; never token values.
   sudo python3 /PINNED/scripts/delegated-session.py \
     --state /PRIVATE/runtime-state.json --access-config /PRIVATE/access.json \
     --admission /PRIVATE/delegated-admission.json --output /PRIVATE/new-client
   ```

3. Store the pair in a private client directory (0700; files 0600), with trusted
   ancestors and write access for locks and atomic refresh persistence. Install
   the bridge source read-only. Mint independent sessions only for independently
   refreshing clients; do not share a refresh token or create another principal
   by default. Never print credentials, pass them in argv, or put them in the ledger.

## Install the private socket and persistent stdio registration

Render `deployment/meos-host-upstream.{socket,service}.in` using the verified
backend prefix, native **server** socket and gateway user. The relay uses reserved
UID/GID 61006 through `setpriv`, dropping all effective/permitted/bounding/ambient
capabilities before executing `systemd-socket-proxyd`. Its launcher alone retains
the capabilities needed to drop identity. Keep the backend’s reserved-ID collision
check and server-socket ACL gate. Never grant Docker, admin-socket or depot access.

The socket-only directory is 0755 so the unprivileged bridge can open a directory
FD; the socket remains gateway-owned 0600. Do not put credentials in that directory
or make the socket world-readable/writable. Enable the socket as the backend’s
dependency through supported host controls. A relay-only restart proves less
than a full backend/socket rebind: qualify the latter in an isolated fixture,
and claim live lifecycle proof only when actually authorized and observed.

Write a private config using the schema in `clients/meos-host/README.md`:

```json
{
  "origin": "https://YOUR_VERIFIED_NATIVE_ORIGIN",
  "socket": "/run/meos-host/backend.sock",
  "credentials": "/PRIVATE/mcp/credentials.json",
  "instanceId": "YOUR_VERIFIED_INSTANCE_ID",
  "environment": "production"
}
```

Omit `outbox` for MCP-only access. OpenClaw installations exposing the following
CLI can register stdio persistently. Discover `openclaw mcp --help`, `add --help`
and `doctor --help` on the installed host first; flags and tool namespaces are
host/version-specific. Inspect existing registration before adding it; an unchanged
repeat must not rewrite it.

```sh
openclaw mcp add meos --command /usr/bin/python3 \
  --arg /PINNED/clients/meos-host/mcp_bridge.py --arg /PRIVATE/mcp/config.json
openclaw mcp doctor meos --probe --json
```

The add/probe commands connect and may refresh credentials; they are not passive
inspection. Preserve the current private pair after the probe. Verify authenticated
initialization, tool inventory and a harmless read. Use the supported native
`/api/meos/v1/session` read through a private authenticated client to compare the
effective subject with the intended owner; do not invent a `whoami` MCP tool.
Verify instance/workspace context as well as identity. Record non-secret receipts.

## Catalog refresh and recovery

Discover the actual model-tool namespace and input schema; `list_agenda` is a
harmless read in the shipped native catalog, not a promise of a universal host
prefix. Supply a valid date and named local timezone. Require actual tool-call
and result evidence from both the personal agent and a one-shot isolated/scheduled
agent. Use a restricted read-only tool policy and **no delivery** for the scheduled
probe; disabling delivery alone does not disable messaging tools. Do not exercise
real rituals or planner/calendar writes to prove access.

If registration is healthy but the current turn cannot discover tools, persist:
exact missing proof, pinned registration/config references, intended identity,
next harmless call, existing evidence, owner/run ID, verified execution state,
next action and completion-delivery route. Request a supported fresh-turn
continuation with accepted ownership; distinguish queued from running. Do not
restart a healthy gateway to change a turn snapshot. If the host cannot create an
owned continuation, report that exact capability blocker, not work “continuing.”
The parent must consume completion and deliver the result; no user nudge is needed.

After interruption, inspect live registration, units, current private credential
reference and prior receipts before retrying. Reconcile surviving mint/refresh
intents with native session state. The issuance copy is not a backup of a rotating
pair; never copy it over the live file or blindly mint another session. Resume only
missing steps. Preserve uncertain effects as blocked until reconciled, retaining
an owner and next action. Report installed, doctor/direct protocol, personal-tool
and scheduled-tool readiness separately, including unperformed expiry/rebind
proofs. Finish with confirmed user-channel delivery, not just a saved report.
