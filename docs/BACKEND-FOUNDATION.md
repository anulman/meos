# Backend foundation checkpoint

Backend branch: `backend/persistence`; base supplied by parent: `35d378b`. This checkpoint adds new files only. No deployed demo switch, package changes, production access or TrailBase execution.

## Implemented

- `src/lib/backend-contracts.ts`: backend envelopes, typed failures, planner/settings/weather contracts. `DatePeriod.start/end` are **inclusive**; day start=end, week end=start+6. Sunday=0. Ownership stays server-derived, absent from writable domain values.
- `src/lib/repository.ts`: one semantic repository interface and separate session interface. CAS precondition required for updates; natural-key singleton commands use expectedRevision=0 for absent records. Stable create IDs remain in input values.
- `src/lib/backend/codecs.ts`: strict UUIDv4/v7 and canonical base64url conversion; actual calendar-date/inclusive-period checks; SQL boolean/null/clear semantics; revision checks; pagination that rejects repeated cursors and excessive pages rather than returning a partial success.
- `src/lib/backend/transport.ts`: same-origin fetch foundation with explicit credentials, no redirects/cache, typed status failures, CSRF-required writes and generation/abort protection against stale identity responses—including during asynchronous response parsing. No localStorage/sessionStorage token persistence.
- `backend/isolation.mjs`, `scripts/backend-launch.mjs`: fail-closed artifact and runtime guard; only repository-reviewed digest-pinned images with complete selected-license inventory plus retained source/notices hashes. Empty admission registry is intentional. New random container/volume identity, no inherited credentials or remote Docker context, no binds/published ports, network=none, no privilege escalation, runtime inspection before start. No image pull by launcher.
- `scripts/backend-tests.mjs`: dependency-free Node 24 tests. Executes the real launcher denial path with empty registry before Docker. Runtime inspection fixtures are synthetic and do not start a container.

The later implementation checkpoint below adds an actual fetch repository, handler, migrations and command layer. There is still no running TrailBase binding, qualified session lifecycle or bootstrap. The transport is not wired into `store.ts`, and cannot substitute for pinned auth endpoint qualification. Its CSRF header convention is now explicitly implemented in the independent handler, but the trusted TrailBase runtime identity binding remains unqualified.

## Run focused checks

```sh
node --test scripts/backend-tests.mjs scripts/backend-sql-tests.mjs scripts/backend-weather-tests.mjs scripts/backend-http-tests.mjs
```

Node's builtin TypeScript stripping runs only the authored backend modules; no new package dependency. Existing approved frontend compiler passed a scoped strict check of all backend TypeScript modules. No dependency installation is needed for this test suite.

## Admission and scope of proofs

`backend/candidate-artifact.json` records official version/archive provenance, not admission. `backend/reviewed-artifacts.json` starts empty and is the sole launch trust root. Do not copy test fixture entries into it. A future reviewed entry binds an exact image, full runtime/linked-component inventory, retained matching source/notices, source-reviewed CLI command and `/data` layout. The narrow OSL approval admits only the matching TrailBase service, not unidentified native/base-image dependencies. Compound license metadata requires an actual selected-license review, not string matching an allowed branch.

The current tests prove *configuration/identity refusal* and that unadmitted input cannot reach Docker. They do not prove a live network namespace or production/acceptance isolation. Network=none makes this initial harness unsuitable for browser integration or live weather; a later internal-network runner topology must itself be isolated and qualified before B4. No live runtime exists yet. Fresh identity/credential initialization and server instance marker remain B1 work; random container/volume labels are not substitutes for application identity.

The launcher keeps failed resources for inspection instead of automatic destructive cleanup. It does not claim progress after a failed command and performs no identical retries. Success output is process state only, explicitly not auth/data acceptance. Docker operations are scoped to fresh acceptance resources after artifact admission. The launcher uses the local Docker daemon control socket; it never mounts that socket into any container.

## Current blocker and exact continuation

The official x86_64 Linux release archive was downloaded into memory, SHA-256 matched the upstream digest, and inspected without execution. It contains `trail`, `CHANGELOG.md`, `LICENSE`, **not a native transitive/SBOM inventory**. The archive has not been admitted or retained as an executable. Source/build features and linked dependencies must be traced from the tagged release/build workflows and selected artifact. Complete base-image inventory is additionally required if packaged in a container. No source/binary hash alone proves license closure.

Next concrete work: obtain and retain tagged source/submodule identities and exact build recipe; derive the actual release dependency closure (not the entire overinclusive workspace lockfile), inspect exact licenses/notices, qualify container base and unprivileged writable data layout, and populate reviewed registry only after those facts pass. Then run isolated TrailBase to qualify bootstrap/cookie lifecycle and implement real projects/tasks vertical slice. Parent can continue source inspection immediately; no new user permission is needed for already-authorized scope.

B0 still needs integration-owner confirmation of the new public interface with frontend mutations. B1 remains incomplete. B2/B3 primitives below are implemented but not live-qualified; B4 is not complete. B5 preparation remains documentation only, without exact admitted images. Persistent cutover retains its separate release gate.

## Continued implementation checkpoint

27 focused tests pass. Strict scoped TypeScript check passes. New code remains Apache-2.0 and introduces no package dependencies.

