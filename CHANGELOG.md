# 0.5.4

- Added runtime left/right/center shoulder switching with frame-rate-independent shoulder damping and preserved legacy signed `shoulderOffset` behavior.
- Added independent `orbit.sensitivityX` / `orbit.sensitivityY` plus `invertX`, while keeping the existing scalar `sensitivity` and `invertY` contracts compatible.
- Added renderer-neutral `viewState.characterVisibility` (`0..1`) based on actual post-collision camera distance; Player still does not manipulate VRM/GLB materials.
- Added opt-in speed-reactive dynamic perspective FOV. Walking keeps the base FOV, running can widen toward a bounded boost, and leaving/disabling third person restores the base FOV.
- Expanded `viewState` with effective shoulder offset/side and current perspective FOV for host diagnostics and UI.
- Preserved 0.5.2 smoothing/collision behavior and 0.5.3 LMB free-look / RMB authoritative orbit ownership.
- Added focused P2/P3 regressions for sensitivity axes, inversion, shoulder transitions, close-camera visibility, dynamic FOV, restoration, and validation.

# 0.5.3

- Added default LMB free-look for MMORPG third-person orbit while preserving RMB as the authoritative movement-facing orbit control.
- Free-look now changes visual camera yaw/pitch without changing PlayerBody movement yaw or the anchored character's authoritative facing yaw.
- RMB claims the current free-look heading as the authoritative movement basis, then keeps camera and movement yaw coupled while dragging.
- Added `orbit.freeLookButton` (`0 | 1 | 2 | false`), defaulting to LMB unless LMB is already the configured authoritative orbit button.
- Preserved 0.5.2 frame-rate-independent follow/zoom smoothing, immediate obstruction entry, slow obstruction recovery, Web Surface wheel ownership, and legacy custom orbit-button behavior.
- Added focused regressions for default LMB/RMB ownership, movement independence during free-look, RMB takeover, disabling free-look, and conflicting button validation.

# 0.5.2

- Added frame-rate-independent third-person target and wheel-zoom damping.
- Camera obstruction entry now clamps immediately for collision safety while recovery eases outward after the obstruction clears.
- Separated requested zoom intent from the smoothed physical camera arm internally without changing PlayerBody movement ownership.
- Added `thirdPersonCamera.smoothing` controls with production defaults and `smoothing: false` for the legacy immediate response.
- Added regression coverage for follow smoothing, zoom smoothing, obstruction entry/recovery, and legacy compatibility.

# 0.5.1

- Fix real browser MMORPG camera input by binding desktop controls to PlayerCameraController instead of Anyo's base world.exploration facade.
- Preserve the Anyo exploration facade for stable world-level movement/touch/gamepad routing while exposing Player-only RMB orbit, free-pointer preference, and wheel zoom to desktop input.
- No PlayerBody, collision, animation, Anyo core, or Sekai64 behavior changes.

# 0.5.1-dev.8

- Harden MMORPG third-person orbit input: normalize mouse-wheel delta modes so physical wheels and trackpads zoom consistently.
- Continue right-drag orbit when the pointer leaves the canvas until the configured mouse button is released.
- Hide the center interaction reticle while free-pointer third-person orbit is active.

# 0.5.1-dev.7

- Add opt-in MMORPG-style third-person mouse orbit with an independent camera yaw/pitch arm.
- Add configurable right-drag orbit, pitch limits, wheel zoom distance limits and zoom sensitivity.
- Keep collision-resolved movement camera-relative by feeding orbit yaw into PlayerBody without making the rendered avatar the authoritative movement body.
- Preserve legacy pointer-lock third-person behavior when `orbit` is omitted.
- Keep first-person, inspection camera modes, XR, collisions and locomotion telemetry unchanged.

# Changelog

## 0.5.1-dev.6

- Expose a read-only `locomotion` snapshot with collision-resolved horizontal velocity/speed, vertical velocity, grounded state, run intent, configured walk/run speeds, and a reset serial for teleports/recovery.
- Compute planar velocity from the bounded simulated interval, so long inactive frames do not under-report movement.
- Zero locomotion output when input is cleared and preserve Player as the sole owner of movement/collision; animation remains a consumer only.

## 0.5.1-dev.5

- Rebuild exploration around an independent PlayerBody; add movement-facing, jump, camera collision and view-state diagnostics. Correct native camera rotation order, spawn timing, body teleport/session handling and same-world rebuild continuity.

## 0.5.1-dev.4

- Let the character anchor own an optional positive world scale in the same runtime transform as position and rotation.
- Keep Player format-agnostic: hosts may derive the scale from VRM/GLB bounds, while Player only applies the resolved character transform.
- Preserve the proven first-person locomotion/collision body and Stage-3 follow camera.

## 0.5.1-dev.3

- Add the Stage 3 `setThirdPersonCamera()` follow-camera probe on top of the proven character anchor.
- Keep `FirstPersonController` as the sole locomotion/collision source of truth by restoring the body-eye pose before every movement update and applying the follow camera afterward.
- Keep third-person separate from inspection camera modes; `cameraMode` remains `explore`.
- Restore the real body-eye pose when disabling third-person so first-person resumes without teleporting.


## 0.5.1-dev.2

- Keep the Stage 2 character-anchor runtime unchanged while hardening local development.
- Remove the package-boundary test's hard-coded package version so normal prerelease/version bumps do not fail unrelated architecture tests.
- Use `fileURLToPath()` in validation tooling tests so Windows paths do not become invalid `C:\\C:\\...` paths.

## 0.5.1-dev.1

- Add the Stage 2 `setCharacterAnchor()` API without adding third-person camera behavior.
- Bind an ordinary Anyo entity to the first-person body/feet through the runtime transform store.
- Support player-local right/up/forward debug offsets and yaw offsets so transform ownership can be proven while the camera remains first-person.
- Keep Player independent from VRM, Avatar, and Animation packages; the controlled entity remains a normal Anyo entity.

## 0.5.0

- Normalize integrity-verification byte views to `ArrayBuffer` before Web Crypto hashing for TypeScript 5.8+ DOM compatibility.

The first stable `0.5` release keeps the validated runtime from `0.5.0-rc.2` and turns it into the production package boundary.

### Highlights

- Validated Player with `@blcklab/anyo@0.10.0-rc.1` and `@blcklab/sekai64@0.8.0-rc.33`.
- Kept Player framework-neutral with no direct runtime dependencies.
- Documented the published `@blcklab/anyo-animation@0.1.2` integration for animated GLB/glTF assets.
- Documented manual VRM registration through `@blcklab/anyo-avatar@0.2.0`, sharing the same Sekai64 animation module.
- Preserved the existing `renderer.modules`, `renderer.assetLoaders`, `plugins`, systems, world replacement, navigation, recovery, input, XR, Web Surface, custom-element, Vue, and React contracts.
- Added tag/version verification and npm provenance to the GitHub publish workflow.
- Reworked public documentation around production use instead of historical release-candidate milestones.

Historical release-candidate notes remain in the source repository under `.internal/history/` and are not published to npm.
