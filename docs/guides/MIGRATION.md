# Moving to Anyo Player 0.5.0

For applications already using the late `0.5.0` release candidates, there is no runtime API migration. The stable release keeps the same Player ownership model and promotes the validated runtime without redesigning its public surface.

## Engine baseline

Player `0.5.0` was validated with:

```text
@blcklab/anyo      0.10.0-rc.1
@blcklab/sekai64   0.8.0-rc.33
```

Check your host application's peer versions before upgrading.

## Animation and VRM

If your host uses animated GLB or manually registered VRM assets, use the published companion packages:

```bash
npm install @blcklab/anyo-animation@0.1.2 @blcklab/anyo-avatar@0.2.0
```

Then share one animation module between the animation integration and the VRM loader:

```ts
import { createAnyoPlayer } from '@blcklab/anyo-player'
import { createSekai64AnimationIntegration } from '@blcklab/anyo-animation/sekai64'
import { createSekai64VrmAssetLoader } from '@blcklab/anyo-avatar/vrm/sekai64'

const animation = createSekai64AnimationIntegration()

const player = createAnyoPlayer({
  container,
  source,
  renderer: {
    modules: [animation.module],
    assetLoaders: [
      animation.assetLoader,
      createSekai64VrmAssetLoader({ animationModule: animation.module }),
    ],
  },
  plugins: [animation.plugin],
})
```

The VRM loader remains trusted host code. World JSON does not choose or import executable loaders.

## Existing applications

Existing URL, object, JSON, Blob/File, folder-map, custom-element, Vue, and React integrations remain supported. Existing `load()`, `replaceWorld()`, navigation, quality, recovery, diagnostics, input, and session APIs continue to use the same public contracts.

If you are coming from a much older Player line, treat `0.5.0` as a lifecycle upgrade rather than only a version bump: make sure teardown awaits `disposeAsync()`, use `replaceWorld()` after initial readiness, and review the [production guide](../PRODUCTION.md).
