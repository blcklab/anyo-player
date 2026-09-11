import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
} from './helpers.mjs'

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve))
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition.')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function createPlayer(worlds, options = {}, dependencies = {}) {
  const container = new FakeContainer()
  const factory = new FakeRuntimeFactory(worlds)
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6', metadata: { name: 'recovery-world' } },
    ...options,
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver({ version: '0.6', metadata: { name: 'recovery-world' } }),
    ...dependencies,
  })
  return { player, factory, container }
}

const DEVICE_LOST = {
  severity: 'error',
  code: 'SEKAI64_WEBGPU_DEVICE_LOST',
  message: 'GPU device lost',
  details: { reason: 'destroyed' },
}

test('manual renderer recovery rebuilds the runtime and restores the captured session', async () => {
  const lost = new FakeWorld({
    cameraPosition: [3, 1.7, 7],
    cameraRotation: [0.8, -0.2],
    runtimeData: { progress: { step: 4 } },
  })
  const healthy = new FakeWorld({ runtimeData: { progress: { step: 0 } } })
  const { player, factory } = createPlayer([lost, healthy], {
    session: { worldKey: 'recovery-world', dataPaths: ['progress.step'] },
    rendererRecovery: { automatic: false, restoreSession: true },
  })
  const changes = []
  player.on('rendererrecoverychange', event => changes.push(event.recovery.state))
  await player.load()
  const registry = player.webSurfaceRegistry
  assert.ok(registry)
  assert.equal(factory.created[0].options.webSurface.registry, registry)

  const failed = new Promise(resolve => player.on('error', resolve))
  lost.emit('renderer:diagnostic', DEVICE_LOST)
  const error = await failed
  assert.equal(error.code, 'PLAYER_RENDERER_LOST')
  assert.equal(player.state, 'error')
  assert.equal(player.rendererRecovery.diagnosticCode, DEVICE_LOST.code)

  await player.recoverRenderer()
  assert.equal(player.state, 'ready')
  assert.equal(player.world, healthy)
  assert.deepEqual(healthy.cameraPosition, [3, 1.7, 7])
  assert.deepEqual(healthy.cameraRotation, [0.8, -0.2])
  assert.equal(healthy.runtimeData.progress.step, 4)
  assert.equal(player.rendererRecovery.state, 'recovered')
  assert.equal(factory.created[1].options.webSurface.registry, registry)
  assert.deepEqual(changes, ['idle', 'recovering', 'recovered'])
  await player.disposeAsync()
})

test('automatic renderer recovery schedules one bounded rebuild and publishes lifecycle telemetry', async () => {
  const lost = new FakeWorld()
  const healthy = new FakeWorld()
  const sink = []
  const { player } = createPlayer([lost, healthy], {
    rendererRecovery: { automatic: true, maxAttempts: 1, delayMs: 0, restoreSession: false },
    analytics: { sink: event => sink.push(event), bufferSize: 50 },
  })
  await player.load()

  lost.emit('renderer:diagnostic', DEVICE_LOST)
  assert.equal(player.rendererRecovery.state, 'scheduled')
  await waitFor(() => player.rendererRecovery.state === 'recovered')

  assert.equal(player.state, 'ready')
  assert.equal(player.world, healthy)
  assert.equal(player.rendererRecovery.attempt, 1)
  assert(sink.some(event => event.name === 'renderer.diagnostic'))
  assert(sink.some(event => event.name === 'renderer.recovery-scheduled'))
  assert(sink.some(event => event.name === 'renderer.recovery-recovering'))
  assert(sink.some(event => event.name === 'renderer.recovery-recovered'))
  await player.disposeAsync()
})

test('automatic renderer recovery stops after maxAttempts and exposes a typed failure', async () => {
  const lost = new FakeWorld()
  const failedOnce = new FakeWorld({ load: async () => { throw new Error('first rebuild failed') } })
  const failedTwice = new FakeWorld({ load: async () => { throw new Error('second rebuild failed') } })
  const { player } = createPlayer([lost, failedOnce, failedTwice], {
    rendererRecovery: { automatic: true, maxAttempts: 2, delayMs: 0, backoff: 1, restoreSession: false },
  })
  await player.load()
  lost.emit('renderer:diagnostic', DEVICE_LOST)
  await waitFor(() => player.rendererRecovery.state === 'failed')

  assert.equal(player.state, 'error')
  assert.equal(player.rendererRecovery.attempt, 2)
  assert.equal(player.rendererRecovery.error?.code, 'PLAYER_RENDERER_RECOVERY_FAILED')
  assert.equal(player.error?.code, 'PLAYER_RENDERER_RECOVERY_FAILED')
  assert.equal(player.diagnostics.at(-1)?.source, 'player')
  assert.equal(failedOnce.disposeCount, 1)
  assert.equal(failedTwice.disposeCount, 1)
  await player.disposeAsync()
})

