# Anyo Player API

This reference describes the public surface of `@blcklab/anyo-player@0.5.0`. The TypeScript declarations shipped in `dist/` are authoritative when a declaration and this guide ever disagree.

## Trusted host plugins

```ts
plugins?: readonly WorldPlugin[]
```

Appends trusted host-created Anyo plugins after Player built-ins for each runtime generation. Player passes a defensive array copy. Plugin objects remain host code and are never loaded from world JSON.

For the optional texture Web Surface package, disable Player's ordinary Web Surface plugin and let the texture plugin own fallback routing:

```ts
createAnyoPlayer({
  container,
  source,
  webSurface: false,
  plugins: [texturePlugin],
})
```

## Runtime exports

```ts
import {
  createAnyoPlayer,
  AnyoPlayerError,
  ANYO_PLAYER_SESSION_FORMAT,
  ANYO_PLAYER_SESSION_VERSION,
  ANYO_PLAYER_INPUT_BINDINGS_FORMAT,
  ANYO_PLAYER_INPUT_BINDINGS_VERSION,
} from '@blcklab/anyo-player'
```

## Construction

```ts
const player = createAnyoPlayer({
  container,
  source,
  renderer,
  exploration,
  interaction,
  resize,
  visibility,
  embedding,
  navigation,
  fullscreen,
  validation,
  ui,
  session,
  input,
  accessibility,
  audio,
  pauseMenu,
  rendererRecovery,
  analytics,
  diagnostics,
  ariaLabel,
  fetch,
  onWarning,
})
```

Only `container` is required. `source` may be supplied during construction or to the initial `load()` call.

## Read-only state

```ts
player.container
player.canvas
player.state
player.phase
player.readyStatus
player.world
player.progress
player.error
player.entered
player.inputMode
player.touchEnabled
player.pointerLocked
player.paused
player.pauseReason
player.fullscreen
player.viewport
player.interactionPrompt
player.interactionTarget
player.reticle
player.vrEnabled
player.vrSupportState
player.vrSupported
player.xrState
player.xrTracking
player.xrInputs
player.sessionEnabled
player.sessionStorageAvailable
player.sessionKey
player.inputBindings
player.inputBindingsStorageAvailable
player.inputBindingsKey
player.gamepadEnabled
player.gamepads
player.activeGamepad
player.reducedMotion
player.reducedMotionPreference
player.inputModality
player.audio
player.rendererRecovery
player.diagnostics
player.telemetry
player.activated
player.preloaded
player.intersection
player.posterVisible
player.worldIds
player.currentWorldId
player.navigation
player.theme
```

Returned arrays and state snapshots are host-readable views. Mutate behavior through public methods rather than changing returned objects.

## Custom element adapter

```ts
import {
  AnyoPlayerElement,
  ANYO_PLAYER_ELEMENT_TAG,
  defineAnyoPlayerElement,
} from '@blcklab/anyo-player/element'
```

The subpath is side-effect free. Register the default tag explicitly:

```ts
defineAnyoPlayerElement()
```

A custom tag name is also supported. The adapter creates a dedicated subclass because browsers do not allow one custom-element constructor to be registered under multiple names.

```ts
defineAnyoPlayerElement('my-world-player')
```

Supported declarative attributes are `src`, `activation`, `preload`, `backend`, `poster`, `pause-when-offscreen`, and `aria-label`. Complex configuration stays property-based:

```ts
const element = document.querySelector<AnyoPlayerElement>('anyo-player')!

element.source = worldDocument
element.options = {
  renderer: { antialias: true },
  exploration: { desktop: true, touch: true, pointerLock: true },
  ui: { theme: { accent: '#67e8f9' } },
}
```

Public adapter methods:

```ts
await element.load(source?)
await element.activate()
await element.replaceWorld(source)
await element.disposeAsync()
```

`element.player` exposes the full framework-neutral Player instance after mounting. The adapter forwards these composed DOM events: `anyo-player-ready`, `anyo-player-error`, `anyo-player-statechange`, `anyo-player-phasechange`, `anyo-player-worldreplaced`, `anyo-player-themechange`, and `anyo-player-disposed`.

The element owns an open Shadow Root and a structural container. Player CSS injection, CSP nonce handling, theme tokens, UI adapters, and cleanup remain owned by the existing Player core.

## Embedding lifecycle

```ts
await player.preload(source?)
player.clearPreload()
await player.activate()
```

`preload()` resolves and caches source JSON without creating a renderer. `activate()` performs normal loading. Manual activation remains the default; immediate and visible activation are opt-in through `embedding`.

## Multi-world navigation

```ts
const unregister = player.registerWorld('gallery', '/worlds/gallery.anyo.json')
await player.preloadWorld('gallery')
player.cancelWorldPreload('gallery')
player.clearWorldPreload('gallery')
await player.navigateTo('gallery')
player.cancelNavigation()
unregister()
```

