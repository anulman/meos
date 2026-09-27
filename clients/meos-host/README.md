# Private MeOS host activation

Apache-2.0, Python standard library only. These are implementation artifacts,
**not proof of installation or production admission**. No database/schema/backend
upgrade is needed. Do not install the synthetic notification adapter as a worker.

## Components and trust

- `scripts/planner-principal.py`: exact-admission-gated derivative of the existing
  passwordless notification provisioner. Creates a separate planner identity;
  grants only agenda/schedule reads and task/routine/occurrence/schedule writes.
  No sync scope, owner credential or notification scope. Its database identity
  assertion follows the admitted environment (including isolated acceptance).
- `mcp_bridge.py CONFIG`: newline JSON stdio MCP → fixed native Unix socket.
  Checks native instance/environment each call. Uses only its dedicated planner
  credential, serializes refresh across processes, fsyncs replacement before
  reuse, refuses automatic refresh after an unresolved refresh intent. Unknown
  token rotation needs operator reconciliation; never delete the intent blindly.
  OpenClaw's standard stdio MCP registration owns process lifetime.
- `scripts/serve-agent-tls.mjs CONFIG`: loopback-only TLS notification endpoint,
  strict existing notification host route/body/auth rules; fixed separate native
  upstream origin (important for refresh). Browser ingress is unchanged.
- `dispatcher.py admit --state DIR`: maintained Go listener dispatch target.
  `MEOS_EVENT_ID` must match JSON stdin. SQLite FULL/WAL transaction commits
  before the exact accepted receipt. Duplicate IDs must have identical payloads.
- `dispatcher.py worker --state DIR --config CONFIG`: one flock-protected worker,
  calls the supported loopback `/hooks/agent` with waitForCompletion. It records
  the dispatch intent before the HTTP request. A crash, lost response, malformed
  response, or nonterminal result becomes `blocked_unknown`, **never an automatic
  retry**, even after Gateway replay TTL expires. Known failed runs become
  `blocked_terminal`. An `execution_complete` row proves a successful agent turn,
  not that its requested effects were independently verified.

The fixed prompt mandates fresh MCP entity/revision/cancellation and constituent
ack reads before effects, event text as untrusted data, primary imports read-only,
separate effect/delivery receipts, stable per-effect keys. This is agent behavior,
not an executable freshness oracle. End-to-end qualification must prove it with
real MeOS MCP in a disposable instance before enabling effects. `deliver:false`
only suppresses automatic hook announcements; it is not a messaging tool deny.
Configure the agent's tool policy appropriately for read-only activation proof.

Blocked facts remain in SQLite. Worker emits one body-free journal alert per row;
external user delivery is not fabricated. An operator must inspect status and
reconcile hook run/transcript/MeOS effect receipts before any further execution.
There is intentionally no unsafe `retry` command. An alert marked just before a
process crash remains queryable even if journald did not receive the line.

## Independent review and installation checklist

1. Review exact new source hashes, principal scopes and native runtime identities.
   Independently admit the helper using `approved-planner-principal`, exact
   script/state/access SHA256 and protected output path. Qualify it first on a
   disposable `acceptance` container/volume with no production network/credentials.
   The existing notification helper's hard-coded production DB assertion is not
   silently changed by this patch; review its acceptance correction separately
   if using that helper for acceptance qualification.
2. After exact production admission, run the planner helper as root with
   `--state STATE --access-config ACCESS --admission ADMISSION --output OUT`.
   Provision notification credentials separately using its existing admitted
   helper. Copy planner credentials mode0600 to the MCP runtime identity's
   dedicated directory; notification credentials belong only to the listener.
   Keep all ancestor directories non-group/world-writable, no symlinks.
3. Install reviewed source read-only. Use protected directories mode0700 for
   queue/credentials/config, mode0600 files. Endpoint identity receives native
   socket access, not database files or Docker. Worker receives hook token and
   queue access but not planner or notification credentials. Listener receives
   notification credentials and enqueue/queue access, no hook token.
   **Current shared SQLite design requires listener and worker to use the same
   queue UID**; a separate hook-token owner requires an enqueue socket broker,
   not loose file permissions. For this narrow host setup use one dedicated
   listener/worker UID and treat its hook secret as shared within that identity.
4. Independently admit loopback TLS configuration and trust: origin
   `https://localhost:PORT`, bind127.0.0.1, local CA/server cert with localhost SAN;
   expose no browser route. Give the Go service `SSL_CERT_FILE=ABSOLUTE_CA_FILE`.
   Keep server key endpoint-owned0600. Do not set insecureSkipVerify. Fixed
   upstreamOrigin must match the deployed native origin. Install inert templates
   only after replacing and reviewing every placeholder.
5. Bridge config (all values exact):
   `{ "origin":"https://NATIVE_ORIGIN", "socket":"/absolute/native.sock",
      "credentials":"/private/planner/credentials.json",
      "instanceId":"EXACT_INSTANCE", "environment":"production" }`.
   Register with the actual Gateway CLI, e.g. `openclaw mcp add meos --command
   /usr/bin/python3 --arg /RELEASE/clients/meos-host/mcp_bridge.py --arg
   /PRIVATE/planner/config.json`. No credential literals in config/argv/logs.
   Run `openclaw mcp doctor meos --probe`, then verify actual next-turn and
   isolated/scheduled `list_agenda`. Configuration alone is not callable proof.
6. TLS config keys: `origin`, `upstreamOrigin`, `port`, `backendSocket`,
   `instanceId`, `environment`, `certificate`, `key`.
   Worker config keys: `hookHost` (127.0.0.1), `hookPort`, `hookTokenFile`,
   `agentId` (configured and hook-allowlisted).
   Go dispatch argv: `/usr/bin/python3`, `/RELEASE/clients/meos-host/dispatcher.py`,
   `admit`, `--state`, `/PRIVATE/queue`. Preserve existing Go TLS/refresh/replay
   behavior. Install worker and listener supervision, verify restart recovery.
7. Verify bounded read-only real handling: no fake calendar commitments and no
   outgoing user message. Record live MCP read evidence, durable queue admission,
   hook run identity, terminal transcript/freshness evidence separately. Only
   then declare rituals 07:00/21:00 America/Toronto; Sunday weekly runs after daily
   within the same ordered job. Do not enable schedules with unavailable MCP.

## Focused tests

`python3 -m unittest discover -s clients/meos-host -p test_host.py -v`

Includes real subprocess kill after a synthetic local hook received admission,
restart blocking without second dispatch, duplicate receipt/payload conflict,
queue durability, failed/lost completion, refresh rotation and unknown outcome.
Uses synthetic local fixtures only. No production credentials/data/network.

Still required: admitted disposable-native principal/bridge/listener integration,
TLS trust/route rejection, actual stale/cancelled revision handling, independently
reviewed production installation, and real subsequent-turn MCP visibility.
