# Runtime qualification — resumed checkpoint

No artifact is admitted. Cargo/rustc version probes and dependency resolution ran after Telegram41818; no dependency build scripts, componentizer or TrailBase runtime ran. Production and the deployed frontend remain untouched. Earlier findings below are historical; the Telegram41818 continuation section records the current gate.

## Retained evidence

Private `.qualification/` under the attached-volume backend worktree retains downloaded source, exact crate archives and compiler archives. It is ignored by Git; it must not be copied into application bundles. Hashes and pinned source references are recorded in `backend/upstream-findings.json`. Source discovery is not license admission.

The full TrailBase source archive is pinned to `3dfb2f70d8266036f1e7e9db4902e8b81026f69d`. Its submodules are **not yet populated**. The no-GEOS candidate command remains:

```
cargo build --locked -p trailbase-cli --no-default-features --features trailbase/wasm --bin trail
```

The workspace TrailBase dependency also enables `pg`; CLI feature suppression does not remove that inherited feature. Build closure must come from actual Cargo resolution, not just CLI defaults or a lockfile name scan. The build additionally compiles embedded admin/auth UI via pnpm; those selected packages and native assets require inventory. Do not allow build scripts to perform an unreviewed workspace-wide dependency install. No claim of a permissive complete closure has been made.

## Build tool qualification

Official Rust 1.95.0 distribution manifest dated 2026-04-16 was retained from `https://static.rust-lang.org/dist/channel-rust-1.95.0.toml`. SHA-256 of each downloaded x86_64-unknown-linux-gnu archive matched the manifest:

| Component | SHA-256 |
|---|---|
| Cargo | `e74edd2cf7d0f1f1383b4f00eb90c843750bc489e2ccf7214e6476678a907425` |
| rustc | `8426a3d170a5879f5682f5fbdd024a1779b3951e7baba685af2d6dc32a6dfc15` |
| rust-std | `047ea7098803d3500fa1072e9cee5392697e21525559e4458128a2bf874aa382` |

Cargo's own Apache/MIT license is not the complete executable license inventory. Its `LICENSE-THIRD-PARTY` includes libgit2 GPLv2 with an unlimited linking exception. That exception explicitly permits unrestricted combinations, but the workspace's default GPL introduction rule still requires an explicit scoped decision before introducing this build tool. Cargo has not been installed or run. This is distinct from a claim that Cargo would relicense MeOS.

The generic notice also includes old `deps/regex` LGPL text. Do **not** report it as an actual selected Linux dependency: the exact Rust 1.95.0 source lock selects `libgit2-sys 0.18.2+1.9.1`, crate SHA-256 `1c42fe03df2bd3c53a3a9c7317ad91d80c81cd1fb0caec8d7cc4cd2bfa10c222`, whose `build.rs` explicitly compiles bundled PCRE instead. However that same script always compiles `deps/xdiff`; its `xdiffi.h` explicitly licenses LibXDiff as LGPL-2.1-or-later. That is an actual additional build-tool component, not a regex inference. `readelf` shows the Cargo executable uses existing host libc/libgcc system libraries; it does not establish the static closure.

The unchanged auth UI declares `sharp 0.35.4` (Apache-2.0; exact tar SHA-256 `6ebef10290372c7309d9e22e3ecb9e32ca6a3aa6e07f3d83aa904df8ae4f6a5a`). Its pinned Linux package `@img/sharp-libvips-linux-x64 1.3.3` has SHA-256 `74b6fa0abb2e41a163853a00e2f247188df5ec1e25bf62c4c5a041f2042a1f6a`. Its own README selects LGPLv3 for libvips 8.18.6, fribidi 1.0.16, glib 2.89.4, libexif 0.6.26, libheif 1.23.2, librsvg 2.62.91, pango 1.58.2 and proxy-libintl 0.5, plus MPL-2.0 for cairo 1.18.4. Both the versions and selected-license table were read from the exact archive. These are build-only candidate components, not admitted dependencies. Retain full corresponding sources/notices before any approval-driven use. Existing MeOS lightningcss 1.33.0 permission does not cover this bundle or the separately present 1.32.0 lock entry.

