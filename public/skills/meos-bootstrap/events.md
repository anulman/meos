# Configure selected event delivery

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

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

## Optional update-driven retrieval

After explicitly enabling external embedding work, the delegated-owner session (or an existing service principal with both `notifications:consume` and `search:index`) can configure `recordUpdates:true`. Route only `record.updated` to [meos-on-event-updated](../meos-on-event-updated/SKILL.md) in the durable host dispatcher; keep timed-boundary routing unchanged. The installed long-poller alone does not install that routing. Use the delegated-owner session within the executor’s private credential boundary and an already-authorized matching embedding capability; no extra identity is required. No capability is a normal no-op. Reconcile pending jobs in bounded batches at explicit setup/startup or retention gaps; notification acknowledgement is not embedding completion. See [search](../search.md) for interactive query embeddings.


Next: [verify and hand off](verify.md).
