# Connect a delegated MeOS owner to OpenClaw

This host adapter targets a persistent Linux VPS with Python 3, systemd and
OpenClaw's stdio MCP, agent-hook and tools-invoke APIs. It provides delegated MCP
access and a SQLite notification outbox. It does not merge or deploy MeOS,
change Calendar grants, or infer task completion from elapsed time.

## About identities and delivery

Use a renewable session for the existing owner. A session is a credential, not
another user. `scripts/delegated-session.py` verifies the admitted owner and
issues a native session without writing users or grants. Mint independent
sessions for independent clients; do not share a refresh token between the MCP
bridge and Go notification client.

### Persistent host authentication

The native MCP endpoint requires a bearer even over the private Unix relay;
the relay does not authenticate a MeOS owner. Keep that boundary. For an
unattended private host, explicitly admit `sessionPolicy: "host-until-revoked"`
in the session helper's admission. The helper mints one independent session for
the existing owner, then sets **only that session** to native's nonexpiring
refresh lifetime (`i64::MAX`). The default `native-12h` remains suitable for
short-lived operator access. No global auth configuration or grants change.

Access tokens still expire. The bridge refreshes on 401 and atomically saves
the new bearer under a lock. Pinned native refresh preserves the session secret
and does not consume it, so a lost response or interrupted save can retry safely.
There is no refresh-intent state or rotating-token compatibility path.

Deleting the native session revokes renewal; already issued access tokens remain
valid until their normal expiry. Owner logout can invalidate host sessions too.
Store the session secret as a private 0600 file under a 0700 directory. A host
session is not permission for network clients to bypass authentication.
When upgrading, reconcile and archive any old refresh-intent and expired pair;
never resurrect an expired/deleted session or reuse an issuance copy as backup.

Native MCP now accepts ordinary owners acting on their own resources. Existing
agent grants remain scoped, expiring and revocable; expired grants never fall
back to owner access. Location bridge identities remain excluded. The forward
migration `U1790380807__delegated_notifications.sql` preserves notification
leases, event IDs and acknowledgment tokens while allowing existing owners.
**Deploy the reviewed backend revision and migration before expecting owner MCP
or notifications to work.** Host source installation alone does not change the
running backend.

The event worker has a deliberately narrower role than the planning rituals:

1. Persist each listener event before acknowledging queue admission.
2. Read each constituent's current revision, schedule and cancellation state.
3. Ask a restricted OpenClaw agent to draft a notification, not execute effects.
4. Accept its proposal through `propose_boundary`, bound to the event's private
   capability. An agent turn or accepted proposal is not a handling receipt.
5. Re-read freshness, persist delivery intent, and send to one configured owner.
6. Store the provider's message ID and chat ID before marking constituents
   delivered. A stale/inactive/already-handled event becomes a verified no-op.

The worker does not perform planner mutations. Morning/evening rituals retain
that separate authorized role. Unknown execution or delivery outcomes remain
blocked for reconciliation; they are never blindly replayed. A provider receipt
confirms message acceptance, not that the user read it. SQLite is not a claim
of exactly-once external effects.

## Install the common local path

1. Qualify and deploy the backend change through your normal release gate.
   Preserve the previous runtime and existing notification rows. The synthetic
   tests below do not establish native deployment or live connectivity.
2. Verify the exact native instance/container/volume and configured existing
   owner. Create a root-owned0600 admission for `scripts/delegated-session.py`
   containing status `approved-delegated-session`, reviewer, evidence,
   scriptSHA256, stateSHA256, accessSHA256, environment, runtimeEnvironment and
   output. Physical acceptance fixtures can have runtime environment production;
   bind both values explicitly. Invoke the helper with `--state`,
   `--access-config`, `--admission`, `--output`. Never print credentials.
3. Install source read-only. Copy each session pair into its client's private
   directory, mode0700 with mode0600 files and non-writable ancestors. An
   unresolved mint intent requires reconciliation, not deletion and retry.
4. Expose only the native socket through
   `deployment/meos-host-upstream.{socket,service}.in`. Resolve the backend
   prefix, native socket and gateway user. The proxy uses reserved UID61006;
   the reviewed backend readiness helper checks it is not an existing account
   and grants socket access. Neither gateway nor proxy needs Docker/data-volume
   access. Bind mounts shorten the path; the bridge also supports long native
   paths via a directory FD when permissions permit.
   Enable the socket as a backend dependency. `PartOf`/`After` stop and rebind
   the socket proxy across backend restarts. Verify a fresh connection after
   restart; a stale bind-mounted inode is not readiness.
5. Write the MCP config:

   ```json
   {
     "origin": "https://NATIVE_ORIGIN",
     "socket": "/run/meos-host/backend.sock",
     "credentials": "/PRIVATE/mcp/credentials.json",
     "instanceId": "EXACT_INSTANCE",
     "environment": "production",
     "outbox": "/PRIVATE/outbox"
   }
   ```

   Omit `outbox` for MCP-only activation. It enables the local proposal tool, not
   a second native identity. Register the installed `mcp_bridge.py CONFIG` as a
   stdio MCP server, run `openclaw mcp doctor meos --probe`, and verify actual
   personal and isolated/scheduled `list_agenda` calls. Do not expose broader
   filesystem access merely to solve socket permissions.
