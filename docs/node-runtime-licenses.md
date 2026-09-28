# Node runtime license boundaries

This reference is for maintainers reviewing the protected web adapter's runtime
closure. It retains the exact Node 24.19.0 assessment and notice provenance; it
is not a current installation inventory, pending approval request, or release
admission. Reassess changed artifacts and host libraries against their exact
licenses. Read [backend selections](BACKEND-LICENSE-SELECTIONS.md) for the separate
native-service boundary.

## Reviewed artifact boundary

- Node **24.19.0**, assessed unchanged Linux x86-64 binary.
- Binary SHA256: `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.
- Complete distributed LICENSE SHA256: `148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5`.
- The reviewed release layout copies `bin/node`, complete `LICENSE`, and 27 exact supplemental
  notice/header files under `runtime/node/notices`; no npm,
  corepack, node_modules, development toolchain or shared libraries.
- Application uses Node standard libraries only. Staging pins bytes in a
  root-owned readonly release, avoiding execution of a mutable host-user binary.

## Recorded host linkage

`readelf -d` shows these required host libraries, as recorded for the assessed artifact:

| Assessed package/version | Required libraries | License boundary |
|---|---|---|
| libc6 `2.39-0ubuntu8.9` | libc, libm, libdl, libpthread, ELF loader | LGPL-2.1-or-later library; unchanged host objects |
| libgcc-s1 `14.2.0-4ubuntu2~24.04.1` | libgcc_s | GPL-3.0-or-later with GCC Runtime Library Exception 3.1 |
| libstdc++6 `14.2.0-4ubuntu2~24.04.1` | libstdc++ | GPL-3.0-or-later with GCC Runtime Library Exception 3.1 |

No `.so` is copied or vendored by MeOS staging; the runtime dynamically resolves
the existing system libraries. Their installed package notices remain under
`/usr/share/doc/libc6/copyright`, `/usr/share/doc/libgcc-s1/copyright` and
`/usr/share/doc/libstdc++6/copyright`. Exact resolved object hashes and package
versions are in the assessment JSON. This is a dynamic-link boundary, **not**
merely a process/network boundary, so a deployment's license admission must cover host linkage as well as Node's
bundled code. Upstream runtime permissions and project policy are distinct.

## Bundled notice assessment

The retained LICENSE indexes 44 sections, predominantly MIT, BSD, Apache-2.0,
Unicode, Zlib and public-domain/CC0 grants. Selected BSD alternatives are recorded
where available. ICU's GPL notices expressly identify build-only `aclocal.m4`
and `config.guess`, with Autoconf exceptions; neither script is included in the
reviewed release layout. Keeping their notices does not mean shipping their code.

### Exact-source reconciliation

Official [Node 24.19.0 release archives](https://nodejs.org/dist/v24.19.0/)
were checked against its HTTPS SHASUMS256.txt (no separate signature verification
claimed). Binary archive SHA256 `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`;
source archive SHA256 `f6d95e10a0431ee1067fc6aabe9f762908b4716dd35324e1ddb4b1466b76659f`.
The archive binary and LICENSE exactly match the assessed hashes above.
No downloaded source was executed. Staging requires all 27 supplemental notice
paths and their independently admitted hashes before output creation; the
immutable manifest hashes every retained notice. Exact notices, source/config evidence and
hashes are retained under `source/` beside the assessment.

- **SQLite 3.53.3:** exact amalgamation/header both dedicate to public domain;
  source ID `2026-06-26 20:14:12 d4c0e51e4aeb96955b99185ab9cde75c339e2c29c3f3f12428d364a10d782c62`.
  Full member hashes plus retained headers close the missing aggregate-heading
  provenance question.
- **ICU 78.3:** full compound notice SHA256
  `e55522d81edc687a341a4411e0776e54ca654e90147f354a90458aaced4116af`.
  Unicode 3.0/legacy ICU, BSD dictionary grants, timezone public domain,
  double-conversion BSD and JSON MIT are recorded. NAIST/IPADIC permits use,
  reproduction/distribution with notices; ICOT permits original/modified
  redistribution with warranty text and applicable-law conditions. These are
  exact custom grants for independent review, not an automatic whitelist.
- **V8:** retained subnotices cover BSD core/Strongtalk/inspector/re2,
  Apache abseil/highway/wasm-api, MIT fp16/codegen/simdutf/utf8-decoder,
  BSD rapidhash, CC0 siphash and Zlib. Select MIT for JSONcpp and the BSD
  alternative for VTune; Valgrind's BSD header is distinct from GPL Valgrind.
  Sun fdlibm notice-preservation and Python/PSF historical compound grants
  (`third_party/v8/builtins`) are retained for exact custom-license review.
  Jinja/MarkupSafe/colorama are build-generator dependencies; root-notice
  PCRE/WebKit fixtures reside under tests, not runtime targets.
- **Optional copied V8 glibc:** source contains LGPL code under
  `third_party/glibc`. GN includes it only with `v8_use_libm_trig_functions`;
  exact Node GYP files contain neither this switch nor glibc references.
  Exclusion is an inference from the Node GYP build path, explicitly subject to
  independent confirmation; retained BUILD.gn, GYP and binary config support it.

## Admission and retention

The assessment and retained source/notices are held outside Git under
`.qualification/release-node-runtime-assessment/`. The
[release stager](../scripts/production-stage.py) requires independently admitted
runtime and supplemental-notice hashes; documentation does not replace that
admission. Do not copy host libraries into the release or infer approval for a
new dependency from this record.

Keep this reference while supported release artifacts rely on its notice and
host-link analysis. Remove or replace it only after their license/provenance
records have an authoritative successor and supported release, rollback, and
redistribution needs no longer depend on it. Preserve the actual notices and
applicable obligations separately; deleting prose never discharges them.
