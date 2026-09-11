import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  deferred,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve))
}

test('default UI exposes loading phases, accessible progress, and deterministic readiness', async () => {
  const idle = deferred()
  const world = new FakeWorld({
    progress: { queued: 2, loading: 1, loaded: 1, failed: 0, total: 4, ratio: 0.25 },
    whenIdle: () => idle.promise,
  })
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  const phases = []
  player.on('phasechange', event => phases.push(event.phase))

  const loading = player.load()
  await nextTurn()

  assert.equal(player.phase, 'loading-assets')
  const root = findByAttribute(container, 'data-anyo-player-ui')
  const loadingPanel = findByClass(container, 'anyo-player__panel--loading')
  const progress = findByClass(container, 'anyo-player__progress')
  const progressFill = findByClass(container, 'anyo-player__progress-fill')
  const details = findByClass(container, 'anyo-player__progress-details')

  assert(root)
  assert.equal(root.hidden, false)
  assert.equal(loadingPanel.getAttribute('role'), 'status')
  assert.equal(loadingPanel.getAttribute('aria-live'), 'polite')

  world.progress = { queued: 1, loading: 1, loaded: 2, failed: 0, total: 4, ratio: 0.5 }
  world.emit('assets:progress', world.progress)
  assert.equal(progress.getAttribute('role'), 'progressbar')
  assert.equal(progress.getAttribute('aria-valuenow'), '50')
  assert.equal(progressFill.style.width, '50%')
  assert.match(details.textContent, /2 of 4 settled/)

  world.progress = { queued: 0, loading: 0, loaded: 4, failed: 0, total: 4, ratio: 1 }
  idle.resolve()
  await loading

  assert.equal(player.phase, 'ready')
  assert.equal(player.readyStatus, 'ready')
  assert.equal(root.hidden, false)
  assert.equal(findByClass(container, 'anyo-player__panel--enter').hidden, false)
  assert.deepEqual(phases, [
    'resolving-source',
    'creating-runtime',
    'loading-world',
    'waiting-ready',
    'loading-assets',
    'ready',
  ])
  await player.disposeAsync()
})

test('asset failures complete as ready-with-warnings and remain visible as a non-fatal diagnostic', async () => {
  const world = new FakeWorld({
    progress: { queued: 0, loading: 0, loaded: 2, failed: 1, total: 3, ratio: 1 },
  })
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })

  let ready
  player.on('ready', event => { ready = event })
  await player.load()

  const diagnostic = findByClass(container, 'anyo-player__diagnostic')
  assert.equal(player.state, 'ready')
  assert.equal(player.phase, 'ready-with-warnings')
  assert.equal(player.readyStatus, 'ready-with-warnings')
  assert.equal(ready.status, 'ready-with-warnings')
  assert.equal(diagnostic.hidden, false)
  assert.equal(diagnostic.getAttribute('data-severity'), 'warning')
  assert.match(diagnostic.children[0].textContent, /1 asset\(s\) failed/)
  await player.disposeAsync()
})

test('fatal load errors render an accessible retry action that creates a clean runtime', async () => {
  const failed = new FakeWorld({ load: async () => { throw new Error('broken world') } })
  const healthy = new FakeWorld()
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([failed, healthy]),
    sourceResolver: new StaticSourceResolver(),
  })

  await assert.rejects(player.load(), error => error.code === 'PLAYER_WORLD_LOAD_FAILED')
  const errorPanel = findByClass(container, 'anyo-player__panel--error')
  const retry = findByAttribute(container, 'data-anyo-player-retry')
  assert.equal(errorPanel.hidden, false)
  assert.equal(errorPanel.getAttribute('role'), 'alert')
  assert.equal(errorPanel.getAttribute('aria-live'), 'assertive')
  assert.equal(retry.listeners.get('click').size, 1)

  const ready = new Promise(resolve => player.on('ready', resolve))
  retry.click()
  await ready
  assert.equal(player.state, 'ready')
  assert.equal(errorPanel.hidden, true)
  assert.equal(failed.disposeCount, 1)
  await player.disposeAsync()
  assert.equal(retry.listeners.has('click'), false)
})