- **Same fetch adapter:** `FetchMeosRepository` uses `/api/meos/v1` within TrailBase's eventual custom handler path; both environments use the same implementation. Validates record envelopes/domain documents and weather payloads. Existing screen collections remain untouched pending integration.
- **Handler:** `backend/http-handler.mjs` routes repository operations, requires a runtime-supplied identity, rejects wrong-origin/missing-CSRF mutations, enforces body limits while streaming, and sanitizes unexpected internal failures. It is a function awaiting the TrailBase extension binding, not a new HTTP server or a substitute identity provider.
- **Domain validation:** actual dates/timezones, schedule time, bounded editor document shape/marks/nesting, safe reference/link protocols, flags/priorities/durations, inclusive periods, weather settings and coarse coordinates. Writable owner fields and unknown envelope fields rejected.
- **Strict SQLite migrations:** projects/tasks/routines/completions/outcomes/notes/preferences with immutable owner/revision/ID, owner-safe composite foreign keys, natural keys and immutable period associations. Native TrailBase `_user` is a prerequisite. Domain documents are canonical JSON with relational generated columns; only command handlers may write. Do **not** expose these tables through bypassing native Record API write permissions.
- **Transactions:** stable creates, full updates with SQL revision predicate, pagination, natural-key completion/note writes, preferences and outcome removal. Database archive trigger atomically detaches tasks and increments their revisions. Injected trigger failure proves full rollback in disposable SQLite.
- **Weather:** fixed hosted-provider endpoint, coarse latest observation monotonic CAS, manual/stale fallback, 30-minute freshness, 24-hour physical cache purge on reads plus reusable purge operation, owner-scoped SQLite storage, payload/timeout limits and attribution. Provider failure yields weather unavailability/staleness only. Scheduled retention purge and authenticated bridge binding are not installed.
- **Tests:** use only `:memory:` SQLite with synthetic `_user` rows, and deterministic weather fetch fixtures. Adapter/handler tests exercise the actual fetch implementation and SQL command layer but inject a synthetic authenticated context. This is NOT proof of TrailBase login, runtime isolation, browser journey, restart persistence or restore.

## Exact native/extension license findings

`backend/upstream-findings.json` records tagged source SHA-256 values and tag commit `3dfb2f70d8266036f1e7e9db4902e8b81026f69d`.

The official Linux [release workflow](https://github.com/trailbaseio/trailbase/blob/v0.33.22/.github/workflows/release.yml) enables static GEOS. Tagged Cargo.lock selects `geos-src@0.2.5`; exact crate SHA-256 `4eee1f85b9bb01f9b6051facc23971da8e7baebee757c1642973d95eb3510092`. Its wrapper metadata is MIT but its `source/Version.txt` reports GEOS **3.15.1dev**, and `source/COPYING` contains **LGPL-2.1**. This component is not covered by the TrailBase-only exception. Stock release stays blocked.

Alternative: build unmodified tagged source with `-p trailbase-cli --no-default-features --features trailbase/wasm --bin trail`, omitting unneeded geospatial/MCP defaults. This is a candidate, not a qualified artifact. No Rust/Cargo toolchain is currently available on PATH; new toolchain/build/native dependency admission and feature closure would be required. No compiler installation or build attempted.

Tagged [`trailbase-wasm` JS package](https://github.com/trailbaseio/trailbase/blob/v0.33.22/guests/typescript/package.json) is 0.6.0 OSL-3.0; [Rust guest SDK](https://github.com/trailbaseio/trailbase/blob/v0.33.22/crates/wasm-runtime-guest/Cargo.toml) is 0.7.0 OSL-3.0. Neither library is introduced by this checkpoint. The approved separately operated service exception is not silently extended to linking a guest library into MeOS application handlers. Alternative is an independently authored guest binding against the runtime ABI with separately qualified permissive tooling; that binding does not exist yet.

The native transaction API source supports explicit query/execute/commit/rollback, matching the independent database port. Tagged `/auth/status` returns authentication and refresh tokens in JSON even for cookie sessions: do not expose/use it as an HttpOnly-only MeOS session endpoint. Qualified custom session binding and protected proxy routes remain necessary.

## Pinned upstream auth evidence (source inspection, not runtime proof)

- [v0.33.22 login handler](https://github.com/trailbaseio/trailbase/blob/v0.33.22/crates/core/src/auth/api/login.rs): JSON login returns tokens; form login sets cookies and redirects. Do not use the generic JSON transport and assume HttpOnly cookies were established.
- [Cookie utilities](https://github.com/trailbaseio/trailbase/blob/v0.33.22/crates/core/src/auth/util.rs): cookies are HttpOnly, SameSite is supplied by the flow, and Secure depends on non-development mode plus configured HTTPS site URL. SameSite alone is not the required mutation CSRF proof.
- [Refresh](https://github.com/trailbaseio/trailbase/blob/v0.33.22/crates/core/src/auth/api/refresh.rs): JSON refresh accepts a refresh token; cookie sessions use automatic refresh. Do not extract an HttpOnly refresh token into browser JS.
- [Logout](https://github.com/trailbaseio/trailbase/blob/v0.33.22/crates/core/src/auth/api/logout.rs): GET cookie logout clears cookies and deletes all user sessions; POST handles a supplied refresh token. Must qualify session invalidation, redirects and CSRF explicitly before wiring either into MeOS.

The next auth investigation must find the cookie mutation CSRF check and CSRF delivery/reload mechanism, then test login/reload/expiry/refresh/logout with ordinary synthetic identities. An auth cookie builder alone does not qualify the full transport.
