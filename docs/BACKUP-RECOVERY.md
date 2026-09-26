# Optional backup and recovery

This is **tooling, not an enabled backup service**. No bucket, key, schedule,
retention deletion, watchdog, or production restore is provisioned by this change.
Bootstrap agents: if the user has not supplied an S3-compatible bucket and policy
authority, do nothing and do not warn. Missing config or an empty bucket makes
normal CLI invocations silent successful no-ops (no network, mkdir, or secret
lookup). `status` alone explains disabled state. Invalid configured JSON, invalid
policy, credentials, upload, integrity or restore errors are failures, never skips.

## Runtime and admission

The native guest has no network and must not receive S3 credentials. Calendar is
host-side. Consequently backups run on the **host**, alongside existing Python
release helpers, not inside the nginx demo container or the networkless guest.
No compose deployment is invented. Runtime: Linux amd64, Python 3.11+ stdlib,
existing systemd/Docker CLI, and the pinned age executable in the standalone host
bundle. No npm, Go compiler, AWS CLI or developer checkout is needed at runtime.

`tools/backup/package.py --age-archive FILE --output NEW_DIRECTORY` assembles an
offline bundle. Obtain the exact age v1.3.2 Linux amd64 archive identified in
`tools/backup/licenses.json` through your approved artifact acquisition process.
The packager fails closed on archive/binary/notice hashes. It retains BSD-3-Clause
notices for every module in the actual Go binary build information, including the
Go runtime. It does not install anything. Review and install the bundle using your
existing deployment admission procedure, e.g. `/opt/meos-backup`; host Python is
already an existing deployment prerequisite. This is not production admission.

The release stager now requires the exact backup helper hash in `helperFiles`.
`calendar-upgrade.py` additionally requires `backupToolSHA256` in its exact upgrade
admission. It enters the real `upgrade_guard()` preupgrade gate **before creating the transition
directory or stopping/renaming/replacing the runtime**. Existing script-hash
admission gates remain intact. A required backup failure aborts the upgrade. The
backup lock stays held until the upgrade process exits, preventing a scheduled
backup from racing the transition. The
helper independently verifies the runtime identity/volume and stopped Docker
writers. No source change authorizes executing this upgrade in production.

## Configure only with user authority

Start from `tools/backup/config.example.json`; its bucket is empty and enabled is
false. The managing agent may select policy only within the user's authority.
There is no mandatory provider, paid resource, daily/weekly schedule, or automatic
delete policy. If enabled, selectable defaults are `requiredPreupgrade: true`,
`cadenceSeconds: 86400`, `keepLast: 0` (retain everything). These values do not
install a timer. `paused: true` suppresses scheduled `due` runs but causes explicit
backup/required preupgrade to fail; `enabled: false` disables all operations and
preserves existing objects. Do not disable to conceal a known error.

1. Verify the live runtime-state file, Docker volume identity/mountpoint, immutable
   release, rendered service files and every bind-mounted configuration path.
2. Set the five source roots: entire native depot (including `data/main.db`, other
   SQLite databases, guest/config/artifact files), entire Calendar state (including
   `private/calendar.sqlite`), installed configuration/state, exact current release
   and MeOS unit files. Configuration must include runtime-state, web identity,
   owner configuration, access verification keys, Calendar config/OAuth/planner
   credentials. `requiredConfiguration` names their paths relative to that root;
   every role must exist. Consolidation/copying into a new install layout needs
   its own deployment procedure; **do not substitute stale copies** of live files.
   The units source should be `/etc/systemd/system`: only the five named MeOS
   units are selected, explicitly excluding unrelated host units/symlinks. All
   five must be real files.
   Keep installation changes mutually exclusive with backups.
3. Generate an age identity using the bundled `runtime/age-keygen`; pass only its
   public recipient in configuration. Keep the private identity in a root-owned
   mode-0600 file outside all backed-up roots. Escrow a second copy offline, outside
   this host and bucket. **Losing this key loses every backup.** This runner needs
   the identity for its automatic isolated data-restore proof; neither key nor S3
   credentials are put in arguments, logs or archives. A compromise of this host
   can expose this local recovery key: encrypted backups do not fix host compromise.