The candidate `webpki-roots 1.0.9` archive matches lock hash `7dcd9d09a39985f5344844e66b0c530a33843579125f23e21e9f0f220850f22a`. Its exact license is **CDLA-Permissive-2.0**, not an older MPL license. Retain that notice if selected. Selected closure remains unproven.

## Independently authored guest boundary

`backend/trailbase-port.mjs` converts SQL values and transaction operations without importing or copying the OSL guest SDK. The port requires a component compiler's generated resource binding. It is **not yet compiled into a component or wired into the service**.

The relevant interoperable ABI is `trailbase:database/sqlite@0.1.1`, with a transaction resource, synchronous guest query/execute, commit/rollback, and tagged SQL values. Signed 64-bit integers cross the JS boundary as BigInt; the application rejects values outside safe integer range. Command tests now exercise this encoding against disposable SQLite, including archival/revisions/rollback.

Pinned host source `crates/wasm-runtime-axum/src/lib.rs` overwrites `__context` with serialized runtime identity before invoking the WASI handler. `crates/core/src/wasm/mod.rs` derives that identity from authenticated `User`, including its expected CSRF token. The new strict decoder is safe **only inside that trusted WASI entrypoint**; never place it behind a new generic HTTP server that accepts client headers. Live forged-header denial remains mandatory.

The safe session projection returns only `{user: {id}, csrf}` (or `{user: null}`), with no-store headers. It does not expose native `/auth/status`, which returns bearer credentials. Login/refresh/logout/session expiry are still unqualified and this projection is not yet routed.

## Component compiler candidates

The pinned upstream JS SDK uses Jco 1.34.0. Its default componentization engine is not implicitly admitted by the Jco package license. The independently operated `componentize-qjs 0.4.2` package is Apache-2.0 and documents a QuickJS engine via rquickjs. This is a promising SDK-free route, **not admission**: native optional binding, embedded runtime, runtime Web API support and full exact dependency closure still need inspection. No npm package installation or componentizer execution occurred.

## Continuation and exact decisions

1. Resolve scoped build-only Cargo/libgit2/LibXDiff and selected embedded-UI native bundle admission, or identify already-qualified alternatives. The recommendation is to allow only these exact unmodified build tools in an isolated build environment, retain notices/source, and prove no compiler/native image-processing libraries enter the MeOS browser assets or service image. This is a proposed decision, not approval or complete license-closure proof. Do not silently broaden the TrailBase-only OSL exception.
2. Populate exact source submodules, derive selected Linux build closure (including embedded UI), qualify all components, and build with one job, debug info off, incremental off and bounded disk/memory. Current host has 3.7 GiB RAM and worktree volume about 22 GiB free; do not launch an unbounded default Wasmtime build.
3. Qualify the QuickJS componentizer or another permissive ABI generator; compile independent handlers and prove trusted context overwrite, resource disposal and standard Web APIs.
4. Admit exact service image only after native/base inventory passes, then bootstrap and run real B1–B4 acceptance and separate synthetic restore. Current 30 focused tests are not a substitute for those gates.

No new general backend is proposed or introduced. Persistent cutover remains B5's explicit user gate.

## Telegram41818 continuation: selected closure now resolved

The earlier Cargo/libgit2/LibXDiff and sharp/libvips proposal is approved **only at the exact versions/scopes recorded in `memory/meos/BUILD-TOOLS-DECISION.md`**. This section supersedes the earlier statements that no compiler executable has been run: Cargo/rustc version probes and Cargo metadata/tree resolution have now run from a private `.qualification/toolchain` prefix. No build script, componentizer or TrailBase runtime has run. No global compiler installation occurred.

