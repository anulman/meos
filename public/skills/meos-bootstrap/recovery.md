# Configure selected recovery features

Read the [bootstrap entry point](SKILL.md) first. Resume the same
[completion checklist](SKILL.md#keep-one-completion-checklist); this page neither
creates a second ledger nor expands authority. Record actual state, evidence,
next action, execution owner and delivery route before leaving this step.

## Recovery planning and verification

Backups are optional. If no S3-compatible bucket is supplied, do nothing: do not
provision resources, request credentials, install a schedule, or warn about a
missing optional component. A requested but failing configured backup is an error,
not the same as an absent bucket. This guide itself grants no backup authority.

### Configure optional host backup tooling

For a release containing `tools/backup/meos-backup.py`, read that exact release's
`docs/BACKUP-RECOVERY.md` before installation. It targets the native/Calendar Linux
amd64 host deployment with Python 3.11+, systemd, Docker and pinned age, not an
invented Compose/Helm sidecar or MeOS API. If the selected deployment does not match
that contract, leave this optional component uninstalled and record the mismatch.

1. Reuse the user's bucket/prefix and existing grants. Resolve only missing choices:
   backup cadence, maximum data-loss interval, preupgrade requirement, pause state,
   retention/deletion policy and an optional external freshness-alert destination.
   No cloud account, paid resource, deletion policy or schedule is implicit.
2. Use the source-first age installation procedure below. Identify all five
   live source roots and the actual writer closure: native depot, Calendar state,
   installed configuration, immutable release and five MeOS units. Prove no other
   host process writes these roots; a Docker volume check alone is insufficient.
   Capacity admission must cover each destination filesystem, source growth and
   the minimum 5 GiB reserve; never delete old evidence/backups to pass it.
3. Configure the private age identity and S3 credential files using supported
   private tooling, outside the archived roots. Escrow the recovery key separately
   off-host. Keep secrets out of chat and the installation ledger. Use the exact
   release's example schema, including verified runtime identity and required
   configuration roles; do not substitute stale copies for live configuration.
4. Under backup execution authority, run the documented `config-check`, `backup`
   and `status` commands. Verify upload and isolated data-restore receipts
   separately. The runner resumes recorded active writers in `finally`; reconcile
   a surviving journal with `resume-writers` before another run. Data integrity
   alone does not prove login, readiness, restart or application recovery:
   `applicationRecoveryVerified` remains false.
5. Only with scheduling authority, install the release's example service/timer
   through supported host controls, adjusting the reviewed cadence. Reuse matching
   owned units instead of creating duplicates. Verify boot startup, missed-run
   behavior, next run and observed success. Verify the independently authorized
   off-host stale-success alert; an enabled timer cannot detect a dead host.
6. Restore into a new isolated disposable target first, with real Calendar,
   messaging and notification egress denied. Use the independently escrowed key,
   compare restored identities/data, then separately qualify application login,
   readiness and restart with the exact release. Production replacement requires
   its own explicit approval and preserved rollback state; this tool never
   overwrites a live target or starts restored services.

### Install or maintain backup encryption from source

The default backup package ships MeOS source, `install-age.py` and
`source-lock.json`, not an age executable. Use the pinned release's
`docs/BACKUP-RECOVERY.md` commands and admission contract. Python manages backups;
age supplies age-format encryption/decryption. Go is needed only for a new source
build, not for running backups or reusing an admitted installation.

- **Discover:** inspect the current backup config, runtime path, admission receipt
  and ledger digest before changing anything. With no bucket, skip this entire
  optional installation. Do not install Go just for an unselected feature.
- **Build:** on the supported Linux amd64 host, install a Go launcher through
  supported host tools if needed and authorized. Run `install-age.py --output`
  with a new trusted directory. It fetches pinned Go/module source, checks source
  checksums and license hashes, verifies linked build metadata, and atomically
  publishes age plus age-keygen and a hash receipt. Check the documented 1200 MiB
  allocation plus 5 GiB reserve first. Do not substitute `go install ...@latest`.
- **Reuse:** pass `--reuse-from` plus `--admission-sha256` from a previously trusted
  installation ledger. This is offline and needs no Go. A PATH executable or its
  self-reported version alone is not admission. Without a trusted receipt, build
  the pinned source instead; never bless unknown binaries by hashing them.
- **Configure:** record the reviewed receipt digest in the ledger and the backup
  fields `ageAdmissionFile`/`ageAdmissionSHA256`, with `age` pointing at the admitted
  executable. Keep these files owned by the runtime user under trusted paths.
  Retain local dependency notices with built binaries. Generate a recovery key
  only for a genuinely new setup; preserve and escrow an existing key.
- **Inspect/repeat:** `install-age.py --output PATH --check --admission-sha256 HASH`
  is read-only, including for missing paths. An unchanged ordinary rerun also
  leaves files, services and schedules untouched. `config-check` verifies runtime
  admission without executing age or contacting the bucket; `status` only reports
  config/receipts. Neither proves current provider availability or a fresh restore.
- **Repair/recover:** changed or partial installed files fail closed. Build a new
  runtime, verify it, then switch only backup config within repair authority;
  preserve keys, objects, receipts, schedules, planning state and client cursors.
  An interrupted build never selects its staging directory. If the final path
  exists, verify it before retrying. Otherwise retry installation without replaying
  key generation, uploads or scheduler activation. Coordinate only shared backup
  resource mutations; unrelated planning can continue.

Environment-specific tooling may implement the same workflow, but the current
installer does not automatically admit alternate encryption implementations or
platforms. Require age-format compatibility, authenticated restore/tamper proofs,
source provenance and license review before claiming equivalent support. Do not
invent cryptography to avoid installing Go or carrying redistribution notices.

### Inspect, pause, update and remove optional backups

- **Inspect:** use `status` and actual scheduler/provider receipts. Record backup
  and data-restore times, separate application-recovery evidence, policy, owned
  unit IDs and alert verification in the ledger without credentials.
- **Pause:** `paused: true` suppresses scheduled `due` runs but fails explicit or
  required preupgrade backups. `enabled: false` disables all operations; do not
  use it to conceal a configured failure. Preserve keys, objects and receipts.
- **Update:** reverify bundle/source hashes and compatibility. The Calendar upgrade
  guard holds the backup lock through the transition and rejects failed required
  preupgrade backups. Preserve the retained-depot/runtime admission checks; do
  not bypass the guard or reinterpret source qualification as deployment approval.
- **Retention:** `keepLast: 0` retains everything. Inspect `retention` first;
  `retention --apply` deletes only under explicit deletion authority. Provider
  lifecycle policies are separate and must not expire the only recovery copy.
- **Uninstall:** stop/remove only owned backup triggers/services within scope.
  Preserve remote objects, private recovery keys, receipts and application data
  unless their deletion is separately authorized. Record what remains recoverable.

Report configured, uploaded, data-restored and application-recovery-qualified as
separate states. Real-provider compatibility, installed writer closure and
application recovery need installation evidence; synthetic source tests do not
satisfy those gates.


Return to the [application](application.md) or [maintenance](maintain.md) step that brought you here, then [verify the selected setup](verify.md).
