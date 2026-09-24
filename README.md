# @blcklab/anyo-player

A browser player for Anyo worlds.

`@blcklab/anyo-player` takes a world document, gives it a Sekai64 renderer, and owns the browser-facing work around it: loading, input, lifecycle, recovery, responsive sizing, accessibility, world replacement, and optional framework adapters.

It stays deliberately small at the package boundary. Player does not bundle Anyo, Sekai64, animation, avatar, physics, audio, or framework runtimes for you; those remain peer or host-installed packages so an application can choose exactly what it needs.

## Install

```bash
npm install @blcklab/anyo-player @blcklab/anyo @blcklab/sekai64
```

Player `0.5.0` is validated with:

```text
@blcklab/anyo      0.10.0-rc.1
@blcklab/sekai64   0.8.0-rc.33
```

## Start in a minute

```ts
import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')!

const player = createAnyoPlayer({
  container,
  source: '/world.anyo.json',
  renderer: {
    backend: 'auto',
    antialias: true,
  },
  exploration: {
    desktop: true,
    touch: true,
    pointerLock: true,
  },
})

await player.load()
```

When the page, route, or component that owns the player is removed, dispose it too:

```ts
await player.disposeAsync()
```

That final `disposeAsync()` matters in production. It releases browser listeners, input ownership, renderer resources, object URLs, and the active Anyo runtime owned by that Player instance.

## What can be loaded?

Player accepts a URL, JSON text, a world document object, local browser files, virtual folder maps, and trusted host-decoded archives.

```ts
await player.load('/worlds/store/world.anyo.json')
```

```ts
await player.load({
  files: {
    'world.anyo.json': worldJson,
    'assets/store.glb': storeModel,
  },
})
```

For `<input webkitdirectory multiple>`, use `createAnyoPlayerFolderSource()` to preserve relative package paths safely.

## Replace a world without replacing the player

Once a Player is ready, use `replaceWorld()` instead of calling `load()` again:

```ts
await player.replaceWorld('/worlds/gallery/world.anyo.json')
```

For applications with several known worlds, Player also provides registration, preloading, cancellation, and navigation APIs.

```ts
const unregister = player.registerWorld('gallery', '/worlds/gallery/world.anyo.json')

await player.preloadWorld('gallery')
await player.navigateTo('gallery')

unregister()
```

## Host actions stay in the host

World JSON describes the world. Executable application behavior stays in trusted application code.

```ts
player.registerAction('open-product', ({ sku }) => {
  console.log('Open product', sku)
})
```

The same rule applies to plugins, custom asset loaders, Web Surface applications, archive decoders, analytics sinks, and other executable integrations.

## Animated GLB and VRM

Animation and avatar support are optional host integrations. They are not hard dependencies of Player.

The companion versions validated with Player `0.5.0` are:

```bash
npm install @blcklab/anyo-animation@0.1.2 @blcklab/anyo-avatar@0.2.0
```

For animated GLB and VRM, create one shared Sekai64 animation integration and give its animation module to the VRM loader:

```ts
import { createAnyoPlayer } from '@blcklab/anyo-player'
import { createSekai64AnimationIntegration } from '@blcklab/anyo-animation/sekai64'
import { createSekai64VrmAssetLoader } from '@blcklab/anyo-avatar/vrm/sekai64'

const animation = createSekai64AnimationIntegration()

const player = createAnyoPlayer({
  container,
  source: '/world.anyo.json',
  renderer: {
    modules: [animation.module],
    assetLoaders: [
      animation.assetLoader,
      createSekai64VrmAssetLoader({
        animationModule: animation.module,
      }),
    ],
  },
  plugins: [animation.plugin],
})

await player.load()
```

The shared module is intentional. A VRM is a skinned glTF asset; the VRM loader and `anyo.animation` must work against the same mixer and skeleton runtime.

Create fresh integration and loader registrations for each Player lifecycle. The renderer owns the lifetime of registered loaders.