4. Put S3 auth in a separate root-owned mode-0600 JSON file:
   `{"accessKeyId":"...","secretAccessKey":"..."}`; temporary credentials may
   also include `sessionToken`. Configure only HTTPS path-style endpoints with the
   correct region. There is no redirect, proxy, alternate-provider or failed-auth
   fallback. Scope bucket permissions to the configured prefix: PutObject/GetObject
   for normal backup; DeleteObject only for explicitly approved retention. The
   backup path does not need bucket provisioning or list/delete permissions.
5. Write `/etc/meos/backup.json` mode 0600. Use private non-symlink source trees and
   mode-0700 work storage under a non-world-writable parent. Secrets referenced by
   the config belong outside its source roots. The example backup credential/key
   directory `/etc/meos-backup` is deliberately separate from `/etc/meos`.
6. Run `python3 /opt/meos-backup/meos-backup.py config-check`, then `backup`, then
   `status`. Explicitly verify a restore with the independent escrowed identity
   on an isolated recovery machine before treating this installation as protected.

All flags are discoverable with `--help`; `--config PATH` precedes the subcommand.
`status` returns policy plus separate backup and data-restore timestamps. It does
not emit credentials or the full configuration. A failure exits nonzero with a
redacted error; review private configuration/recovery state, not secret log dumps.

## Consistency, scheduling and interruptions

Before stopping writers, the runner scans every source and rejects a conservative
source/metadata footprint above `maxArchiveBytes`. It admits six archive-limit
allocations for staging, tar, encryption, download, decryption and restored data.
`reserveBytes` defaults to 5 GiB and cannot be lowered. Space checks aggregate
allocations on each destination filesystem, including a separate restore target,
and recheck before allocation. Ordinary copies and extraction have running byte
budgets; native SQLite, tar and age output have kernel file-size ceilings. Growth
therefore fails boundedly and still follows writer-resume cleanup. No old backups,
evidence or interrupted runs are deleted for capacity relief. Checks are admission
guards, not filesystem quotas against unrelated concurrent writers; installation
must account for those writers and available memory.

The runner locks one work directory, records previously active units durably, then
stops web sockets/services, Calendar sockets/services and the native backend. It
checks Docker has no container using the verified native volume. SQLite uses its
supported backup API (including committed WAL content), checks integrity, and
normalizes snapshots to DELETE journal mode. Raw live DB copying is never used.
All other regular files and metadata are inventoried; unexpected symlinks,
hardlinks and special files fail closed. Only native server/admin socket files
are deliberately excluded. Writers are resumed in dependency order in `finally`,
before encryption/upload. Failed snapshots do not hold services stopped.

`resume-writers` reconciles a surviving `writers.json` after SIGKILL/power loss;
it starts only the units recorded active before this run. Until reconciliation,
another backup fails instead of overwriting the journal. The example oneshot
service adds this command as `ExecStopPost`. Review/install the example service
and timer only with scheduling authority; enabling the same timer is idempotent.
A power failure while stopped still requires boot/operator reconciliation. No
watchdog is claimed merely because examples exist. Interrupted private `run-*`
plaintext staging directories may remain; reconcile the journal first, then remove
only confirmed abandoned runs. Use encrypted local storage and capacity monitoring.