Full official Rust 1.95.0 source was retained and its published SHA-256 verified (`62b67230754da642a264ca0cb9fc08820c54e2ed7b3baba0289876d4cdb48c08`). The three exact TrailBase submodule commits were obtained from the pinned Git tree, their archives retained, and their paths populated without modifying upstream source. Their provenance and bounded inventory evidence hashes are committed in `backend/qualification-evidence.json`; full inventories/archives remain under `.qualification/`.

Actual `cargo tree --locked -p trailbase-cli --no-default-features --features trailbase/wasm --target x86_64-unknown-linux-gnu -e normal,build` selects **611** packages. There is no GEOS and no mandatory GPL/MPL package in this selected Cargo metadata. This does **not** alone prove every linked native component/license. Exact source notice inventory was retained for all 611 packages. For example, AWS-LC explicitly elects BSD for its dual-licensed jitter RNG; zstd retains both its BSD license and unused GPL alternative; those notices are not evidence that a mandatory GPL component is selected. Compound selections and final binary inventory still require admission review.

**Correction to earlier auth UI assumption:** `trailbase-auth-ui-component` is not selected in the native CLI build. Auth UI is separately downloadable WASM; it is not automatically built by this command. Thus the approved sharp/libvips bundle is not needed for this selected native build. Do not introduce it merely because permission exists. Any later optional auth UI artifact needs its own complete closure and retained corresponding sources before use.

The **embedded admin UI** is selected. Its exact Linux/x64/glibc pnpm lock closure contains **702** package entries, including its build/dev dependencies and local client. Registry archives were retained and verified against lockfile SRI; exact package licenses and notice hashes were inventoried without installing/executing packages. The pinned Git dependency `@tiledb-inc/wkx` is MIT; source archive SHA-256 is `c7c7e98e7ac64cf8078c5306c449cf077fcb6cd334caf25003c9f8130a4f7d1e`. The data package caniuse-lite carries CC-BY-4.0 attribution; retain its notice. Full artifact admission remains false.

### One newly confirmed exact build-only gate

The actual admin Tailwind build selects `@tailwindcss/node@4.3.3`, which selects **lightningcss 1.32.0** and its Linux x64 native package, both **MPL-2.0**. This is not the separately approved 1.33.0 version. Source/build tracing confirms this is an active build dependency, not an overinclusive workspace-lock guess.

- `lightningcss@1.32.0` archive SHA-256: `c83e81ea213c9e419c5877460a6788f0d0931d58a4aa9fea92fac1a99a1550e8`.
- `lightningcss-linux-x64-gnu@1.32.0`: `9e6f466230dadda414b50614590dd158e26bf65d3a6db8dd1d321066203c310b`.
- Matching source commit: `7f8a861bdee476fe90c89a8badeb3fd33a99c51a`; retained source archive SHA-256: `b9451f8a7bb1a9cf0cd905af3a23db2e963a6c3171a9272633e5fd03f2842198`.
- Proposed exact scope: unchanged private build tool only; retain source/notices, no redistribution of build tools/images, prove compiler/native code absent from generated browser assets and final service image. **Not approved by this document.**

The existing exception explicitly disallows version expansion. Building the unmodified pinned upstream admin UI therefore needs this exact extension or an independently qualified alternative; silently changing its pinned dependency or deleting its UI would change the approved unmodified-service scope. No build attempted across this gate.

### Independent handler follow-through

Backend validation now requires `HH:mm` whenever a task has a schedule. Missing time and `Anytime` are rejected; midnight is valid. Command-level regression proves a rejected update preserves both stored time and revision. Unscheduled Inbox tasks remain distinct from scheduled tasks.

QuickJS componentizer 0.4.2 exact source was retained from npm gitHead `cea7b3e173356d89779e576f545bd1d1c0f03ad1`. Its `Context::full` supplies ECMAScript, not the Web API/Intl environment used by these handlers. A compiled WASI HTTP bridge plus qualified URL/UTF-8/stream/timezone support is still required; do not claim the existing Node tests prove this binding. Componentizer/native runtime closure and generated component remain unqualified and unexecuted. No alternate general-purpose backend has been introduced.