## Web Surfaces

Player enables Anyo Web Surface presentation by default. World data remains declarative; trusted application code remains in the host.

```ts
const player = createAnyoPlayer({
  container,
  source: '/world.anyo.json',
  webSurface: {
    apps: {
      dashboard: {
        mount(container, props, context) {
          const button = document.createElement('button')
          button.textContent = String(props.label ?? 'Open')
          button.addEventListener('click', () => {
            void context.runAction('open-dashboard')
          })
          container.append(button)

          return {
            update(nextProps) {
              button.textContent = String(nextProps.label ?? 'Open')
            },
            dispose() {
              button.remove()
            },
          }
        },
      },
    },
    externalUrls: {
      allowedOrigins: ['https://docs.example.com'],
      sandbox: ['allow-forms', 'allow-popups'],
    },
  },
})
```

Player does not accept executable HTML or JavaScript from world JSON and does not bypass iframe CSP, `X-Frame-Options`, or browser cross-origin restrictions.

Set `webSurface: false` when another trusted plugin owns that presentation path.

## Optional plugins and systems

Trusted host-created Anyo plugins can be appended through `plugins`. Fixed-step systems can be supplied through `systems` and `systemOptions`.

```ts
const player = createAnyoPlayer({
  container,
  source: '/world.anyo.json',
  plugins: [myPlugin],
  systems: [mySystem],
})
```

This is how packages such as physics, audio, VFX, map integrations, or custom application features can participate without becoming Player dependencies.

## Custom element

```ts
import { defineAnyoPlayerElement } from '@blcklab/anyo-player/element'

defineAnyoPlayerElement()
```

```html
<anyo-player
  src="/world.anyo.json"
  activation="visible"
  preload="source"
  backend="auto"
  pause-when-offscreen
  aria-label="Virtual world"
></anyo-player>
```

The custom-element subpath is side-effect free. Registration happens only when `defineAnyoPlayerElement()` is called. If you explicitly want automatic registration, use `@blcklab/anyo-player/element/define`.

## Vue and React

Framework adapters live on separate subpaths so the core package never requires a framework at runtime.

```ts
import { AnyoPlayer } from '@blcklab/anyo-player/vue'
```

```ts
import { AnyoPlayer } from '@blcklab/anyo-player/react'
```

Vue, React, and React DOM are optional peer dependencies. Install only the framework used by your application.

## Runtime controls and diagnostics

Player exposes production controls without making the world document authoritative over the host device.

```ts
player.setQualityPreset('high')
player.setTargetFps(60)
player.setDynamicResolution(true)
player.setViewPreference({ fieldOfView: 72, pointerLookScale: 1.1 })
player.showCaption('Welcome to the showroom.', { speaker: 'Assistant' })

const health = player.createRuntimeHealth()
const report = player.createRuntimeReport()
const bundle = player.downloadDiagnosticBundle()
```

Camera and inspection helpers include:

```ts
player.setCameraMode('orbit', { bounds })
player.setCameraMode('top', { bounds, northUp: true })
player.setCameraMode('free', { speed: 12 })
player.setCameraMode('explore')
player.teleport({ position: [0, 1.65, 0], resetMotion: true })
```

## Production notes

Before shipping a Player host:

- serve worlds and assets with correct CORS headers when they are cross-origin;
- call `disposeAsync()` on route or application teardown;
- keep executable plugins and loaders in trusted host code, never in world JSON;
- treat pointer lock, fullscreen, audio unlock, and XR as user-gesture-gated browser capabilities;
- use a secure context for WebXR;
- configure a fallback renderer when your application needs recovery from WebGPU loss;
- validate real devices and browsers that matter to your users.

The full deployment and lifecycle guide is in [`docs/PRODUCTION.md`](docs/PRODUCTION.md).

## Documentation

