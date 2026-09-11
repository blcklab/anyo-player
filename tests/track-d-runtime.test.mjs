import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { PerformanceController } from '../dist/internal/PerformanceController.js'
import { SourceResolver } from '../dist/internal/SourceResolver.js'
import { AnyoPlayerMemoryWorldCache } from '../dist/worldCache.js'
import { FakeContainer, FakeRuntimeFactory, FakeWorld } from './helpers.mjs'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

function nativeRenderer() {
  return {
    backend: 'webgpu',
    imageQuality: { renderScale: 1, msaaSamples: 4, maxAnisotropy: 8, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0.08 },
    stats: {
      fps: 60, cpuFrameMs: 4, gpuFrameMs: 6, renderScale: 1,
      drawCalls: 10, triangles: 1000, visibleObjects: 20, culledObjects: 5,
      pipelineChanges: 2, geometryMemory: 100, textureMemory: 200,
      instancedDrawCalls: 1, instancesRendered: 8, clusterOverflows: 0,
    },
    setImageQuality(value) { Object.assign(this.imageQuality, value); this.stats.renderScale = this.imageQuality.renderScale },
    setShadowOptions(value) { this.shadows = { ...(this.shadows ?? {}), ...value } },
    setPostProcessing(value) { this.post = structuredClone(value) },
    setOptimization(value) { this.optimization = { ...(this.optimization ?? {}), ...value } },
  }
}

test('quality policy, persistence, inactive scaling, and renderer telemetry work together', async () => {
  const storage = new MemoryStorage()
  const native = nativeRenderer()
  const controller = new PerformanceController({
    quality: 'ultra',
    targetFps: 60,
    dynamicResolution: true,
    storageKey: 'quality',
    policy: { maximumQuality: 'medium', maximumAnisotropy: 4, maximumShadowCascades: 2 },
  }, {}, { storage })
  controller.attach({ getNativeAccess: () => ({ engine: { renderer: native } }) })
  assert.equal(controller.snapshot.resolvedQuality, 'medium')
  assert.equal(native.imageQuality.maxAnisotropy, 4)
  assert.equal(native.shadows.cascades, 2)
  assert.equal(controller.snapshot.instancedDrawCalls, 1)
  assert.equal(controller.snapshot.renderedInstances, 8)

  controller.setActive(false)
  assert.equal(native.imageQuality.renderScale, 0.5)
  assert.equal(controller.snapshot.inactive, true)
  controller.setActive(true)
  assert.equal(controller.snapshot.inactive, false)

  const saved = await controller.save()
  assert.equal(saved.key, 'quality')
  controller.setTargetFps(30)
  assert.equal(controller.preference.targetFps, 30)
  await controller.load()
  assert.equal(controller.preference.targetFps, 60)
  controller.dispose()
})

test('source loading migrates Blob worlds, verifies integrity, resolves package assets, and cleans temporary URLs', async () => {
  const legacy = { version: '0.6', assets: { tree: { type: 'texture', format: 'png', src: './tree.png' } } }
  const json = JSON.stringify(legacy)
  const bytes = new TextEncoder().encode(json)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const integrity = [...digest].map(value => value.toString(16).padStart(2, '0')).join('')
  const resolver = new SourceResolver()
  const blob = await resolver.resolve({ blob: new Blob([json]), integrity }, new AbortController().signal)
  assert.equal(blob.document.version, '0.7')
  assert.equal(blob.info.integrity, 'verified')
  assert.equal(blob.info.migratedFrom, '0.6')

  const packaged = await resolver.resolve({
    files: {
      'world.anyo.json': JSON.stringify(legacy),
      'tree.png': new Blob(['png'], { type: 'image/png' }),
    },
  }, new AbortController().signal)
  assert.match(packaged.document.assets.tree.src, /^blob:/)
  assert.equal(packaged.info.kind, 'file-map')
  assert.equal(typeof packaged.cleanup, 'function')
  packaged.cleanup()
})

test('cache policy falls back to the last valid world when the network is unavailable', async () => {
  const cache = new AnyoPlayerMemoryWorldCache()
  await cache.set('world', {
    key: 'world',
    storedAt: '2026-08-04T00:00:00.000Z',
    documentUrl: 'https://example.com/world.anyo.json',
    document: { version: '0.7', revision: 1, metadata: { cached: true } },
  })
  const resolver = new SourceResolver({
    baseUrl: 'https://example.com/',
    loading: { cache, cacheMode: 'network-first' },
    fetch: async () => { throw new Error('offline') },
  })
  const resolved = await resolver.resolve({ url: '/world.anyo.json', cacheKey: 'world' }, new AbortController().signal)
  assert.equal(resolved.document.metadata.cached, true)
  assert.equal(resolved.info.cache, 'fallback')
  assert.equal(resolved.info.kind, 'cache')
})

