# Maintain or remove an existing setup

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

## Maintain or remove

- **Inspect:** reconcile the ledger with live configuration; do not trust an old enabled flag as runtime evidence.
- **Pause:** distinguish pausing agent jobs from stopping the application. Disable only the requested owned triggers/consumers/services through supported controls, preserve data, cursors and receipts, and verify the paused state. Reconcile in-flight work before resumption.
- **Update:** review release notes and a configuration/version diff, follow the supported migration/recovery path, preserve persistent data, grants and processing state, and repeat affected readiness/persistence/readback proofs. Do not broaden authority as part of an upgrade.
- **Uninstall:** distinguish removing agent setup from uninstalling MeOS. Remove only resources owned by this installation within the requested scope; preserve application data and volumes by default. Data deletion requires explicit separate authority. Restore shared settings only when safe and unchanged by others. Follow the user's retention policy for the ledger and receipts. Verify removal and disclose anything left behind.

Repeated bootstrap, pause, update, or uninstall requests should converge on the requested state without duplicate jobs, consumers, or effects.


Load only the affected application, agent, recovery or event procedure from the [entry point](SKILL.md), then [verify and hand off](verify.md).
