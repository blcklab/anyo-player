# Running Anyo Player in production

A Player instance owns more than a canvas. It owns a browser-facing runtime generation: the Anyo world, the Sekai64 renderer, input listeners, responsive sizing, optional XR state, diagnostics, and resources created while resolving a source.

The safest production integration is therefore simple: **one host owns one Player, and that host disposes it when it is done.**

## Recommended lifecycle

```ts
const player = createAnyoPlayer({
  container,
  source: '/world.anyo.json',
})

try {
  await player.load()
} catch (error) {
  // Surface the failure in your application shell or telemetry.
}

// On route/component/application teardown:
await player.disposeAsync()
```

Use `replaceWorld()` when the same host should continue running but the active world changes.

```ts
await player.replaceWorld('/worlds/gallery/world.anyo.json')
```

Do not create a second Player on the same container before the first one has finished `disposeAsync()`.

## Loading worlds and assets

URL worlds keep a base URL, so relative assets in the document resolve next to the world source. This works well with versioned CDN repositories as long as the world and its assets are served from the same pinned revision.

For cross-origin worlds or models, the asset server must provide browser-compatible CORS headers. Player does not bypass CORS.

For local packages, use `Blob`, `File`, virtual file maps, or `createAnyoPlayerFolderSource()`. Player scopes object URLs to the active source and revokes them when the source is replaced or the Player is disposed.

## Keep code out of world JSON

An Anyo world is data. Executable behavior belongs to trusted host code.

Keep these in your application rather than in authored JSON:

- plugins;
- action handlers;
- framework applications mounted into Web Surfaces;
- custom asset loaders;
- archive decoders;
- analytics sinks;
- storage adapters;
- renderer modules.

This keeps the trust boundary visible and auditable.

## Renderer recovery

Renderer loss can happen because of drivers, browser GPU resets, WebGPU device loss, or operating-system resource pressure.

Player can be configured to rebuild a runtime automatically and, when appropriate, fall back to WebGL2.

```ts
const player = createAnyoPlayer({
  container,
  source,
  rendererRecovery: {
    automatic: true,
    fallbackBackend: 'webgl2',
    fallbackAfterAttempt: 2,
  },
})
```

Treat recovery as an application policy rather than a promise that every device can recover from every GPU failure. Use `createRuntimeHealth()` and `createRuntimeReport()` when collecting support diagnostics.

## Input and user gestures

Browsers intentionally gate some capabilities behind a user gesture:

- pointer lock;
- fullscreen;
- audio unlock;
- immersive WebXR entry.

Design the host UI so the user can enter or retry these capabilities. A rejected permission or unavailable capability should not be treated as a corrupted world.

## WebXR

WebXR requires a secure context and a compatible device/browser runtime. A desktop browser saying that immersive XR is unsupported is a normal capability result, not a Player failure.

Always test XR entry, tracking loss, exit, disposal, and re-entry on the physical headset models you plan to support.

## Accessibility

Player provides accessible loading state, progress, retry controls, status announcements, keyboard entry, focus management, captions, and input-modality tracking. Applications can customize or replace Player UI, but should preserve equivalent semantics.

If your host replaces built-in UI, verify keyboard focus, live-region behavior, reduced-motion handling, and visible recovery/error actions in the final application rather than only in isolated package tests.

## Framework hosts

Vue and React adapters use the same framework-neutral Player core. Treat the Player instance as an imperative runtime object rather than reactive application data.

A framework component should:

1. create or mount the Player once for its current generation;
2. update the world through the adapter or Player APIs;
3. await disposal before allowing a new generation to own the same host.

The provided adapters already implement these ownership rules.

## Production checklist

Before release, confirm that your application:

- loads its real production world URL rather than a local fixture;
- serves cross-origin assets with correct CORS policy;
- pins repository/CDN revisions when deterministic worlds are required;
- disposes Player instances during route or application teardown;
- keeps loaders, plugins, and executable callbacks in trusted host code;
- handles loading and fatal errors visibly;
- tests world replacement if the app navigates between worlds;
- tests renderer recovery on the backends you enable;
- tests the real framework versions used by the host;
- tests the physical browsers, mobile devices, controllers, and XR hardware that matter to the product.

`npm run check` is the package release gate. It is intentionally broad, but automated tests do not turn unavailable physical hardware into a claimed pass.
