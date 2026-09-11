# 0.5.0

- Promoted the validated `0.5.0-rc.2` runtime to the stable `0.5.0` release.
- Validated Player against Anyo `0.10.0-rc.1` and Sekai64 `0.8.0-rc.33` without changing Player runtime ownership boundaries.
- Documented first-class composition with `@blcklab/anyo-animation@0.1.2` using Player's existing `renderer.modules`, `renderer.assetLoaders`, and `plugins` hooks.
- Kept VRM host-installed through the canonical `@blcklab/anyo-avatar@0.2.0` `/vrm/sekai64` entry point.
- Documented the required shared `AnimationRendererModule` for manually attached animated VRM assets.
- Added a tag-driven GitHub Actions npm publish workflow with provenance and tag/version verification.

# Track F production validation (unreleased)

# 0.5.0-rc.1

- Promoted adaptive quality, runtime health, diagnostics, cache/loading, and view preferences to a new immutable release identity for Atlas adoption.
- Preserved host renderer-optimization overrides whenever quality presets are applied, allowing Atlas to lock renderer streaming, origin rebasing, Hi-Z occlusion, and static batching policies.



## Unreleased

### Fixed

- Prevented Vue from deep-proxying the imperative Player instance.
- Made performance snapshot delivery safe when framework reactivity wraps internal state in a Proxy.

- Added production-scale source loading, repeated lifecycle ownership, and diagnostic-evidence tests.
- Added browser compatibility, WebGL context-loss, WebGPU device-loss, long-run memory, Safari, CDN/no-build, and physical-device validation harnesses.
- Added formal evidence matrices that distinguish automation, emulation, and physical-device proof.
- Added Track F CI and source verification without changing Player runtime ownership boundaries.

# Track D development candidate (unreleased)

- Added device-aware quality presets, host policy clamps, persisted quality preferences, target-FPS control, and dynamic resolution.
- Added persisted FOV, look sensitivity, and inverted-Y view preferences across pointer, touch, and gamepad input.
- Added Blob/File, virtual folder-map, and trusted host-decoded archive world loading.
- Added source migration, SHA-256 integrity checks, document-size limits, cache policies, relative package-asset resolution, and deterministic object-URL cleanup.
- Added WebGPU recovery fallback to WebGL2, runtime health, active-document hashing, and downloadable diagnostic bundles.
- Added built-in and custom-target captions without taking ownership of voice or audio playback.
- Expanded Track C renderer telemetry exposed by Anyo Player.
- Preserved zero runtime dependencies and existing framework-neutral, custom-element, Vue, and React public entry points.

# 0.5.0-rc.1

- Added true orthographic Top inspection when the renderer camera adapter supports projection switching.
- Top-view wheel input now changes orthographic scale instead of moving the camera through geometry.
- Top framing now fits world bounds using viewport aspect and restores the previous projection when leaving Top mode.

# 0.4.0-rc.2

- Make Orbit, Top, and Free inspection input canvas-focused and independent from first-person entry state.
- Handle rejected or already-lost Pointer Capture without throwing `InvalidStateError`.
- Focus the renderer canvas automatically when an inspection mode is selected.
- Add scoped Free-camera WASD/arrow movement, Q/E vertical movement, drag-look, and wheel speed adjustment.
- Preserve the Explore, Orbit, Top, Free, teleport, framing, and bounded recovery APIs introduced in rc.1.

## 0.3.0-rc.25

- Bind URL-source fetch calls to `globalThis` so browser `Window.fetch` is never invoked with the Player resolver as its receiver.
- Add a regression test covering the portal preload path's browser fetch receiver.

# Changelog

## 0.3.0-rc.24

- Added `components.registry` and `components.unknown` Player options so extension-defined Anyo components can compile through the built-in entity pipeline.
- Replaces only the built-in entities plugin while preserving the rest of the explorable preset.


## 0.3.0-rc.23

- Forwarded Sekai64 S1–S7 color management, environment lighting, shadow, and image-quality options through Anyo Player.
- Updated the validated Anyo/Sekai64 development baseline to Anyo 0.9.1-rc.12 and Sekai64 0.8.0-rc.18.

## 0.3.0-rc.22

- Added dynamic `registerWorld()` and `unregisterWorld()` APIs for trusted host integrations such as Anyo Map building portals.
- Added deduplicated, cancellable world preloading through `cancelWorldPreload()`.
- Preserved the current active world when a dynamic registration cleanup runs.
- Fixed disposal ordering for active preload tasks.

## 0.3.0-rc.21

- Added optional Map lifecycle targets and a visible map-attribution surface for `@blcklab/anyo-map`.