test('scheduled automatic recovery can be canceled before rebuilding the runtime', async () => {
  const lost = new FakeWorld()
  const unused = new FakeWorld()
  const { player, factory } = createPlayer([lost, unused], {
    rendererRecovery: { automatic: true, maxAttempts: 1, delayMs: 500, restoreSession: false },
  })
  await player.load()
  lost.emit('renderer:diagnostic', DEVICE_LOST)
  assert.equal(player.rendererRecovery.state, 'scheduled')
  player.cancelRendererRecovery()
  assert.equal(player.rendererRecovery.state, 'canceled')
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(factory.created.length, 1)
  assert.equal(player.state, 'error')
  await player.disposeAsync()
})

test('diagnostic history classifies renderer recovery and respects clear/history limits', async () => {
  const world = new FakeWorld()
  const { player } = createPlayer([world], {
    diagnostics: { historyLimit: 2 },
    rendererRecovery: { automatic: false },
  }, { now: () => new Date('2026-07-25T01:00:00.000Z') })
  const recorded = []
  player.on('diagnosticrecorded', event => recorded.push(event.record))
  await player.load()

  world.emit('renderer:diagnostic', { severity: 'warning', code: 'CUSTOM_WARNING', message: 'warning' })
  world.emit('renderer:diagnostic', { severity: 'error', code: 'SEKAI64_WEBGL_CONTEXT_LOST', message: 'lost' })
  world.emit('renderer:diagnostic', { severity: 'info', code: 'SEKAI64_WEBGL_CONTEXT_RESTORED', message: 'restored' })

  assert.equal(recorded.length, 3)
  assert.equal(player.diagnostics.length, 2)
  assert.deepEqual(player.diagnostics.map(record => record.code), [
    'SEKAI64_WEBGL_CONTEXT_LOST',
    'SEKAI64_WEBGL_CONTEXT_RESTORED',
  ])
  assert.equal(player.diagnostics[0].recoverable, true)
  assert.equal(player.diagnostics[0].timestamp, '2026-07-25T01:00:00.000Z')
  player.clearDiagnostics()
  assert.deepEqual(player.diagnostics, [])
  await player.disposeAsync()
})

test('host telemetry is local, bounded, sanitizes details, and supports runtime sinks', async () => {
  const initial = []
  const runtime = []
  const world = new FakeWorld()
  const { player } = createPlayer([world], {
    analytics: { sink: event => initial.push(event), bufferSize: 3 },
  }, { now: () => new Date('2026-07-25T02:00:00.000Z') })
  const unregister = player.registerAnalyticsSink(event => runtime.push(event))
  await player.load()

  const circular = { label: 'custom' }
  circular.self = circular
  const custom = player.trackTelemetry('host.checkout-opened', {
    circular,
    count: 2,
    ignored: undefined,
  })
  assert.equal(custom.name, 'host.checkout-opened')
  assert.equal(custom.category, 'host')
  assert.equal(custom.timestamp, '2026-07-25T02:00:00.000Z')
  assert.equal(custom.details.circular.self, '[circular]')
  assert.equal('ignored' in custom.details, false)
  assert.equal(player.telemetry.length, 3)
  assert.equal(initial.at(-1).name, 'host.checkout-opened')
  assert.equal(runtime.at(-1).name, 'host.checkout-opened')

  unregister()
  player.trackTelemetry('host.after-unregister')
  assert.notEqual(runtime.at(-1).name, 'host.after-unregister')
  player.clearTelemetry()
  assert.deepEqual(player.telemetry, [])
  await player.disposeAsync()
})

test('analytics sink failures are isolated and reported once without recursive tracking', async () => {
  const world = new FakeWorld()
  const warnings = []
  const { player } = createPlayer([world], {
    analytics: { sink: () => { throw new Error('sink offline') } },
    onWarning: message => warnings.push(message),
  })
  const errors = []
  player.on('analyticserror', error => errors.push(error))
  player.trackTelemetry('host.sink-test')
  await nextTurn()

  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'PLAYER_ANALYTICS_SINK_FAILED')
  assert.equal(warnings.length, 1)
  await player.disposeAsync()
})

test('renderer recovery can be disabled explicitly', async () => {
  const lost = new FakeWorld()
  const { player } = createPlayer([lost], { rendererRecovery: false })
  await player.load()
  lost.emit('renderer:diagnostic', DEVICE_LOST)
  await waitFor(() => player.state === 'error')
  await assert.rejects(player.recoverRenderer(), error => error.code === 'PLAYER_RENDERER_RECOVERY_DISABLED')
  assert.equal(player.diagnostics.at(-1).recoverable, false)
  await player.disposeAsync()
})
