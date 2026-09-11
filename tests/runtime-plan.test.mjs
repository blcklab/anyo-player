import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimePlan, DefaultRuntimeFactory } from '../dist/internal/RuntimeFactory.js'
import { createWebSurfaceAppRegistry } from '@blcklab/anyo/web-surface'
import { FakeCanvas } from './helpers.mjs'

test('runtime plan gives Player exclusive desktop browser input ownership', () => {
  const plan = createRuntimePlan(
    { backend: 'auto' },
    { desktop: true, pointerLock: false, lookSensitivity: 0.003 },
    () => {},
  )
  assert.deepEqual(plan.desktopExploration, {
    browserInput: false,
    pointerLock: false,
    lookSensitivity: 0.003,
  })
  assert.equal(plan.backend, 'auto')
  assert.equal(plan.xrEnabled, false)
})

test('runtime plan forces WebGL2 and enables XR when VR is requested', () => {
  const warnings = []
  const plan = createRuntimePlan({ backend: 'webgpu' }, { vr: true }, message => warnings.push(message))
  assert.equal(plan.backend, 'webgl2')
  assert.equal(plan.xrEnabled, true)
  assert.equal(warnings.length, 1)
})


test('runtime plan accepts configured VR session options without changing Anyo XR ownership', () => {
  const plan = createRuntimePlan(
    { backend: 'auto' },
    { vr: { referenceSpace: 'local-floor', optionalFeatures: ['bounded-floor'] } },
    () => {},
  )
  assert.equal(plan.backend, 'webgl2')
  assert.equal(plan.xrEnabled, true)
})

test('default runtime has no Anyo auto resize observer and includes XR plugin only when requested', () => {
  const OriginalResizeObserver = globalThis.ResizeObserver
  let observerCount = 0
  globalThis.ResizeObserver = class { constructor() { observerCount += 1 } observe() {} disconnect() {} }
  try {
    const factory = new DefaultRuntimeFactory()
    const noVr = factory.create({
      canvas: new FakeCanvas(),
      renderer: {},
      exploration: {},
      webSurface: { registry: createWebSurfaceAppRegistry() },
      plugins: [],
      onWarning() {},
    })
    assert.equal(observerCount, 0)
    assert.equal(noVr.world.plugins.some(plugin => plugin.name === 'anyo:explore-xr'), false)
    assert.equal(noVr.world.plugins.some(plugin => plugin.name === 'anyo:web-surface'), true)
    assert.equal(noVr.world.exploration.inputEnabled, false)

    const vr = factory.create({
      canvas: new FakeCanvas(),
      renderer: {},
      exploration: { vr: true },
      webSurface: { registry: createWebSurfaceAppRegistry() },
      plugins: [],
      onWarning() {},
    })
    assert.equal(observerCount, 0)
    assert.equal(vr.world.plugins.some(plugin => plugin.name === 'anyo:explore-xr'), true)
    assert.equal(vr.world.plugins.some(plugin => plugin.name === 'anyo:web-surface'), true)
    assert.equal(vr.renderer.options.backend, 'webgl2')

    const disabled = factory.create({
      canvas: new FakeCanvas(),
      renderer: {},
      exploration: {},
      webSurface: false,
      plugins: [],
      onWarning() {},
    })
    assert.equal(disabled.world.plugins.some(plugin => plugin.name === 'anyo:web-surface'), false)
  } finally {
    globalThis.ResizeObserver = OriginalResizeObserver
  }
})

test('touch-only exploration still installs the Anyo exploration runtime with browser input disabled', () => {
  const plan = createRuntimePlan(
    { backend: 'auto' },
    { desktop: false, touch: true },
    () => {},
  )
  assert.deepEqual(plan.desktopExploration, { browserInput: false })

  const disabled = createRuntimePlan(
    { backend: 'auto' },
    { desktop: false, touch: false },
    () => {},
  )
  assert.equal(disabled.desktopExploration, false)
})


test('default runtime appends trusted host plugins after Player built-ins', () => {
  const factory = new DefaultRuntimeFactory()
  const hostPlugin = { name: 'host:optional-texture' }
  const runtime = factory.create({
    canvas: new FakeCanvas(),
    renderer: {},
    exploration: {},
    webSurface: false,
    plugins: [hostPlugin],
    onWarning() {},
  })

  assert.equal(runtime.world.plugins.at(-1), hostPlugin)
  assert.equal(runtime.world.plugins.some(plugin => plugin.name === 'anyo:web-surface'), false)
})

test('default runtime forwards trusted asset loaders to Sekai64', () => {
  const factory = new DefaultRuntimeFactory()
  const vrmLoader = { type: 'model', formats: ['vrm'], async load() { throw new Error('not used') } }
  const runtime = factory.create({
    canvas: new FakeCanvas(),
    renderer: { assetLoaders: [vrmLoader] },
    exploration: {},
    webSurface: false,
    plugins: [],
    onWarning() {},
  })
  assert.equal(runtime.renderer.options.assetLoaders[0], vrmLoader)
})


test('default runtime forwards trusted renderer modules to Sekai64', () => {
  const factory = new DefaultRuntimeFactory()
  const animationModule = { id: 'sekai64.animation', setup() {} }
  const runtime = factory.create({
    canvas: new FakeCanvas(),
    renderer: { modules: [animationModule] },
    exploration: {},
    webSurface: false,
    plugins: [],
    onWarning() {},
  })
  assert.equal(runtime.renderer.options.modules[0], animationModule)
})


test('default runtime forwards trusted fixed-step systems and scheduler options to Anyo', () => {
  const factory = new DefaultRuntimeFactory()
  const system = { name: 'host:physics', fixedUpdate() {} }
  const runtime = factory.create({
    canvas: new FakeCanvas(),
    renderer: {},
    exploration: {},
    webSurface: false,
    plugins: [],
    systems: [system],
    systemOptions: { fixedDeltaSeconds: 1 / 120, maxSubSteps: 8 },
    onWarning() {},
  })
  assert.equal(runtime.world.systems[0], system)
  assert.equal(runtime.world.systemScheduler.fixedDeltaSeconds, 1 / 120)
  assert.equal(runtime.world.systemScheduler.maxSubSteps, 8)
})

test('default runtime forwards Sekai64 S1-S7 visual options without transforming them', () => {
  const factory = new DefaultRuntimeFactory()
  const colorManagement = { toneMapping: 'aces', exposure: 1.1, outputColorSpace: 'srgb' }
  const environmentLighting = { enabled: true, skyColor: [0.2, 0.25, 0.35], groundColor: [0.02, 0.025, 0.03], intensity: 0.4, specularIntensity: 0.3 }
  const shadows = { enabled: true, mapSize: 2048, bias: 0.0008, normalBias: 0.015, softness: 1, cameraPadding: 2 }
  const imageQuality = { dithering: true, maxAnisotropy: 8 }
  const entityGeometry = { beveledBoxes: true, bevelRadius: 0.035, bevelSegments: 1 }
  const runtime = factory.create({
    canvas: new FakeCanvas(),
    renderer: { colorManagement, environmentLighting, shadows, imageQuality, entityGeometry },
    exploration: {},
    webSurface: false,
    plugins: [],
    onWarning() {},
  })
  assert.equal(runtime.renderer.options.colorManagement, colorManagement)
  assert.equal(runtime.renderer.options.environmentLighting, environmentLighting)
  assert.equal(runtime.renderer.options.shadows, shadows)
  assert.equal(runtime.renderer.options.imageQuality, imageQuality)
  assert.equal(runtime.renderer.options.entityGeometry, entityGeometry)
})
