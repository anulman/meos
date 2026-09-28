# Native runtime boundaries

This guide is for maintainers reviewing a native installation or release change.
It explains the boundaries implemented by the release helpers and service
templates. It is not a fresh-clone installer, a deployment plan, or evidence of
what is running on a particular host. Read the
[deployment overview](../README.md#deployment-boundaries) first.

## Browser entry and private services

The protected web adapter verifies signed Cloudflare Access assertions against
the configured issuer, audience, owner identity, lifetime, and public keys.
Native cookies and unsigned identity headers cannot substitute for Access.
Access mode establishes or renews the ordinary owner's native session without
exposing the internal password to the browser. Public-key refresh runs outside
the network-disabled web service; unavailable or stale keys fail closed.

The native backend owns persistent data and private server/admin Unix sockets.
The web process receives only its required server socket, immutable release,
owner secret, and public-key bundle—not the database, admin socket, or Docker
control socket. The private Calendar service has its own credential and network
boundary. See the [service templates](../deployment/) and
[renderer](../scripts/production-render.py) for the exact selected topology.
Use [Calendar session recovery](calendar-session-recovery.md) to distinguish
native worker authentication from Google OAuth.

## Release identity and recovery

The [release builder](../scripts/release-build.py) produces a candidate; building
does not admit or deploy it. Qualification uses disposable synthetic identities,
storage, and isolated networking. An application's compiled environment marker
is not proof of its physical test isolation. Never promote acceptance data or
credentials into production.

The [stager](../scripts/production-stage.py) binds reviewed source, already-tested
client output, native candidate, helper hashes, and runtime notices in an immutable
release. It copies the qualified output rather than rebuilding during deployment.
The [bootstrap helper](../scripts/production-bootstrap.py) uses protected file
inputs and interruption receipts; those files do not create release authority.
Reconcile uncertain effects before retrying provisioning or changing credentials.

For a retained data volume, qualify the mounted runtime files and schema—not
only the new image ID. Preserve the previous release, required provenance, and
recovery data. Routing rollback does not roll back user writes or authorize
overwriting the persistent volume. Use the
[backup and recovery guide](BACKUP-RECOVERY.md) for that separate operation.

Keep exact release/admission and live-verification records outside the source
tree. Verify the target's current identity before a mutation; historical test
counts or an old deployment receipt are not current readiness evidence.
