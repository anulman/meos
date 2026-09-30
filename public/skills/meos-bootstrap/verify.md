# Verify the selected setup and deliver the result

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

## Verify and hand off

Reconcile every requested step in the [completion checklist](SKILL.md#keep-one-completion-checklist)
with its proof before closing the combined request. Report partial completion
when any requested installation, verification or delivery remains unresolved;
retain its next action and owner even when a narrower task is complete.

Read back the actual installed configuration: resource IDs, enabled state, next scheduled times, timezone/DST handling, model/reasoning settings, delivery route, and authority limits. Confirm there is one intended consumer, not multiple overlapping installations. Capture receipts in the ledger.

Verify affected installation paths with before/after evidence: first install;
an unchanged repeat with identical managed configuration and resource IDs;
selective enablement with unrelated features unchanged; read-only diagnosis
followed by separately authorized scoped repair; and recovery from a partial
run without duplicate resources or lost state. Use disposable fixtures for
interruption tests, not a live installation. Distinguish executable evidence
from a procedure review: this skill does not provide a universal host installer,
and these instructions alone do not prove live idempotence. Report unsupported
host cases as unverified rather than claiming all five paths passed.

Where the host/protocol supports them, use safe synthetic events and a non-mutating test target to verify receipt, actionable wake-up, cursor persistence, restart recovery, replay deduplication, stale/canceled-event handling, and health reporting. Do not mutate a real calendar, send messages, print, or trigger other external effects merely to prove installation. If a proof is unavailable, report it as unverified instead of manufacturing evidence. Enabled configuration is not evidence that the long-poller is connected and processing correctly.

Report application installation/login/persistence separately from optional integrations, MCP access, operating jobs, and event delivery. State what is configured, what is verified running, the next scheduled executions, and exact blocked/unverified parts. Include the installation record location or resource ID, non-secret access instructions, and how to inspect, pause, update, and uninstall. Do not declare the entire bootstrap complete while a requested component remains blocked, and never call a demo preview a persistent installation.

For MCP readiness, include all four [application/MCP receipts](application.md#stage-3--prove-persistent-meos-works) for the intended identity and workspace; doctor/direct protocol success is not personal or scheduled model-tool evidence. For event readiness, include an actual event's durable queue handoff and supervised worker processing, plus the required restart/replay proof; installed services or synthetic qualification alone are not live end-to-end evidence. Report which dependencies were completed under existing bootstrap authority, and separate configured components from verified operation and any remaining permission or implementation blocker.

### Learning and delivery closeout

For evidenced setup defects, record the failure, concrete upstream correction
and regression proof; link the source commit/PR rather than leaving a local
workaround as the lesson. Repository-owned bootstrap/template fixes go through
repository review, not an installed-skill workshop. Preserve unrelated content
and authorization gates. Distinguish source fixed, PR published, release admitted,
and runtime installed/verified; a merged document does not update a live host.
Record unperformed proofs explicitly (for example, forced live expiry or full
backend/socket rebind). Deliver the bounded result through the user’s actual
channel and retain its send receipt separately from saved completion. A saved
report or child completion is not confirmed user-facing delivery.


After setup, use the [assistant entry point](../meos-assistant/SKILL.md); for later setup changes, use [maintenance](maintain.md).
