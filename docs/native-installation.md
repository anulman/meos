# Install a persistent planner on a Linux host

This operator procedure uses one supported topology: Linux/systemd, a pinned
Docker native runtime, and the protected Node web adapter. It is not the root
Compose preview, a Helm chart, or a platform-independent installer. Keep an
existing working host on its current topology.

The owner chooses access, Calendar, planning authority and cadence through the
[guided setup conversation](../public/skills/meos-bootstrap/conversation.md).
Use its existing durable checklist throughout. Application installation does
not by itself install proactive assistance.

## Before you begin

Use a dedicated Linux x86-64 host with systemd, Docker, Python 3.9 or later with
IANA timezone data, `setpriv`, ACL tools, sufficient persistent storage, and the
required unassigned service identities. The web service uses UID/GID 61002; its
prestart rejects an existing account or process using that identity. The native
runtime uses 10001; optional Calendar uses 61004. Do not run another installation
under those identities on the same host or disable their checks to do so.

Arrange a public HTTPS hostname (without an explicit port) behind a Cloudflare
Access application. Access must admit the chosen owner email and supply signed
assertions to the loopback web adapter. Configure DNS, TLS, routing and Access
through the host's supported controls; this repository does not provision those
provider resources. Keep internal backend/admin sockets private.

Obtain these **matching, independently reviewed artifacts**, not an unpinned
latest image or another owner's private configuration:

- A pinned source checkout containing the production helpers and service templates.
- The native Docker image export, its SHA-256 digest and expected image ID. Load
  the verified export with `docker load --input /VERIFIED/runtime-image.tar`;
  verify the resulting image ID before referencing it in a bootstrap plan.
- An immutable web release directory with `manifest.json`, all named client,
  runtime, helper and license files, and exact hashes. The runtime includes the
  sealed deployment-origin migration; an older origin-bound image is unsuitable.
- Artifact/license admission and the independent qualification receipts for those
  exact bytes. A receipt label alone is not approval; the operator must verify
  provenance, reviewed identity and the applicable deployment authority.

These are release inputs, not files produced by `pnpm dev`. A distributor builds
and qualifies them before installation. Missing artifacts are a release capability
gap; do not fabricate an admission or substitute the demo.

## 1. Prepare one reviewed installation plan

Inspect the host for existing data and services. Do not bootstrap over a retained
volume. Reserve enough storage for the runtime, planner data and selected recovery
policy. The native runtime stays network-isolated with one labelled data volume.

Use a new root-owned private directory, with root-owned non-writable ancestors,
for the plan, internal owner secret and receipts. Generate the internal secret
once; this is not the user's browser password:

```sh
sudo python3 /PINNED/scripts/production-owner-input.py \
  --email owner@example.com --output /PRIVATE/owner.json
```

Replace the email and paths with the reviewed installation's values. The helper
requires a mode-0700 parent, writes mode 0600, never prints the secret, and refuses
to reset or replace a mismatched existing owner file. Do not request credentials
in chat.

Prepare a mode-0600 root-owned plan using the actual schema of
[`production-bootstrap.py`](../scripts/production-bootstrap.py):
`schema: 1`, `environment: "production"`, a fresh 32-character lowercase hex
`instanceId`, exact `image`, canonical HTTPS `origin`, IANA `timezone`,
`reviewStatus: "approved-for-production-bootstrap"`, `reviewer`, `reviewEvidence`,
`releaseManifestSHA256`, absolute `releaseManifestFile`, and
`ownerInputKind: "generated-owner-file"`.

The reviewed manifest must match the image and carry production runtime/license
admission. The production status and reviewer fields are supplied only after the
actual review; writing the words does not establish authority. Keep receipts and
secret contents separate in the host ledger.

## 2. Bootstrap and verify persistent identity

```sh
sudo python3 /PINNED/scripts/production-bootstrap.py \
  --plan /PRIVATE/plan.json --owner-file /PRIVATE/owner.json \
  --receipt-dir /PRIVATE/bootstrap
```

Create the root-owned mode-0700 receipt directory before invocation. The helper
allocates a fresh labelled container/volume, seals the instance and trusted origin,
creates one ordinary owner, verifies login, removes the bootstrap admin, and
writes `runtime-state.json` and the completion receipt. It does not route browser
traffic or start systemd units.