A successful upload is downloaded, SHA-256 compared, age-authenticated/decrypted,
extracted into a new private staging tree, inventory/checksum checked and every
SQLite integrity checked. Receipts distinguish upload success from data restore
success. Archive object keys are unique: retries do not overwrite earlier runs.
No automatic retry can hide an error. The current implementation buffers encrypted
objects in memory and uses a single PUT: budget memory/disk for full release+data
and select `maxArchiveBytes` accordingly (default 256 MiB, upper bound S3's 5 GiB single PUT limit). Larger archives and downloads fail explicitly. This is intended
for a personal deployment, not a streaming large-dataset backup engine.

`due` checks `cadenceSeconds` against the last verified data restore. Effective
maximum data-loss interval is selected cadence **plus scheduling delay/outage**;
preupgrade backup narrows release risk, not the gap between regular backups.
Off-host freshness monitoring is essential: same-host error alerts cannot detect
a dead host. Optional `heartbeatFile` points to private JSON `{"url":"https://..."}`
for a user-provisioned off-host success endpoint. After verified data restore it
POSTs only snapshot/data-restore timestamps; non-2xx/redirect errors fail. Configure
that external service's missing-success deadline greater than chosen cadence and
run duration. No endpoint/service/subscription is created or enabled by the tool.

## Retention is explicit

`retention` prints the deletion plan from locally retained successful receipts.
`retention --apply` is a distinct, authorized destructive action; it deletes only
this runner's old object/receipt pairs, preserving the configured `keepLast`.
`keepLast: 0` never deletes. There is no hidden daily/weekly default, bucket sweep,
automatic pruning after backup, or deletion of unknown/orphaned uploads. If local
history is lost, deletion is conservatively unavailable until receipts are
reconciled. A failed delete remains a failure. Provider lifecycle rules are an
independent user policy and must not expire the only recovery copy.

## Restore: isolated by default, production is a human action

```
python3 /opt/meos-backup/meos-backup.py --config /private/recovery.json restore \
  --snapshot meos/INSTANCE/EXACT_RUN.tar.age --output /private/new-isolated-restore
```

The target must be new and outside configured live/work trees. No application is
started, installed or contacted: only the configured S3 endpoint is accessed.
No Google, notification or planner credentials are used. Restored files are private;
original modes/UIDs/GIDs remain in the encrypted manifest for controlled installation.
Never chown a recovery tree into production or start its OAuth/notification service
as part of a casual drill. The command does not offer a production overwrite flag.

A byte-valid database restore is **not** a proven working application. Every receipt
therefore has `applicationRecoveryVerified: false`. Before claiming protection:

- In a separately admitted network-isolated disposable environment, load the exact
  manifest-matched guest/runtime/release and restored data. Deny Google, email,
  webhook and notification egress; do not attach any production volume or socket.
- Compare instance and owner identities, all domain records, notes, routine history,
  Calendar state and all configuration/artifact hashes against the encrypted
  manifest. Verify login with test-only access credentials, API/readiness and a
  restart preserving records. Use the repository's existing native preservation
  and isolated lifecycle qualification helpers under their independent admission
  rules; a data extraction receipt is not a replacement for those proofs.
- Record a separate immutable application recovery qualification receipt with the
  snapshot key/checksum, exact release, check results and reviewer. This tooling
  intentionally does not forge or auto-approve that receipt.
- Production replacement requires explicit user approval, a preserved current
  state/rollback plan, credential handling and existing deployment admission. Do
  not blindly replay calendar actions, leases or notifications recovered from an
  older point in time; qualify reconciliation before allowing external egress.

## Verification and limits

`tools/backup/test_backup.py` uses only synthetic SQLite stores and credentials,
real pinned age encryption and a fake S3 object store. Run under the supplied
isolation recipe below; this checks WAL preservation, tamper detection, restart
journal, lock conflict, no-bucket silence, configured failures, retention and
preupgrade abort. No real bucket/service/backup is touched. This does **not** prove
a particular provider's SigV4 compatibility, actual installed unit closure or a
production login/restart drill; those remain installation qualification gates.

Run the isolated suite: `tools/backup/test-isolated.sh /path/to/admitted/age-directory`.
The launcher stages only code and public binaries, clears the environment, hides
home/production paths and Docker, and creates a network namespace. It does not
mount production data or credentials. Tests assert those denial conditions. The
launcher requires the host `build-space-check` and stages under the source checkout
(or `MEOS_TEST_STAGE_PARENT`), after a 40 MiB allocation plus 5 GiB reserve check.
Synthetic tests mock free space for ordinary cases; dedicated regressions inject
low space, source growth and shared-filesystem allocations to prove denial.

Archive integrity is not a guarantee against an attacker who can replace both
objects and receipts. Keep immutable receipt hashes outside the bucket, consider
provider object versioning/retention under separate authority, and restrict writes.
The public age recipient does not authenticate the origin of newly created archives.
