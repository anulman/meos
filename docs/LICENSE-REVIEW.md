# Dependency license qualification — Phase 1

The executable gate checks installed production and development packages, including exact SHA-256 checks of reviewed license files. Unknown licenses fail closed; no blanket MPL/CC-BY/Python allowlist was added.

## Approval

Aidan explicitly approved the proposed MPL exception in Telegram message 41727 on 2026-09-25 ("Approved MPL"). It covers ONLY unmodified `lightningcss@1.33.0` and `lightningcss-linux-x64-gnu@1.33.0`, as isolated build tools needed by the approved TanStack Start stack. They must remain outside browser bundles and the static serving image. Preserve notices and upstream references; no compiler redistribution, modification, or automatic version expansion is approved.

`docs/license-selections.json` binds that approval to exact installed versions and license hashes. Complete shipped license texts are retained in `docs/third-party/`. Metadata/source references are recorded in each selection; exact source releases: https://github.com/parcel-bundler/lightningcss/tree/v1.33.0 (including native package), https://github.com/browserslist/caniuse-lite and https://github.com/nodeca/argparse/tree/2.0.1 . No package was modified.

## Other reviewed selections

- css-mediaquery 0.1.2: metadata BSD; actual Yahoo license has standard three BSD clauses; classified BSD-3-Clause.
- type-fest 5.10.0: select shipped MIT option from MIT OR CC0-1.0.
- caniuse-lite 1.0.30001812: CC-BY-4.0 attribution license, not ShareAlike/copyleft. Exact build-only artifact reviewed; complete supplied attribution/license/disclaimer retained.
- argparse 2.0.1: Python-2.0, non-copyleft; full historical PSF/BeOpen/CNRI/CWI terms retained, not replaced by a shortened summary.

## Delivery boundary

Vite's `meos-build-only-boundary` plugin rejects emitted chunks containing modules from any of the four build-only reviewed packages. Docker's build context includes only client output and static serving configuration; it cannot copy node_modules, pnpm store, server bundles, or compiler binaries. Inspect the resulting container filesystem as part of deployment qualification. The compiler transforms independent MeOS CSS, without shipping the compiler itself. MeOS retains Apache-2.0.

These records are scoped engineering compliance evidence, not a blanket legal opinion or authorization to redistribute compiler artifacts.
