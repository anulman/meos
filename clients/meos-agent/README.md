<!-- SPDX-License-Identifier: Apache-2.0 -->
# meos-agent

A small Go-standard-library native long-poll client. No idle LLM calls, browser,
Node runtime, webhook listener, plugin framework, or third-party Go module.
Linux and macOS, amd64 and arm64. Delivery is **at least once**, not exactly once.

## Installation

Release archives contain a binary, Apache-2.0 project license, retained Go
notices and service examples. Verify the pinned release's `SHA256SUMS` before
installing its binary to `~/.local/bin/meos-agent`. Do not pipe a download into
a shell. Source includes a release workflow; **no published release is implied**.

Create a mode-0700 configuration directory and mode-0600 JSON files using a local
editor or your secret manager. Never send tokens in chat or put them in argv.
Obtain a dedicated native principal with only `notifications:consume`; never
reuse owner/browser or Calendar-sync credentials. Server provisioning must use
the existing independently qualified native-principal process and matching grant.

`config.json` (replace absolute paths):

```json
{
  "url": "https://meos.example.com",
  "credentialsFile": "/home/USER/.config/meos-agent/credentials.json",
  "stateDir": "/home/USER/.local/state/meos-agent",
  "dispatch": ["/absolute/path/to/durable-agent-dispatcher", "accept-meos-event"],
  "dispatchTimeoutSeconds": 60
}
```

`credentials.json` contains `authToken` and `refreshToken`. Its parent directory
must be private because refresh replacements are written atomically there.
The client uses standard system TLS roots, disallows redirects, and sends only
the configured native bearer credential. No tokens or event bodies are logged.

```sh
meos-agent install /absolute/config.json
meos-agent doctor /absolute/config.json
meos-agent run /absolute/config.json
meos-agent status /absolute/config.json
```

`install` validates configuration and initializes private durable state; it does
not silently modify your service manager. Copy/edit the included systemd user
unit or launchd plist, then explicitly enable it using your platform's normal
service-management commands. Only one process may own a state directory. Use a
single installation per agent identity; the server additionally enforces a lease.
Stop the daemon before `doctor`, `configure` or `ack-gap`; local `status` works
while running. SIGTERM/SIGINT cancel HTTP and dispatch, retaining unacknowledged
work. A supervisor restart is safe; do not delete state to clear an error.

## Durable dispatch contract

The executable is launched directly with fixed config argv, **never a shell**.
One entire event envelope is JSON on stdin; `MEOS_EVENT_ID` is a stable ID. The
child gets a minimal environment (PATH and this ID), not client credentials.
Stdout must be exactly `{"id":"<same event ID>","accepted":true}` after durable
runtime queue admission or reconciliation of an earlier admission. Exit zero or
merely starting an agent is insufficient. Stdout is bounded to 4096 bytes; stderr
is discarded to avoid sensitive event leakage. Dispatch timeout is 1–90 seconds;
the client kills the process group on timeout/cancellation. Adapters needing
other configuration should use fixed argv paths to protected local files.

Your runtime adapter must make admission idempotent by event ID and persist its
receipt before responding. If the client dies after admission but before saving
its local receipt, the same event is handed to the adapter again. **Reconcile
unknown prior handoff before retrying effects.** This client transports work; it
does not claim that an absent/stopped agent harness wakes itself. The configured
runtime queue/worker must be supervised too. Agent effects need their own stable
idempotency keys and causation metadata; transport acknowledgement means durable
handoff, not completion of the agent's business task.

The local journal is fsync + atomic rename + directory fsync, mode0600 in a
mode0700 directory. Accepted IDs suppress duplicate dispatch after lost ack;
entries are retained for14days (server event retention7days). A pending ID is an
unknown handoff to reconcile, not evidence of success. Server leases last120s;
the client requests one envelope at a time so each bounded dispatch can finish
and ack within the lease. A shared-boundary envelope can contain multiple events.

## Preferences and gaps

Pre-alert offsets in minutes resolve instance → routine → agent → `[15]`.
Explicit `[]` disables only pre-alerts, never start/end boundaries.

```sh
printf '%s' '{"preMinutes":[15],"instances":{},"routines":{}}' | meos-agent configure /absolute/config.json
```

A retention gap stops dispatch and requires an operator/agent to reconcile the
current agenda against its durable accepted work. After that reconciliation:

```sh
meos-agent ack-gap /absolute/config.json
```

Never acknowledge a gap just to silence an alert. Revocation/expired grants fail
closed. Connection/server errors use capped exponential jitter and Retry-After;
empty responses wait at least1s after the server's bounded long poll.

## Building and qualification

`toolchain.json` pins the exact Go1.27.1 Linux build archive and its SHA256, plus
reviewed permissive notice hashes. The client has no external modules. In an
isolated environment with the pinned compiler, run `go test ./...`, then
`python3 scripts/agent-client-release.py` from the repo root. The executable gate
rejects unexpected toolchain notice hashes or non-stdlib dependencies. Builds
use CGO=0, trimpath, no VCS injection and deterministic archives/checksums.

Host qualification uses `sudo python3 scripts/agent-client-test-runner.py`:
private network namespace, synthetic loopback TLS only, protected host paths,
exclusive test UID, empty environment. Never execute tests with production
credentials or access. Deployment and actual release publication are separate
gates. Cross-compilation is not evidence of execution on macOS/arm64.