The same reviewed plan and receipt directory can reconcile an interrupted
bootstrap. An unchanged completed repeat verifies the existing physical target
and sealed origin; it does not initialize again or reset a password. Unknown
objects without the matching durable intent are blockers requiring reconciliation.
Never use volume removal or another owner identity as a recovery shortcut.

The origin is operator-owned and immutable. It is not inferred from a request's
Host/Origin headers or from editable planning preferences. A missing, invalid or
mismatched deployment origin fails closed. Changing an existing origin requires
a separately reviewed migration, not a normal settings edit.

## 3. Render the protected browser boundary

Create a root-owned Access configuration containing the selected tenant `issuer`
(`https://TENANT.cloudflareaccess.com`), the application's 64-character lowercase
hex `audience`, the same owner `email`, and `ownerId` from the verified bootstrap
receipt. Supply only the public signing-key directory to the web service; the
internal owner secret remains private.

```sh
sudo python3 /PINNED/scripts/production-render.py \
  --state /PRIVATE/bootstrap/runtime-state.json \
  --release /VERIFIED/release --output /PRIVATE/rendered \
  --access-config /PRIVATE/access.json --owner-file /PRIVATE/owner.json \
  --access-keys-dir /PRIVATE/access-public
```

The output directory must not exist. Rendered units retain the network-disabled
web process, same-origin validation, signed Access verification, owner-bound
native session, private Unix sockets and exact release hashes. A different owner
or domain is configuration, not permission to remove those checks.

Refresh public signing keys through the configured tenant, without accepting
redirects or an arbitrary network URL:

```sh
sudo python3 /VERIFIED/release/scripts/production-access-keys.py \
  /PRIVATE/rendered/web-identity.json /PRIVATE/access-public
```

Review and validate the rendered units before activation. Use the host's
controlled deployment procedure to install them and activate the backend, web
socket and Access-key timer. Rendering does not install or start them. Keep the
previous release and all rollback/admission records; do not copy files into a
running immutable release.

## 4. Verify selected outcomes

Verify correct-owner browser access, denial for an unsigned or wrong-owner
assertion, persistence of an authorized test item across a coordinated restart,
and repeat bootstrap without changed identity. Verify native MCP separately
through the [host runbook](../public/skills/meos-bootstrap/host-mcp.md).

Configure Calendar and the operating agent only when selected, using their
per-install identity, scopes, consent and delivery authority. Calendar connection,
scheduled execution and event handling each need their own evidence. Continue to
the chosen [first planning horizon](../public/skills/meos-bootstrap/conversation.md#choose-the-first-planning-horizon)
and [verification/handoff](../public/skills/meos-bootstrap/verify.md).

## Existing installations and release construction

A retained database upgraded to this runtime needs the new migration and a
trusted insertion of its **already verified** origin before guest readiness.
The immutable instance identity, existing owner, data, grants, receipts and
Calendar context must remain unchanged. This is controlled deployment work;
`production-bootstrap.py` is not an existing-instance migration tool. The
[`calendar-upgrade.py`](../scripts/calendar-upgrade.py) controller accepts the
reviewed existing state, release, admission, output and runtime paths. It verifies
physical container/volume identity and unchanged applied migrations before
stopping the backend. After native migration, it checks the stored instance
identity and seals only the origin from that admitted state before asking the
guest for readiness. An existing different origin fails closed; it is not
replaced.

The controller retains the old container, cold data copy and runtime bytes. Its
`backend-upgraded-web-held` receipt verifies unchanged owner/domain rows and the
runtime visible through the new container's mount namespace; it does not activate
the web or Calendar services. The controlled host deployment must stop all
writers, preserve provider state, and verify adapter readiness before resuming
notification workers. An existing transition directory or interrupted operation
requires reconciliation of retained evidence, not an automatic retry. Do not use
fresh bootstrap or a new volume to recover an existing installation.

The release stager now takes explicit `--node-runtime` and `--node-notices`
paths alongside its qualification/admission/output inputs. It still verifies the
exact admitted binary and complete license closure before copying them. These
build-time paths are not new runtime environment variables or identity fallbacks.
See [native runtime boundaries](native-runtime.md) for release and recovery rules.