Configure a data-only world registry through `navigation.worlds`, or register trusted host destinations dynamically with `registerWorld()` and `unregisterWorld()`. Navigation resolves and validates the destination before committing it through the existing `load()` or `replaceWorld()` lifecycle. Preparation can be canceled safely; once runtime mutation begins, the transition is intentionally non-cancelable.

`beforeSwitch` and `afterSwitch` hooks are host callbacks, not authored Anyo JSON. `afterSwitch` failures are reported as warnings because the destination world is already active.

## Lifecycle and world methods

```ts
await player.load(source?)
await player.replaceWorld(source)
await player.retry()
player.enter()
player.pause()
player.resume()
await player.disposeAsync()
```

`load()` is initial-only. Use `replaceWorld()` after readiness. Always await `disposeAsync()` during route or application teardown.

## Camera modes, framing, and teleportation

```ts
player.setCameraMode('orbit', { bounds })
player.setCameraMode('top', { bounds, northUp: true })
player.setCameraMode('free', { speed: 12 })
player.frameCamera({ target: [0, 4, 0], radius: 20 })
player.setCameraMode('explore')

player.teleport({
  position: [0, 1.65, 0],
  rotation: [0, 0],
  resetMotion: true,
})
```

`explore` owns collision, gravity, and normal Player input. `orbit`, `top`, and `free` are inspection modes with collision and fall recovery suspended. Returning to `explore` restores the last exploration pose unless `restoreExplorePose: false` is supplied. The current `top` mode uses a near-vertical perspective camera; orthographic projection is not claimed by this release.

`teleport()` is the supported motion-reset boundary. With `resetMotion: true` it reconstructs the exploration controller, clears accumulated vertical velocity and grounded state, and then installs the requested pose.

Configure bounded verified-ground recovery through `exploration.fallRecovery`:

```ts
const player = createAnyoPlayer({
  container,
  source,
  exploration: {
    fallRecovery: {
      minimumY: -12,
      maxAttempts: 3,
      cooldownMs: 1200,
      supportTolerance: 0.18,
      resetAttemptsAfterSeconds: 4,
    },
  },
})
```

Recovery accepts only collision-supported poses, resets motion on every recovery teleport, and stops after `maxAttempts` instead of looping forever. Observe `cameraMode`, `fallRecovery`, `cameramodechange`, `teleported`, and `fallrecoverychange` for host UI. Set `fallRecovery: false` to disable the system.

## Browser presentation

```ts
await player.enterFullscreen()
await player.exitFullscreen()
await player.toggleFullscreen()
player.resizeNow()

await player.checkVRSupport()
await player.enterVR()
await player.exitVR()

player.setReducedMotion(true | false | 'system')
player.announce('Checkpoint saved', { priority: 'polite' })
```

## UI styling, themes, and adapters

```ts
player.setTheme({ accent: '#67e8f9', panelRadius: '18px' })
player.setTheme(null)
```

`ui.styles` selects `auto`, `external`, or `inject` stylesheet ownership. `auto` injects `ANYO_PLAYER_CSS_TEXT` only when the container is inside Shadow DOM; normal document embeds continue using the external `styles.css` export.

`ui.theme` and `setTheme()` apply typed CSS-variable tokens to the Player container. Host values that existed before construction are restored during `disposeAsync()`. `themechange` is emitted after runtime updates.

`ui.adapter` receives named slots, Player action delegates, labels, and immutable presentation snapshots. `mode: 'augment'` keeps default UI visible; `mode: 'replace'` hides default regions while preserving their internal lifecycle state. Adapter callbacks do not receive the Anyo world or renderer and cannot replace Player authority.


## Sessions

```ts
const snapshot = player.captureSession(options?)
await player.restoreSession(snapshot, options?)
await player.saveSession(key?, options?)
await player.loadSession(key?, options?)
await player.clearSession(key?)
```

Session snapshots are JSON-compatible and versioned. They do not modify authored Anyo JSON.

## Input and interaction

```ts
player.setInputBindings(bindings, { merge: true })
player.resetInputBindings()
await player.saveInputBindings(key?)
await player.loadInputBindings(key?)
await player.clearInputBindings(key?)

await player.interact()
```

Input maps browser actions into Anyo public exploration and selection APIs. Anyo remains authoritative for movement, collision, interaction distance, selection, and action execution.

## Audio, pause presentation, and screenshots

```ts
const unregisterAudio = player.registerAudioTarget(target)
await player.unlockAudio()
await player.setAudioMuted(true)
await player.toggleAudioMuted()

const screenshot = await player.captureScreenshot({
  type: 'image/png',
})
```

Player coordinates only explicitly registered audio targets. Screenshots operate on Player's owned renderer canvas and follow browser canvas/CORS restrictions.

## Recovery, diagnostics, and telemetry

