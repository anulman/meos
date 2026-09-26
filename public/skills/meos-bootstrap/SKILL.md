---
name: meos-bootstrap
description: Install, inspect, update, pause, or uninstall MeOS operating skills in an agent's environment, including appropriate schedules, execution settings, authority, and a supported event long-poller.
---

# Bootstrap MeOS operating skills

Use when the user wants to configure their agent to run MeOS rituals. Reading this document alone authorizes no installation or side effects. This skill configures the host through its supported tools; it does not add a MeOS callback framework or invent MCP operations.

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

Create an installation ledger in durable host storage containing the workspace/account identity, skill versions, resource IDs, triggers, timezone, execution settings, authority, status, verification receipts, and remaining blockers. Never store tokens or secret values in it. A job created successfully is **configured**, not proof of a successful execution.

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

Report what is configured, what is verified running, the next scheduled executions, and exact blocked/unverified parts. Include the installation record location or resource ID and how to inspect, pause, update, and uninstall. Do not declare the entire bootstrap complete while its requested event component remains blocked.

## Maintain or remove

- **Inspect:** reconcile the ledger with live configuration; do not trust an old enabled flag as runtime evidence.
- **Pause:** disable only owned triggers/consumers through supported controls, preserve cursors and receipts, and verify the paused state. Reconcile in-flight work before resumption.
- **Update:** review a configuration/version diff, preserve grants and processing state, and repeat affected readback/proofs. Do not broaden authority as part of an upgrade.
- **Uninstall:** remove only resources owned by this installation within the requested scope; restore shared settings only when safe and unchanged by others. Follow the user's retention policy for the ledger and receipts. Verify removal and disclose anything left behind.

Repeated bootstrap, pause, update, or uninstall requests should converge on the requested state without duplicate jobs, consumers, or effects.