- [`docs/README.md`](docs/README.md) — documentation index
- [`docs/PRODUCTION.md`](docs/PRODUCTION.md) — deployment, lifecycle, security, and recovery
- [`docs/api/API.md`](docs/api/API.md) — public API reference
- [`docs/integrations/SEKAI64_080_BRIDGE.md`](docs/integrations/SEKAI64_080_BRIDGE.md) — Sekai64, animation, and VRM composition
- [`docs/guides/SUPPORT.md`](docs/guides/SUPPORT.md) — support and compatibility policy
- [`docs/guides/MIGRATION.md`](docs/guides/MIGRATION.md) — moving to `0.5.0`
- [`docs/TESTING.md`](docs/TESTING.md) — what the release suite proves
- [`CHANGELOG.md`](CHANGELOG.md) — release history

## Development

```bash
npm install
npm run build
npm test
npm run check
```

Generated output is written to `dist/` and is intentionally not committed.

Maintainer-only release notes, evidence procedures, historical milestone documents, and internal architecture notes live under `.internal/` in the source repository. That directory is intentionally excluded from the npm package.

## License

MIT License. Copyright (c) 2026 **Avelurs Tinio**.

## Third-person foundation

PlayerBody owns movement; the camera is a derived view. To control an ordinary entity:

```ts
await player.setCharacterAnchor({ character: 'avatar', facing: 'movement', yawOffset: Math.PI })
player.setThirdPersonCamera({ distance: 2.4, targetHeight: 1.05, collision: true })
console.log(player.viewState) // eye, feet, camera, target, yaw, pitch, facing, distances
```

Yaw offset depends on the model's authored forward direction. Avatar fitting belongs to the host. For skinned VRM/GLB, use the current validated Sekai64 0.8.0-rc.34 line.

Set `setThirdPersonCamera(false)` to restore the body eye view. Configure or release the character anchor separately if you want the avatar out of the first-person view. Camera collision is conservative AABB-based. This development revision does not select locomotion animation clips.


### MMORPG mouse orbit (0.5.1)

Enable drag orbit explicitly so existing pointer-lock integrations remain backward compatible:

```ts
player.setThirdPersonCamera({
  distance: 4,
  targetHeight: 1.35,
  collision: true,
  orbit: {
    button: 2,          // right mouse
    minDistance: 1.5,
    maxDistance: 10,
    minPitch: -1.15,
    maxPitch: 1.1,
  },
})
```

Hold the configured mouse button and drag to orbit around the Player body. Use the mouse wheel to zoom. WASD stays relative to the orbit camera heading, while `facing: 'movement'` characters remain visually independent from the camera and `facing: 'camera'` characters continue to support directional locomotion sets.

Desktop orbit input is bound directly to Player's camera controller so Player-specific RMB-drag and wheel-zoom hooks remain reachable even though Anyo's `world.exploration` facade intentionally exposes only the stable base movement/look contract.

### Camera smoothing and obstruction recovery (0.5.2)

Third-person smoothing is enabled by default. Player keeps authoritative body movement immediate while the visual follow target and zoom arm use frame-rate-independent damping. Camera collision remains conservative: an obstruction shortens the arm immediately, while the camera eases back outward after the obstruction clears.

```ts
player.setThirdPersonCamera({
  distance: 4,
  targetHeight: 1.35,
  collision: true,
  smoothing: {
    horizontalTargetResponse: 18,
    verticalTargetResponse: 10,
    zoomResponse: 16,
    collisionRecoveryResponse: 8,
  },
  orbit: true,
})
```

Most hosts should use the defaults. Set `smoothing: false` when reproducing the pre-0.5.2 immediate camera response for compatibility testing.


### Locomotion telemetry

`player.locomotion` is a read-only snapshot for animation and host integrations. It reports collision-resolved horizontal speed/velocity, vertical velocity, grounded state, run intent, configured walk/run speeds, and a reset serial. Consumers should drive animation from `horizontalSpeed`, not raw keyboard intent, so collisions and blocked movement remain visually correct.
