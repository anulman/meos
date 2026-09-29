# Connect the native host to an agent

Use this reference for a Linux/systemd host running the persistent native backend
and protected web adapter. It covers delegated-owner MCP, not notification worker,
backup, Calendar consent or planner activation. Those remain separately selected
features. You need installation authority and independently admitted artifacts;
reading this runbook grants neither release nor deployment authority.

When this is part of a broader bootstrap request, use its existing
[completion checklist](SKILL.md#keep-one-completion-checklist). This runbook's
scope does not remove selected features from that request. Return MCP proof as a
component checkpoint; the parent retains unfinished installation steps and their
next owners rather than closing the combined setup.

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

## Verify the authentication lifecycle

Inspect the deployed backend's actual authentication requirement before configuring
the client. MeOS requires a bearer over the private Unix relay: socket access does
not establish the application's owner identity. Do not remove authentication merely
because the transport is local.

Record access-token expiry and server-side session expiry separately. A successful
refresh replaces an expired access token; it does not necessarily extend the session
deadline. This MeOS host uses a dedicated session for the existing owner, valid until
revoked, while its short-lived access tokens refresh normally. That is an explicitly
admitted private-host policy, not a default for other MCP servers or clients. Verify
the selected release and installation policy rather than inferring lifetime from a
refresh token's presence.

Follow the shipped refresh contract. Pinned native MeOS reuses its refresh token;
the bridge refreshes on 401 and saves the new bearer atomically under its credential
lock. A lost refresh response or failed save can retry with the same session secret.
Do not require token rotation, add rotating-token compatibility or resurrect removed
refresh-intent state. Rotating refresh tokens are preferred for a future iteration,
but are neither a current dependency nor assumed supported behavior. Add no renewal
daemon, recurring cron or extra state unless the actual backend/client contract
demonstrates a need.

Qualify real signed-token expiry and renewal against the exact backend/bridge in an
isolated fixture, accounting for validation leeway; do not weaken validation or age
production credentials to force the test. Require authenticated discovery and a
harmless read after renewal, including after client process recreation. Then verify
actual personal and scheduled-agent discovery/read receipts as described below;
when scheduled access is used, include its expiry/renewal path in qualification.
Initial discovery alone is not lifecycle proof. Record fixture evidence separately
from live runtime evidence and disclose any unperformed check.

Deleting the MeOS session prevents further renewal; issued access tokens retain
their ordinary validity window, including validation leeway. Owner logout can also
revoke host sessions. Preserve the private session secret and reconcile revocation
before attempting recovery; never silently create a replacement session.

## Issue or reuse the delegated credential

1. Verify the deployed native revision supports ordinary-owner MCP and the
   expected migrations. Source presence does not prove deployed support.
2. Inspect only non-secret state/receipts to locate the existing owner’s live
   client credential. If that client already has a valid pair, reuse
   it. For a new client, follow the admission schema in
   `clients/meos-host/README.md` and `scripts/delegated-session.py`: an independent
   reviewer binds the helper, state and access-config hashes, environments,
   existing owner and output path. For an unattended private host, explicitly
   select `sessionPolicy: "host-until-revoked"` in that admission. This affects
   only the new host session; access tokens still expire and refresh normally.
   The default CLI session expires after 12 hours. Invoke only the admitted helper:

   ```sh
   # Replace each placeholder with a verified private path; never token values.
   sudo python3 /PINNED/scripts/delegated-session.py \
     --state /PRIVATE/runtime-state.json --access-config /PRIVATE/access.json \
     --admission /PRIVATE/delegated-admission.json --output /PRIVATE/new-client
   ```

3. Store the pair in a private client directory (0700; files 0600), with trusted
   ancestors and write access for locks and atomic refresh persistence. Install
   the bridge source read-only. Mint separate sessions for independent clients;
   do not share a refresh token or create another principal by default. Never print credentials, pass them in argv, or put them in the ledger.

## Install the private socket and persistent stdio registration

Render `deployment/meos-host-upstream.{socket,service}.in` using the verified
backend prefix, native **server** socket and gateway user. The relay uses reserved
UID/GID 61006 through `setpriv`, dropping all effective/permitted/bounding/ambient
capabilities before executing `systemd-socket-proxyd`. Its launcher alone retains
the capabilities needed to drop identity. Keep the backend’s reserved-ID collision
check and server-socket ACL gate. Never grant Docker, admin-socket or depot access.

The socket-only directory is 0755 so the unprivileged bridge can open a directory
FD; the socket remains gateway-owned 0600. Do not put credentials in that directory
or make the socket world-readable/writable. `DirectoryMode` controls creation;
it does not repair an existing 0711 directory. During an authorized upgrade,
verify the exact directory is socket-only, reconcile its owner/mode through
supported host controls, and read back the directory and socket permissions.
Do not recursively chmod a configuration tree. Enable the socket as the backend’s
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

Omit `outbox` for MCP-only access. Register the stdio command and arguments using
the consuming host's supported persistent MCP configuration:

```json
{
  "command": "/usr/bin/python3",
  "args": ["/PINNED/clients/meos-host/mcp_bridge.py", "/PRIVATE/mcp/config.json"]
}
```

These are process-launch values, not a universal host configuration schema.
Discover the host's registration and probe capabilities; inspect the current
registration before adding it. An unchanged repeat must not rewrite it. The
integration-specific setup belongs in `clients/meos-host/README.md`, not in the
MeOS MCP contract. Registration/probing can connect and refresh credentials;
preserve the current private pair after the probe. Verify authenticated
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
reference and prior receipts before retrying. Reconcile surviving mint
intents with native session state. The issuance copy is not a live credential
backup; never copy it over the live file or blindly mint another session. Resume only
missing steps. Preserve uncertain effects as blocked until reconciled, retaining
an owner and next action. Report installed, doctor/direct protocol, personal-tool
and scheduled-tool readiness separately, including unperformed expiry/rebind
proofs. Finish with confirmed user-channel delivery, not just a saved report.
