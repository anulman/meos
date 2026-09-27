<!-- SPDX-License-Identifier: Apache-2.0 -->
# meos-agent

A small Go-standard-library native long-poll client. No idle LLM calls, browser,
Node runtime, webhook listener, plugin framework, or third-party Go module.
Linux and macOS, amd64 and arm64. Delivery is **at least once**, not exactly once.

## Installation

The supported distribution is source-only. Install from a reviewed, pinned commit
or version with Go (replace `REVIEWED_COMMIT_OR_VERSION` before execution):

```sh
go install github.com/anulman/meos/clients/meos-agent@REVIEWED_COMMIT_OR_VERSION
```

Before this branch is merged, select its reviewed commit explicitly, not `latest`.
The binary is installed in `GOBIN`, or `$(go env GOPATH)/bin` when `GOBIN` is unset.
Alternatively, from a verified checkout, run `go install .` in
`clients/meos-agent`. Use a supported Go compiler satisfying `go.mod`; qualification
uses the exact compiler in `toolchain.json`. No precompiled consumer archives are
published by this workflow.

For another host/runtime, read `main.go` and the durable dispatch contract below
and implement an equivalent client. Preserve authentication/refresh, bounded
long polling and backoff, leases, stable event IDs, durable deduplication and
handoff-before-ack, cancellation, retention-gap reconciliation, and restart
recovery. Qualify that implementation before enabling it; reading the source is
not compatibility evidence. Prefer installing this client when it fits the host.
Bootstrap agents should choose one of these paths after discovering the host,
then configure and supervise both the client and its durable dispatcher.

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
unit or launchd plist, replacing its executable path with the installed binary
(`GOBIN` or `$(go env GOPATH)/bin`), then explicitly enable it using your platform's normal
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

`toolchain.json` pins the exact qualification compiler archive and reviewed
permissive license hashes. The client has no external modules. CI runs Go tests
and the fail-closed dependency/toolchain-license gate, without uploading binaries.
The private qualification builder remains available for native transport proofs;
its temporary archives are test inputs, not consumer release artifacts. It copies
required notices from the verified local Go toolchain at build time rather than
vendoring them in this source tree. Keep notices with any binary you redistribute.

Host qualification uses `sudo python3 scripts/agent-client-test-runner.py`:
private network namespace, synthetic loopback TLS only, protected host paths,
exclusive test UID, empty environment. Add `--check-only` for the license/dependency
gate without building archives, or `--release` only for private qualification
fixtures. Never execute tests with production
credentials or access. Deployment and actual release publication are separate
gates. Cross-compilation is not evidence of execution on macOS/arm64.

## Optional record updates

`recordUpdates:true` notification preferences opt into committed source-update envelopes. Both `notifications:consume` and `search:index` are required; boundary-only subscriptions remain unchanged. Enabling starts from current outbox high water, so backfill comes from pending search jobs. `record.updated` contains `source:{kind,id,revision,operation}` and `sequence`; event IDs remain 48 hex characters. The durable client forwards the envelope unchanged, with no token in child environment. Configure a host dispatcher to select `meos-on-event-updated`; the client does not install a skill router. Keep timed-boundary handling unchanged.

Durable accepted receipt and ack mean admission, not embedding completion. Missing provider capability is a normal no-op. Pending jobs survive ack/failure for bounded existing-pipeline reconciliation; lease expiry does not execute a worker. Commit writes derived search tables only and cannot produce another update notification. The seven-day retention/gap contract also applies to updates; reconciliation must inspect pending jobs as well as agenda state.