test('Player restores preferences, applies view settings, and exports runtime health diagnostics', async () => {
  const qualityStorage = new MemoryStorage()
  const viewStorage = new MemoryStorage()
  qualityStorage.setItem('quality', JSON.stringify({
    format: '@blcklab/anyo-player/quality-preference', version: 1,
    quality: 'medium', targetFps: 45, dynamicResolution: true, minimumScale: 0.55, maximumScale: 0.8,
  }))
  viewStorage.setItem('view', JSON.stringify({
    format: '@blcklab/anyo-player/view-preference', version: 1,
    fieldOfView: 72, pointerLookScale: 1.25, touchLookScale: 1.1, gamepadLookScale: 0.9, invertY: true,
  }))

  const world = new FakeWorld()
  const factory = new FakeRuntimeFactory([world])
  const cameraCalls = []
  const baseCreate = factory.create.bind(factory)
  factory.create = options => {
    const runtime = baseCreate(options)
    runtime.camera = {
      mode: 'explore',
      setFieldOfView(value) { cameraCalls.push(value) },
      setMode() {}, frame() {}, teleport() {},
    }
    return runtime
  }
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source: { version: '0.7', revision: 0, metadata: { name: 'track-d' } },
    performance: { quality: 'auto', storageKey: 'quality', restoreOnLoad: true },
    view: { storageKey: 'view', restoreOnLoad: true },
  }, {
    runtimeFactory: factory,
    performanceStorage: qualityStorage,
    viewStorage,
    sourceResolver: {
      async resolve(source, signal) {
        if (signal.aborted) throw signal.reason
        return {
          document: structuredClone(source),
          info: { kind: 'document', url: null, bytes: null, cache: 'none', integrity: 'not-requested', migratedFrom: null, documentVersion: source.version },
        }
      },
    },
  })

  const qualityLoaded = []
  const viewLoaded = []
  player.on('qualitypreferenceloaded', event => qualityLoaded.push(event))
  player.on('viewpreferenceloaded', event => viewLoaded.push(event))
  await player.load()

  assert.equal(factory.created[0].options.performance.quality, 'medium')
  assert.equal(factory.created[0].options.performance.targetFps, 45)
  assert.equal(player.viewPreference.fieldOfView, 72)
  assert.equal(cameraCalls.at(-1), 72)
  assert.equal(qualityLoaded.length, 1)
  assert.equal(viewLoaded.length, 1)
  assert.equal(player.sourceInfo.kind, 'document')
  assert.equal(player.health.state, 'healthy')

  player.setViewPreference({ fieldOfView: 78, invertY: false })
  assert.equal(cameraCalls.at(-1), 78)
  const bundle = player.createDiagnosticBundle()
  assert.equal(bundle.format, '@blcklab/anyo-player/diagnostic-bundle')
  assert.equal(bundle.runtime.lifecycle.state, 'ready')
  assert.equal(bundle.qualityPreference.targetFps, 45)
  assert.equal(bundle.viewPreference.fieldOfView, 78)
  assert.equal(typeof bundle.documentHash, 'string')
  await player.disposeAsync()
})

test('renderer recovery can fall back from a lost WebGPU renderer to WebGL2', async () => {
  const lost = new FakeWorld()
  const recovered = new FakeWorld()
  const factory = new FakeRuntimeFactory([lost, recovered])
  const source = { version: '0.7', revision: 0 }
  const player = new AnyoPlayerCore({
    container: new FakeContainer(), source,
    renderer: { backend: 'webgpu' },
    rendererRecovery: { automatic: false, fallbackBackend: 'webgl2', fallbackAfterAttempt: 1 },
  }, {
    runtimeFactory: factory,
    sourceResolver: { async resolve() { return { document: structuredClone(source) } } },
  })
  await player.load()
  lost.emit('renderer:diagnostic', { severity: 'error', code: 'SEKAI64_WEBGPU_DEVICE_LOST', message: 'lost' })
  await new Promise(resolve => setImmediate(resolve))
  await player.recoverRenderer()
  assert.equal(factory.created[1].options.renderer.backend, 'webgl2')
  assert.equal(player.rendererRecovery.state, 'recovered')
  await player.disposeAsync()
})

test('captions render through built-in and registered targets without owning audio playback', async () => {
  const source = { version: '0.7', revision: 0 }
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    ui: false,
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: { async resolve() { return { document: structuredClone(source) } } },
  })
  const shown = []
  let cleared = 0
  const changes = []
  const unregister = player.registerCaptionTarget({
    showCaption(caption) { shown.push(caption) },
    clearCaption() { cleared += 1 },
  })
  player.on('captionchange', event => changes.push(event))
  const caption = player.showCaption('Welcome to Everdawn.', {
    speaker: 'Guide',
    language: 'en',
  })
  assert.equal(caption.visible, true)
  assert.equal(caption.speaker, 'Guide')
  assert.equal(shown.length, 1)
  assert.equal(changes.length, 1)
  assert.equal(player.caption.text, 'Welcome to Everdawn.')
  player.clearCaption()
  assert.equal(player.caption.visible, false)
  assert.equal(cleared, 2) // initial registration sync + explicit clear
  assert.equal(changes.length, 2)
  unregister()
  await player.disposeAsync()
})

test('source limits and archive policy fail closed with typed errors', async () => {
  const oversized = new SourceResolver({ loading: { maxDocumentBytes: 1024 } })
  await assert.rejects(
    oversized.resolve(new Blob([JSON.stringify({ version: '0.7', metadata: { text: 'x'.repeat(2048) } })]), new AbortController().signal),
    error => error?.code === 'PLAYER_SOURCE_TOO_LARGE',
  )

  const resolver = new SourceResolver()
  await assert.rejects(
    resolver.resolve({ archive: new Blob(['archive']) }, new AbortController().signal),
    error => error?.code === 'PLAYER_ARCHIVE_DECODER_REQUIRED',
  )

  await assert.rejects(
    resolver.resolve({ json: JSON.stringify({ version: '0.7' }), integrity: 'sha256:' + '00'.repeat(32) }, new AbortController().signal),
    error => error?.code === 'PLAYER_INTEGRITY_FAILED',
  )
})
