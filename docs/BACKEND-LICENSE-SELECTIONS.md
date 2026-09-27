# Reviewed permissive license selections

These are source-reviewed license selections, not invented human exceptions. The project's default preference list is not an exhaustive list of permissive licenses. All copyleft use remains limited to the separately recorded human approvals; Telegram41831 permits version changes only when license and approved usage stay unchanged.

The runtime admission validator now also recognizes these reviewed, standard permissive grants found in exact retained artifacts:

- **Unicode-3.0:** `icu_provider 2.3.1/LICENSE` grants use/copy/modify/distribute with the copyright and permission notice in copies or associated documentation. Retain the complete notice for ICU and other Unicode data/code.
- **Zlib:** `zlib-rs 0.6.8/LICENSE` permits commercial use and redistribution, requires truthful attribution/origin and marked altered sources, and preserves its notice. We do not modify this library.
- **CDLA-Permissive-2.0:** `webpki-roots 1.0.9/LICENSE` permits data use/modification/sharing with the agreement included when sharing the data; it imposes no restrictions on results. Retain the agreement beside root data.
- **Apache-2.0 WITH LLVM-exception:** `wasmtime 48.0.2/LICENSE` and the pinned toolchain/WASI libraries retain Apache terms plus the LLVM exception. Preserve the complete exception text, not only the Apache identifier.

The hashes of exact notices live in the retained source inventories bound by `backend/qualification-evidence.json`. A compound AND grant is represented by an explicit list of all selected licenses; raw ambiguous `OR`, unknown or copyleft expressions still fail admission. For offered alternatives such as ittapi's GPL/BSD or self_cell's Apache/GPL, select the actual packaged BSD or Apache grant and preserve that notice. AWS-LC's own complete notice explicitly elects BSD for its jitter entropy code; do not infer a GPL runtime from its explanation of the unused alternative.

No compiler, host libc, image-processing library or build cache belongs in the final service image. The intended service image is scratch plus the musl-static binary, independent guest, application configuration/migrations and notices. It is still a candidate until the final binary/image inventory and isolation checks pass.

- **MIT-0:** exact `borrow-or-share0.2.4/LICENSE` grants unrestricted use/copy/modification/distribution without attribution conditions; retained regardless.
