# Sekai64, animation, and VRM

Player `0.5.0` keeps renderer extensions under trusted host control. It creates the normal Anyo/Sekai64 runtime, while the host decides which optional Sekai64 modules and asset loaders should participate.

The release was validated with Anyo `0.10.0-rc.1` and Sekai64 `0.8.0-rc.33`.

## Animated GLB and glTF

`@blcklab/anyo-animation@0.1.2` exposes a Player-ready Sekai64 integration:

```ts
import { createSekai64AnimationIntegration } from '@blcklab/anyo-animation/sekai64'

const animation = createSekai64AnimationIntegration()

const player = createAnyoPlayer({
  container,
  source,
  renderer: {
    modules: [animation.module],
    assetLoaders: [animation.assetLoader],
  },
  plugins: [animation.plugin],
})
```

The integration supplies the Sekai64 animation module, the animated GLB/glTF asset loader, and the Anyo animation plugin as one coherent set.

## VRM

VRM remains opt-in. Register the canonical loader from `@blcklab/anyo-avatar@0.2.0`:

```ts
import { createSekai64VrmAssetLoader } from '@blcklab/anyo-avatar/vrm/sekai64'

createSekai64VrmAssetLoader({
  animationModule: animation.module,
})
```

Use the **same** `animation.module` instance for both systems. VRM is a skinned glTF format, so the loader and `anyo.animation` need to observe the same skeleton and animation-mixer runtime.

`@blcklab/anyo-animation@0.1.2` can attach to a compatible animated model node even when that model was created by the VRM loader rather than by Animation's own loader.

## Why Player does not install these automatically

Different applications need different runtime capabilities. Keeping animation, VRM, physics, audio, map features, decoders, and other extensions host-installed avoids forcing those costs and policies onto every Player consumer.

It also preserves a clear trust boundary: optional executable integrations are chosen by the application, not by world JSON.
