# Restore Calendar's native sync session

For operators of the private Calendar worker on the retained TrailBase 0.33.22
runtime. This procedure concerns the worker's **native MeOS session**, not its
Google OAuth connection. Reconnecting Google does not restore this session.

## Session lifetime

The native `user mint` command creates both tokens with a fixed 12-hour lifetime.
The refresh endpoint issues another bearer token but does not extend the stored
refresh-session deadline. Calendar's sync grant has a separate expiry and is
checked on every delegated command.

Calendar provisioning now binds the matching refresh session to that existing
grant deadline. It does not extend the grant, change scopes, or make the worker
an administrator. Expired or revoked grants remain denied. The grant must be
reviewed separately when it expires; this change does not grant permanent access.

Source: the retained native revision's [mint implementation](https://github.com/trailbaseio/trailbase/blob/3dfb2f70d8266036f1e7e9db4902e8b81026f69d/crates/core/src/auth/cli.rs)
and [refresh implementation](https://github.com/trailbaseio/trailbase/blob/3dfb2f70d8266036f1e7e9db4902e8b81026f69d/crates/core/src/auth/tokens.rs).

## Diagnose before changing credentials

1. Read private Calendar status. Distinguish successful Google imports from
   completed planner reconciliation and publication into the native Calendar cache.
2. Verify the existing Calendar agent, owner, unrevoked `sync:read`/`sync:write`
   grant, and runtime identity. Check session existence and expiry without logging
   either token. Do not infer a revoked grant from a failed refresh.
3. If the session is missing or expired, use an independently admitted recovery
   operation to mint a session for that **existing** agent. Stop the Calendar
   worker during replacement, preserve its SQLite state with SQLite's backup API,
   and persist a mint-intent record before issuance. An interrupted mint requires
   reconciliation, not another mint. Preserve all Google credentials and snapshots.
4. For an existing unexpired session, use the reviewed
   `scripts/calendar-session-lifetime.py` operator helper. It requires root-private
   state, credentials, and an independent admission bound to their hashes, the
   exact helper, grant deadline in seconds, environment, and output receipt path.
   The admission status is `approved-calendar-session-lifetime`; its bindings are
   `scriptSHA256`, `stateSHA256`, `credentialsSHA256`, `grantExpiresSeconds`,
   `environment`, and `output`, with `reviewer` and `evidence`.
   The helper refuses missing/expired sessions and never creates users or grants.
5. Start the worker and verify a natural successful full poll, updated planner
   timestamp, advanced native mirror sequence, fresh Calendar reads, and no
   continuing refresh 401 loop. A running service alone does not establish recovery.

The helper updates one matching session deadline with a compare-and-set. If the
process stops before its receipt is written, inspect that exact session before
retrying. It may already have the grant-bound deadline. Never restore an entire
old provider database merely to undo a credential replacement after syncing resumes.

## Failure behavior

The native client serializes planner and mirror requests. Native-channel failures persist a
retry delay of 1 minute, doubling to a maximum 15 minutes; a successful call clears
that state. Restarting the worker does not erase the delay. During the delay,
publication does not rebuild the full projection or allocate mirror sequences.

HTTP 401/403 produces the safe `session_expired` status; other native-channel failures produce
`retrying`. Expected `conflict`, `not_found`, and `validation` results remain
per-item reconciliation outcomes and do not delay the shared channel. Settings distinguishes a server-side session repair from Google
reconnection. Raw provider errors and tokens are never included in public status.
A rejected session is not automatically reminted: issuance remains a privileged,
independently reviewed operator action.
