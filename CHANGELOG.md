# Changelog

## 0.5.0

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
