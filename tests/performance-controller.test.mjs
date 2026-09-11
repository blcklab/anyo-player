import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PerformanceController,
  applyQualityToRendererOptions,
  normalizePerformanceOptions,
  qualitySettings,
} from '../dist/internal/PerformanceController.js'

test('quality presets normalize and merge without discarding explicit renderer overrides', () => {
  const normalized = normalizePerformanceOptions({ quality: 'high', targetFps: 60, dynamicResolution: true })
  assert.equal(normalized.resolvedQuality, 'high')
  assert.equal(normalized.maximumScale, 1)

  const merged = applyQualityToRendererOptions({
    backend: 'auto',
    imageQuality: { maxAnisotropy: 12 },
    postProcessing: { bloom: { strength: 0.2 } },
  }, { quality: 'medium' })
  assert.equal(merged.imageQuality.renderScale, 0.8)
  assert.equal(merged.imageQuality.maxAnisotropy, 12)
  assert.equal(merged.postProcessing.ssao.enabled, true)
  assert.equal(merged.postProcessing.bloom.strength, 0.2)
  assert.equal(merged.optimization.cachedBounds, true)
})

test('performance controller applies quality settings, samples telemetry, and adjusts resolution', () => {
  const changes = []
  const applied = []
  const native = {
    backend: 'webgpu',
    imageQuality: { ...qualitySettings('high').imageQuality },
    stats: {
      fps: 60,
      cpuFrameMs: 5.5,
      gpuFrameMs: 7.25,
      renderScale: 1,
      drawCalls: 42,
      shadowDrawCalls: 18,
      postProcessPasses: 3,
      triangles: 125000,
      visibleObjects: 240,
      culledObjects: 510,
      pipelineChanges: 8,
      materialChanges: 15,
      textureUploads: 2,
      geometryMemory: 3_000_000,
      textureMemory: 12_000_000,
    },
    setImageQuality(options) {
      Object.assign(this.imageQuality, options)
      this.stats.renderScale = this.imageQuality.renderScale
    },
    setShadowOptions(options) { this.shadows = { ...(this.shadows ?? {}), ...options } },
    setPostProcessing(options) { this.postProcessing = structuredClone(options) },
    setOptimization(options) { this.optimization = { ...(this.optimization ?? {}), ...options } },
  }
  const adapter = { getNativeAccess: () => ({ engine: { renderer: native } }) }
  const controller = new PerformanceController({
    quality: 'high',
    targetFps: 60,
    dynamicResolution: true,
    telemetryIntervalMs: 10_000,
    minimumScale: 0.6,
    maximumScale: 1,
    sampleWindow: 3,
    adjustmentIntervalMs: 500,
  }, {
    onChange: event => changes.push(event),
    onQualityApplied: (quality, renderScale) => applied.push([quality, renderScale]),
  }, {
    rendererOptimization: { hizOcclusion: false, staticBatching: false, regionStreaming: false, worldOriginRebasing: false },
  })

  const originalNow = Date.now
  let now = 1_000
  Date.now = () => now
  try {
    controller.attach(adapter)
    const first = controller.snapshot
    assert.equal(first.backend, 'webgpu')
    assert.equal(first.drawCalls, 42)
    assert.equal(first.gpuFrameMs, 7.25)
    assert.equal(native.shadows.cascades, 3)
    assert.equal(native.postProcessing.ssao.enabled, true)
    assert.equal(native.optimization.pipelineSorting, true)
    assert.equal(native.optimization.hizOcclusion, false)
    assert.equal(native.optimization.staticBatching, false)
    assert.equal(native.optimization.regionStreaming, false)
    assert.equal(native.optimization.worldOriginRebasing, false)

    now += 2_000
    native.stats.fps = 45
    controller.sample()
    controller.sample()
    const adjusted = controller.sample()
    assert.equal(adjusted.resolvedQuality, 'high')
    assert.equal(native.imageQuality.renderScale, 0.95)

    const ultra = controller.setQuality('ultra')
    assert.equal(ultra.resolvedQuality, 'ultra')
    assert.equal(native.shadows.cascades, 4)
    assert.equal(native.imageQuality.maxAnisotropy, 16)
    assert.ok(changes.length >= 3)
    assert.ok(applied.some(([quality]) => quality === 'ultra'))
  } finally {
    controller.dispose()
    Date.now = originalNow
  }
})


test('performance snapshots remain cloneable when framework reactivity proxies internal state', () => {
  const changes = []
  const controller = new PerformanceController({ quality: 'high', telemetryIntervalMs: 10_000 }, {
    onChange: event => changes.push(event),
  })
  const snapshot = controller.snapshot
  controller.snapshotValue = new Proxy(snapshot, {})
  assert.doesNotThrow(() => controller.sample())
  assert.equal(changes.length, 1)
  assert.notEqual(changes[0].previous, snapshot)
  assert.deepEqual(changes[0].previous, snapshot)
  controller.dispose()
})
