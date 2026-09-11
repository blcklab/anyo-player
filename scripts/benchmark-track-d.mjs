import { performance } from 'node:perf_hooks'
import { SourceResolver } from '../dist/internal/SourceResolver.js'
import { PerformanceController } from '../dist/internal/PerformanceController.js'
import { ViewPreferenceController } from '../dist/internal/ViewPreferenceController.js'
import { AnyoPlayerMemoryWorldCache } from '../dist/worldCache.js'

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = q => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))] ?? 0
  return {
    iterations: samples.length,
    medianMs: Number(at(0.5).toFixed(3)),
    p95Ms: Number(at(0.95).toFixed(3)),
    minimumMs: Number((sorted[0] ?? 0).toFixed(3)),
    maximumMs: Number((sorted.at(-1) ?? 0).toFixed(3)),
  }
}

async function measure(iterations, operation) {
  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    await operation(index)
    samples.push(performance.now() - started)
  }
  return stats(samples)
}

const entityCount = 10_000
const document = {
  version: '0.7',
  revision: 1,
  metadata: { name: 'Track D benchmark world' },
  entities: Array.from({ length: entityCount }, (_, index) => ({
    id: `entity-${index}`,
    type: 'box',
    position: [index % 100, Math.floor(index / 100) % 10, -Math.floor(index / 100)],
    size: [1, 1, 1],
    color: '#88aaff',
  })),
}
const json = JSON.stringify(document)
const resolver = new SourceResolver({ loading: { maxDocumentBytes: 32 * 1024 * 1024 } })
const sourceResolution = await measure(12, async () => {
  await resolver.resolve({ json }, new AbortController().signal)
})

const cache = new AnyoPlayerMemoryWorldCache()
const cacheEntry = { key: 'benchmark', storedAt: new Date(0).toISOString(), document }
const cacheRoundTrip = await measure(100, async index => {
  const key = `benchmark-${index % 5}`
  await cache.set(key, { ...cacheEntry, key })
  const value = await cache.get(key)
  if (!value || value.document.entities.length !== entityCount) throw new Error('Cache round-trip failed.')
})

const renderer = {
  backend: 'webgpu',
  imageQuality: { renderScale: 1, msaaSamples: 4, maxAnisotropy: 8, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0.08 },
  stats: {
    fps: 60, cpuFrameMs: 5, gpuFrameMs: 8, renderScale: 1,
    drawCalls: 250, triangles: 1_000_000, visibleObjects: 2_500, culledObjects: 7_500,
    pipelineChanges: 12, geometryMemory: 256 * 1024 * 1024, textureMemory: 384 * 1024 * 1024,
  },
  setImageQuality(value) { Object.assign(this.imageQuality, value); this.stats.renderScale = this.imageQuality.renderScale },
  setShadowOptions() {}, setPostProcessing() {}, setOptimization() {},
}
const performanceController = new PerformanceController({ quality: 'auto', dynamicResolution: true, targetFps: 60, telemetryIntervalMs: 10_000 })
performanceController.attach({ getNativeAccess: () => ({ engine: { renderer } }) })
const telemetrySampling = await measure(10_000, () => performanceController.sample())
performanceController.dispose()

const fakeContainer = { ownerDocument: { defaultView: null } }
const viewController = new ViewPreferenceController(fakeContainer, { fieldOfView: 60 })
const viewUpdates = await measure(10_000, index => {
  viewController.set({ fieldOfView: 50 + (index % 50), invertY: index % 2 === 0 })
})

const report = {
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  fixture: { entities: entityCount, jsonBytes: Buffer.byteLength(json) },
  sourceResolution,
  cacheRoundTrip,
  telemetrySampling,
  viewUpdates,
  note: 'CPU/document benchmark only. This is not a browser FPS, GPU, network, or device-recovery benchmark.',
}
console.log(JSON.stringify(report, null, 2))
