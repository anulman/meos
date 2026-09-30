# Maintain or remove an existing setup

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

## Mode safeguards

Bootstrap is an ongoing maintenance workflow, not a one-time setup. Select the
requested mode before acting: install, enable a named feature, inspect, repair,
update, pause, or uninstall. An unchanged repeat must make no changes: do not
reinstall matching artifacts, restart healthy services, rewrite configuration,
or recreate jobs, recipients, registrations or seed data merely to rerun this skill.

- **Inspect:** compare the ledger with current versions, feature configuration
  and observable health using read-only host tools. Command names do not prove
  read-only behavior. In this release, `meos-agent doctor` can initialize local
  state, refresh credentials and plan events or renew a server lease; it is an
  active verification step, not read-only diagnosis. `status` reads local state
  but its loader can create a missing state directory. Inspect existing files
  and service metadata directly when no mutation is authorized.
- **Enable or repair:** change only the selected feature and necessary
  dependencies. Reuse existing authority, but do not treat diagnosis as a grant
  to repair or broaden activation/migration authority. Preserve configuration,
  secrets, user data, cursors, acknowledgements and accepted-work receipts.
- **Resume partial setup:** reconcile actual effects with the ledger before
  retrying. Reuse completed resources; do not replay an uncertain external or
  destructive action. Record the next safe step and exact unresolved effect.
  Reconcile persisted mint/refresh intents and native session state; reuse the
  live private rotating credential file, never restore an obsolete issuance copy
  or remint blindly. Record the runtime owner/run ID, verified state, last
  progress, next action and configured delivery route; resume only missing steps.
- **Keep planning independent:** installation maintenance must not reset
  planning state or overwrite local operating skills. Pin application artifacts
  and bootstrap independently. Operating proxies follow their recorded published
  source policy; replacing a local copy requires the user’s upgrade decision.
  Coordinate changes to shared resources, but let unrelated planning runs continue. Stop only the affected
  client when its documented operation requires exclusive state ownership.

Do not execute feature-page installation, activation, doctor or run instructions
merely because inspection led you to that page. Apply only the actions permitted
by the selected mode and existing authority.

## Maintain or remove

- **Inspect:** reconcile the ledger with live configuration; do not trust an old enabled flag as runtime evidence.
- **Pause:** distinguish pausing agent jobs from stopping the application. Disable only the requested owned triggers/consumers/services through supported controls, preserve data, cursors and receipts, and verify the paused state. Reconcile in-flight work before resumption.
- **Update:** review release notes and a configuration/version diff, follow the supported migration/recovery path, preserve persistent data, grants and processing state, and repeat affected readiness/persistence/readback proofs. Do not broaden authority as part of an upgrade.
- **Uninstall:** distinguish removing agent setup from uninstalling MeOS. Remove only resources owned by this installation within the requested scope; preserve application data and volumes by default. Data deletion requires explicit separate authority. Restore shared settings only when safe and unchanged by others. Follow the user's retention policy for the ledger and receipts. Verify removal and disclose anything left behind.

Repeated bootstrap, pause, update, or uninstall requests should converge on the requested state without duplicate jobs, consumers, or effects.


Load only the affected application, agent, recovery or event procedure from the [entry point](SKILL.md), then [verify and hand off](verify.md).
