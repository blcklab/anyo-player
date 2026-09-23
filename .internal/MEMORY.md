# Development memory

## Current baseline
0.5.1, fixing the real desktop-input bridge for MMORPG third-person orbit on top of the dev.8 camera hardening.

## Architecture and boundaries
- PlayerBody owns eye/feet position, collision-resolved movement, vertical velocity, look angles, movement facing, run input and jump input. It uses Anyo CollisionWorld with bounded simulation steps and never reads the renderer camera during movement.
- PlayerCameraController owns explore/orbit/top/free views, character transform layers, fall recovery and the third-person camera arm. First and third person both derive from PlayerBody.
- Player remains model-format-agnostic. It does not import Avatar, VRM or Animation packages.
- The public `locomotion` snapshot is read-only and is intended for host/animation consumers. It exposes resolved planar velocity/speed, vertical velocity, grounded, run intent, configured walk/run speeds and `resetSerial`.
- Horizontal speed is divided by PlayerBody's bounded simulated interval (`min(delta, 0.1)`), not raw wall-clock delta. This is required for correct animation speed after long frames.
- `clearInput()` zeros resolved horizontal locomotion. Teleport/reset increments `resetSerial` and clears sampled motion.
- Character anchoring still writes only the entity transform; animation must not move the authoritative Player root/collider.

## API and behavior
- Existing `setCharacterAnchor`, `setThirdPersonCamera` and `viewState` APIs remain unchanged.
- New `player.locomotion` is nullable when no active runtime exists.
- `runIntent` reports requested run input, while `horizontalSpeed` remains collision-authoritative. Walking/running into a wall therefore reports the resolved speed rather than the requested speed.
- Teleport, reset-to-spawn and session restore remain body-coordinate operations.

## Verification and delivery
- Targeted TypeScript validation for PlayerBody/PlayerCamera/types passes against the matched Anyo/Sekai64 vendors.
- Rebuilt runtime files passed `camera-recovery.test.mjs`, including the new long-frame locomotion telemetry regression.
- Full dependency installation was unavailable in this workspace, so the unchanged React/Vue adapter outputs are retained from the prior verified dev.5 vendor build.
- Keep this file excluded from npm.

## 2026-09-17 dev.7 MMORPG camera
- `setThirdPersonCamera({ orbit: true })` enables right-mouse drag orbit and wheel zoom without changing the legacy behavior when `orbit` is omitted.
- Third-person orbit yaw/pitch is camera-owned. PlayerBody receives only an internal movement-yaw override so WASD remains camera-relative while collision/translation stay Player-owned.
- `viewState.yaw/pitch` report the active orbit angles so host animation direction logic remains camera-relative.
- Disabling third person transfers the final orbit angles back to PlayerBody, avoiding a first-person view snap.
- Desktop input dynamically avoids pointer lock for drag-orbit targets; first-person/legacy modes still use configured pointer lock.

## 2026-09-17 dev.8 MMORPG camera hardening
- Keep dev.7 orbit architecture. Normalize WheelEvent deltaMode before zoom, continue drag on document mousemove outside the canvas, and suppress the center reticle while free-pointer orbit is active.
- No PlayerBody collision/locomotion ownership changes.

## 2026-09-17 dev.9 desktop orbit bridge fix
- Root cause of the browser-only failure: DesktopInputController was bound to Anyo's `world.exploration` facade, which forwards the stable base input contract but not Player-specific orbit hooks (`prefersPointerLock`, `beginPointerLook`, `acceptsPointerLook`, `usesPointerLookButton`, `addZoomDelta`).
- Bind desktop input directly to the Player-owned `PlayerCameraController` when present; fall back to `world.exploration` only when no Player camera exists.
- Touch and gamepad remain on the stable world exploration facade. No Anyo core API expansion is required.

## 2026-09-23 — published baseline → frozen S24 reconciliation
- Supplied published baseline: `0.5.0`.
- Frozen S24 implementation baseline: `0.5.1`.
- Runtime/source behavior follows the frozen S24 handoff; target-only useful docs/examples/tests and repository release identity were preserved where a target baseline was supplied.
- No post-S24 Web Surface/browser features were added.
- Development pins between BLCKLAB packages were aligned to the reconciled S24 versions; release packages remain peer-dependency based.
- `.internal/` is repository-only and must remain excluded from npm package contents.
- Validation status for this reconciliation is recorded in the final validation report; real GPU/browser/VRM checks remain a separate real-machine gate.
## 2026-09-23 — S24 published-baseline reconciliation validation
- Published baseline supplied: `0.5.0`; reconciled frozen S24 version: `0.5.1`.
- Runtime `src/` remains byte-identical to frozen S24; only stale published tests/metadata expectations were reconciled to S24 ownership and versions.
- Automated validation: 231/231 non-framework Player regressions PASS; camera-recovery, dev.8 document mouse continuation, package-boundary, and Track-D stale tests now reflect S24 behavior; exports/boundaries/package/size gates PASS.
- React/Vue adapter runtime tests and full typecheck/build were environment-blocked because React/Vue dev dependencies are not installed in the sandbox; export files were verified and optional framework runtime imports were skipped as designed.
- Final `npm pack --dry-run` PASS. Real browser/VRM/XR visual validation remains a real-machine gate.


## S24 release-version normalization — 2026-09-23

- Final release-clean S24 version: `0.5.1`.
- Runtime/source architecture remains the frozen S24 implementation; this step only normalizes publishable version metadata and cross-package pins.
- Do not reintroduce internal development suffixes into the public release line.
- Re-run the package's normal release checks and real-machine integration gates before npm publication.
