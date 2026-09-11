# Adapter Hardening Matrix

This matrix records the automated validation included with `@blcklab/anyo-player@0.3.0-rc.10`.

## Automated gates

| Area | Core | Custom Element | Vue 3 | React 18/19 | CDN |
| --- | --- | --- | --- | --- | --- |
| TypeScript declarations | Pass | Pass | Pass | Pass | N/A |
| Packed subpath export | Pass | Pass | Pass | Pass | Pass |
| Root framework isolation | Pass | Pass | Pass | Pass | Pass |
| Repeated mount/dispose controller stress | Pass | Shared | Shared | Shared | Shared |
| Rapid source supersession | Pass | Core API | Pass | Pass | Core API |
| Async disposal generation safety | Pass | Pass | Pass | Pass | Shared |
| Curated event cleanup | Pass | Pass | Pass | Pass | Shared |
| Optional framework peer isolation | Pass | Pass | Pass | Pass | Pass |
| Side-effect isolation | Pass | Pass | Pass | Pass | Pass |
| Shadow DOM style ownership | Pass | Pass | Core style controller | Core style controller | Pass |
| CSP nonce behavior | Pass | Pass | Core style controller | Core style controller | Pass |
| Package dry-run contents | Pass | Pass | Pass | Pass | Pass |

## Evidence-qualified validation still required

The automated suite does not replace physical validation. Before promoting Player 0.3 to stable, record results for:

- Chrome, Firefox, and Safari desktop
- Android Chrome and iOS Safari
- Real WebGL2 context loss and restoration
- Real WebGPU device loss and renderer recovery
- Repeated GPU-heavy world replacement under browser memory tools
- React development Strict Mode with the real React 18 and React 19 runtimes
- Vue 3 mount, unmount, KeepAlive, Suspense, and HMR behavior with the real Vue runtime
- Import-map loading from the published CDN package
- Physical WebXR headset entry, tracking loss, exit, disposal, and re-entry

Rows without physical evidence must remain documented as unverified rather than inferred from automated tests.

## RC.10 evidence tooling

RC.10 adds exact framework CI, multi-engine Playwright automation, a real Safari runner, cross-origin GLB/PBR fixtures, WebGL/WebGPU loss workflows, a CDP memory profile, published-CDN verification, and strict evidence files. Automation makes the physical rows reproducible; it does not convert emulation or unavailable hardware into passes. See `../validation/VALIDATION.md`, `../validation/DEVICE_VALIDATION.md`, and `../validation/VALIDATION_STATUS.md`.