test('renderer diagnostics show WebGL recovery status and turn WebGPU loss into a retryable fatal error', async () => {
  const lostWorld = new FakeWorld()
  const healthyWorld = new FakeWorld()
  const container = new FakeContainer()
  const factory = new FakeRuntimeFactory([lostWorld, healthyWorld])
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(),
  })
  await player.load()

  const diagnostic = findByClass(container, 'anyo-player__diagnostic')
  lostWorld.emit('renderer:diagnostic', {
    severity: 'error',
    code: 'SEKAI64_WEBGL_CONTEXT_LOST',
    message: 'context lost',
  })
  assert.equal(diagnostic.hidden, false)
  assert.match(diagnostic.children[0].textContent, /Graphics context lost/)

  lostWorld.emit('renderer:diagnostic', {
    severity: 'info',
    code: 'SEKAI64_WEBGL_CONTEXT_RESTORED',
    message: 'context restored',
  })
  assert.match(diagnostic.children[0].textContent, /Graphics context restored/)

  const errorEvent = new Promise(resolve => player.on('error', resolve))
  lostWorld.emit('renderer:diagnostic', {
    severity: 'error',
    code: 'SEKAI64_WEBGPU_DEVICE_LOST',
    message: 'device lost',
  })
  const error = await errorEvent
  assert.equal(error.code, 'PLAYER_RENDERER_LOST')
  assert.equal(player.state, 'error')
  const errorMessage = findByClass(container, 'anyo-player__message')
  const errorPanel = findByClass(container, 'anyo-player__panel--error')
  assert.equal(errorPanel.hidden, false)
  assert.match(errorPanel.children[1].textContent, /graphics device was lost/i)

  await player.retry()
  assert.equal(player.state, 'ready')
  assert.equal(lostWorld.sequence.includes('stop'), true)
  assert.equal(lostWorld.disposeCount, 1)
  assert.equal(player.world, healthyWorld)
  await player.disposeAsync()
})

test('default UI can be disabled or text-customized without changing the player lifecycle', async () => {
  const disabledContainer = new FakeContainer()
  const disabled = new AnyoPlayerCore({
    container: disabledContainer,
    source: { version: '0.6' },
    ui: false,
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })
  assert.equal(findByAttribute(disabledContainer, 'data-anyo-player-ui'), null)
  await disabled.load()
  await disabled.disposeAsync()

  const customContainer = new FakeContainer()
  const wait = deferred()
  const custom = new AnyoPlayerCore({
    container: customContainer,
    source: { version: '0.6' },
    ui: { labels: { loadingTitle: 'Opening Sekai' }, className: 'host-theme' },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld({ whenIdle: () => wait.promise })]),
    sourceResolver: new StaticSourceResolver(),
  })
  const load = custom.load()
  await nextTurn()
  const root = findByAttribute(customContainer, 'data-anyo-player-ui')
  const title = findByClass(customContainer, 'anyo-player__title')
  assert.equal(root.classList.contains('host-theme'), true)
  assert.equal(title.textContent, 'Opening Sekai')
  wait.resolve()
  await load
  await custom.disposeAsync()
})

test('missing sources enter the typed error state and expose retry presentation', async () => {
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container }, {
    runtimeFactory: new FakeRuntimeFactory(),
    sourceResolver: new StaticSourceResolver(),
  })

  await assert.rejects(player.load(), error => error.code === 'PLAYER_INVALID_SOURCE')
  assert.equal(player.state, 'error')
  assert.equal(player.phase, 'error')
  assert.equal(player.error.code, 'PLAYER_INVALID_SOURCE')
  assert.equal(findByClass(container, 'anyo-player__panel--error').hidden, false)
  await player.disposeAsync()
})

test('WebGPU loss during asset loading interrupts the load and disposes the pending runtime', async () => {
  const idle = deferred()
  const world = new FakeWorld({ whenIdle: () => idle.promise })
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })

  const loading = player.load()
  await nextTurn()
  assert.equal(player.phase, 'loading-assets')
  world.emit('renderer:diagnostic', {
    severity: 'error',
    code: 'SEKAI64_WEBGPU_DEVICE_LOST',
    message: 'device lost while loading',
  })

  await assert.rejects(loading, error => error.code === 'PLAYER_RENDERER_LOST')
  assert.equal(player.state, 'error')
  assert.equal(world.disposeCount, 1)
  await player.disposeAsync()
})