```ts
await player.recoverRenderer()
player.cancelRendererRecovery()
player.clearDiagnostics()

const unregisterSink = player.registerAnalyticsSink(record => {})
player.trackTelemetry('host.event', { value: 1 }, 'host')
player.clearTelemetry()
```

Telemetry is local unless a host explicitly registers a sink. Player has no built-in analytics endpoint or network transport.

## Actions and events

```ts
const unregisterAction = player.registerAction('open-product', context => {})
const unsubscribe = player.on('ready', event => {})
```

Event names are typed by `AnyoPlayerEventMap`, including `'themechange'`, `'activationchange'`, `'intersectionchange'`, `'preloaded'`, `'posterchange'`, `'worldnavigationchange'`, `'worldnavigationstart'`, `'worldnavigationcomplete'`, `'worldnavigationcanceled'`, `'worldnavigationerror'`, and `'worldpreloaded'`. Major groups include lifecycle, loading, diagnostics, input, interaction, sessions, accessibility, audio, screenshots, replacement, recovery, fullscreen, and XR.

## Errors

Public failures use `AnyoPlayerError` with a stable string `code` from `AnyoPlayerErrorCode` and an optional `cause`.

```ts
try {
  await player.enterVR()
} catch (error) {
  if (error instanceof AnyoPlayerError) {
    console.error(error.code, error.message, error.cause)
  }
}
```

Recoverable browser-control failures do not destroy a usable world. Fatal renderer loss is exposed explicitly and can use the bounded recovery API.


## Vue adapter

```ts
import { AnyoPlayer, useAnyoPlayer } from '@blcklab/anyo-player/vue'
```

The component accepts `source`, `options`, `tag`, and `pauseOnDeactivated`. It emits `playerchange`, `ready`, `error`, `statechange`, `phasechange`, `worldreplaced`, `themechange`, and `disposed`, and exposes `player`, `load()`, `activate()`, `replaceWorld()`, and `disposeAsync()`. Vue is optional and never imported by the root Player entry.


## React adapter

```ts
import { AnyoPlayer, useAnyoPlayer } from '@blcklab/anyo-player/react'
```

The component accepts normal `div` attributes plus `source`, `options`, and curated lifecycle callbacks. Its typed ref exposes the current Player and essential lifecycle delegates. React and React DOM are optional peers and are never imported by the root Player entry.


## Auto-registering custom-element entry

```ts
import '@blcklab/anyo-player/element/define'
```

This dedicated subpath registers the default `<anyo-player>` tag as an intentional module side effect. Import `@blcklab/anyo-player/element` instead when registration must remain explicit or a custom tag name is required.


## VFX 0.1

Install `@blcklab/anyo-vfx`, pass its plugin through `plugins`, and connect it with `connectAnyoVfxToPlayer(player, plugin)` when explicit host pause/resume forwarding is needed.

## Runtime quality, source loading, and diagnostics

### Quality and device policy

```ts
player.setQualityPreset('auto' | 'low' | 'medium' | 'high' | 'ultra')
player.setTargetFps(number)
player.setDynamicResolution(boolean)
player.getPerformanceSnapshot()
player.saveQualityPreference(key?)
player.loadQualityPreference(key?)
player.clearQualityPreference(key?)
```

`performance.policy` places host-defined ceilings on quality, target FPS, render scale, anisotropy, and shadow cascades. The resolved quality may therefore be lower than the world or user preference.

### View preferences

```ts
player.setViewPreference({
  fieldOfView,
  pointerLookScale,
  touchLookScale,
  gamepadLookScale,
  invertY,
})
player.resetViewPreference()
player.saveViewPreference(key?)
player.loadViewPreference(key?)
player.clearViewPreference(key?)
```

### Source loading

`AnyoPlayerSource` accepts a `WorldDocument`, JSON, URL, `Blob`/`File`, virtual file map, or trusted host-decoded archive. `createAnyoPlayerFolderSource(files)` converts browser directory selections into a safe virtual file map. `loading` controls migration, integrity verification, size limits, cache policy, and the optional archive decoder.

```ts
await player.load({ url, integrity, cacheKey })
await player.load({ blob, name, baseUrl, integrity })
await player.load({ files, entry, baseUrl, integrity })
await player.load({ archive, decoder, entry, integrity })
```

### Health and diagnostics

```ts
player.createRuntimeHealth()
player.createRuntimeReport()
player.downloadRuntimeReport(filename?)
player.createDiagnosticBundle()
player.downloadDiagnosticBundle(filename?)
```

The diagnostic bundle contains source metadata, active-document hash, renderer/runtime report, quality and view preferences, input bindings, diagnostics, and bounded telemetry.

### Captions

```ts
player.showCaption(text, { speaker, language, durationMs, announce })
player.clearCaption()
const unregister = player.registerCaptionTarget(target)
```

The default UI renders captions. `announce: true` also sends the caption to the Player's polite accessibility announcement region. Audio playback remains outside Player ownership.