6. Install the maintained Go listener from `clients/meos-agent`. Its current
   transport requires HTTPS; `scripts/serve-agent-tls.mjs` supplies the private
   loopback endpoint without changing browser ingress. Use localhost SAN and
   trusted CA, strict route allowlisting and fixed upstream origin. Do not
   disable TLS verification. A remote/shared-container deployment can prefer
   authenticated HTTP MCP instead of local stdio; it needs its own reviewed
   transport configuration.
7. Resolve the worker service `@MCP_CREDENTIAL_DIR@` to the private directory
   containing its bridge credential pair (not the entire home/config tree).
   The bridge needs write access there for its lock and atomic refresh files,
   as well as write access to the outbox.
   Configure listener dispatch argv as installed `dispatcher.py admit --state
   /PRIVATE/outbox`. The listener's accepted receipt means SQLite admission,
   not agent completion. Install the worker service with config:

   ```json
   {
     "mode": "notifications",
     "hookHost": "127.0.0.1",
     "hookPort": 18789,
     "hookTokenFile": "/PRIVATE/hooks-token",
     "agentId": "meos-notification-drafter",
     "mcpConfigFile": "/PRIVATE/mcp/config.json",
     "gatewayTokenFile": "/PRIVATE/gateway-token",
     "deliveryTarget": "telegram:OWNER_CHAT_ID"
   }
   ```

   The named OpenClaw execution profile is not a MeOS identity. Configure its
   tool policy to allow only MeOS reads and `propose_boundary`; deny messaging,
   shell, file writes, delegation and planner mutations. Verify those denials
   before enabling the worker. The hook's `deliver:false` alone is not a tool
   restriction. The worker uses the existing trusted gateway operator token
   for `/tools/invoke`; this token is **not** a scoped messaging credential.
   Keep it private, loopback-only and unavailable to the drafting agent.
8. Supervise the listener and worker. SQLite resides on persistent storage,
   with FULL/WAL commits and one flock-protected worker. This implementation
   uses the gateway Unix identity for the bridge, listener/worker and local TLS
   endpoint (the socket-only proxy remains UID61006); it is not credential
   isolation between listener, bridge and worker. Verify live admission,
   agent proposal, freshness, provider receipt and service restart separately.

Install authorized ritual schedules independently of the event pipeline.
Existing schedules must not be recreated: 07:00 morning, 21:00 evening, with
Sunday weekly review following evening close in one execution. Missing MCP
blocks planning with an explicit report, not schedule installation.

## Read status and recover

Run `dispatcher.py status --state /PRIVATE/outbox`. `queued` and `dispatching`
are not completed states. `handled_noop` records fresh cancellation/staleness or
previous handling. `handled_delivered` requires persisted provider evidence.
`blocked_unknown`, `blocked_terminal` and `blocked_unverified` retain work and
run IDs. Constituent receipts survive changes in event grouping.

Inspect the private SQLite `constituents`, `deliveries` and `proposals` tables
when reconciling a blocked run. Never delete delivery intents to force a retry.
Unknown external delivery requires provider/transcript investigation. No unsafe
retry command is supplied. Journal alerts identify blocked events once; wire
service/journal failure monitoring to the installation's notification route.
A journal line is not proof the owner received an alert.

For shared multiworker deployments prefer an existing transactional database
outbox with atomic claims. For ephemeral/serverless deployments use a durable
managed queue/store. Do not share this SQLite file across hosts or put it on
container scratch storage.

## Verify the candidate

The trusted launchers isolate tests from host credentials, production data,
Docker and external networking:

```sh
sudo python3 scripts/backend-test-runner.py
sudo python3 scripts/host-test-runner.py
sudo python3 scripts/host-template-test-runner.py
```

The backend/host runners write source-hashed receipts under `.qualification`.
The template runner prints a source-hashed result for capture in your ledger;
it verifies the shipped privilege-drop command, zero capabilities, directory-FD
access and non-owner socket denial in an isolated synthetic fixture. It does not
claim proxy lifecycle or live backend rebind coverage. Tests cover delegated
owner/service separation, preservation migration, current/tombstone/command
receipt reads, long Unix paths, renewable credentials, durable proposals,
regrouped constituents, cancellation during drafting and ambiguous delivery
without replay. Installed OpenClaw hook completion omits assistant text; the
proposal tool is therefore required rather than assuming a summary field.

Before production activation, additionally qualify the rebuilt native guest,
existing-owner mint/refresh, actual socket proxy rebinding, restricted agent
policy, TLS listener and real gateway/provider receipt shape in a disposable
native fixture. Production delivery is a separate authorized operation.
