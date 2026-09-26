# Floating action anchor correction checkpoint

## Published source and runtime

- Application source commit: `ab35a69d1dc6e6cf901b049624e544818e46d4dd`.
- Live container: `meos-preview`, running and healthy.
- Actual image from container inspect: `sha256:59ffcd652a0e2dc4ecfbf5d95273ae3ea44a23006c0e866d8617bd69aae0c25b`.
- Preview: `http://127.0.0.1:3180/`, HTTP200 verified after deployment.
- This handoff is documentation-only after the application source commit; no application changes intervened before deployment.

## Correction

Preset corners previously used viewport edges while the default FAB used centered content bounds. All four presets now use the same716px centered content width/minimum18px horizontal inset, top110px and bottom98px clearances. Semantic corner selection follows viewport resize; free dragging still uses viewport constraints. This fixes a concrete layout inconsistency; baseline pointer click dispatch itself was not reproduced as broken.

Shared focus-boundary handling dismisses portaled controls on keyboard departure, and inactive routes unmount FloatingAdd. Existing automatic Floating UI flipping and500ms grace/150ms fade code remain unchanged.

## Checks

- Existing Browser E against isolated dev3182: PASS.
- `pnpm preview:deploy`: PASS including license gate220 artifacts, zero blocked, build, typecheck and container recreation. Existing exact lightningcss1.33.0 build-only MPL exception unchanged. Build reports existing large-chunk warning.
- `MEOS_TEST_URL=http://127.0.0.1:3180 node scripts/browser-anchor.mjs`: PASS48 mouse/touch/keyboard selections across Today/Week at390×844 and1280×900,144 coordinate/navigation-clearance checks including resize,12 keyboard departures to Settings with no residual portals.
- Touch option selection uses real touchscreen taps; drag setup uses automated mouse pointer even in touch contexts.
- `PREVIEW_URL=http://127.0.0.1:3180 node scripts/browser-shell.mjs`: PASS shell, single navigation, overlays, fixed scroll, drag, keyboard placement, route retention, resize bounds, reload reset and Notes dialog checks.
- `git diff --check`: PASS before source commit.
- `docker inspect` confirmed running/healthy and exact image above; HTTP root returned200.

## Remaining scope

This is only the correction checkpoint, not completion of MeOS. Continue phase4 planning/routines and Day/Week Notes, phase5 Settings, then independent qualification and final handoff. Reset-on-reload demo behavior remains unchanged. No backend or persistent-data work was performed.
