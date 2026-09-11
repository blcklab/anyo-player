# Internal architecture boundaries

Player is the browser-facing host around an Anyo runtime. The public package should keep these ownership boundaries stable unless a major release deliberately changes them.

## Player owns

- host container and renderer canvas lifecycle;
- source preparation and cancellation;
- browser input ownership;
- responsive sizing and DPR policy;
- Player UI and accessibility surfaces;
- pause/resume and visibility policy;
- world replacement and registered-world navigation;
- renderer recovery orchestration;
- framework/custom-element lifecycle adapters;
- diagnostics and host-facing telemetry state.

## Anyo owns

- world schema and world lifecycle;
- entities/components and plugin lifecycle;
- systems and simulation scheduling;
- authored exploration semantics;
- Web Surface semantic contracts.

## Sekai64 owns

- rendering backends and renderer resources;
- camera/scene rendering primitives;
- glTF/GLB rendering and optional renderer modules;
- skeleton, skinning, mixer, and renderer-level animation primitives;
- renderer-specific recovery behavior exposed through the integration boundary.

## Optional packages remain host-installed

Animation, avatar/VRM, physics, audio, VFX, map features, decoders, and similar feature packages should not become hidden Player dependencies just because the official loader uses them.

Player exposes composition hooks; the host chooses the integrations.
