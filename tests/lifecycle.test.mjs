import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { AnyoPlayerError } from '../dist/errors.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  deferred,
} from './helpers.mjs'

test('load installs actions before world loading and resolves only after renderer idle', async () => {
  const idle = deferred()
  const world = new FakeWorld({ whenIdle: () => idle.promise })
  const factory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { version: '0.6' } }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(),
  })

  const states = []
  player.on('statechange', change => states.push(change.state))
  player.registerAction('open-product', () => {})
  const loading = player.load()

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(player.state, 'loading')
  assert.equal(world.sequence.indexOf('action:open-product') < world.sequence.indexOf('load'), true)
  assert.equal(world.sequence.includes('start'), true)
  assert.equal(world.sequence.includes('idle'), true)

  idle.resolve()
  await loading
  assert.equal(player.state, 'ready')
  assert.deepEqual(states, ['loading', 'ready'])
  assert.equal(player.world, world)
  assert.equal(world.exploration.inputEnabled, false)
  await player.disposeAsync()
})

test('a newer load supersedes and aborts the older source operation', async () => {
  const firstStarted = deferred()
  const resolver = {
    async resolve(source, signal) {
      if (source === 'first') {
        firstStarted.resolve()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      return { document: { version: '0.6', metadata: { source } } }
    },
  }
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({ container: new FakeContainer() }, { runtimeFactory: factory, sourceResolver: resolver })

  const first = player.load('first')
  await firstStarted.promise
  const second = player.load('second')

  await assert.rejects(first, error => {
    assert(error instanceof AnyoPlayerError)
    assert.equal(error.code, 'PLAYER_OPERATION_SUPERSEDED')
    return true
  })
  await second
  assert.equal(player.state, 'ready')
  assert.equal(factory.created.length, 1)
  assert.equal(factory.created[0].world.loadedDocument.metadata.source, 'second')
  await player.disposeAsync()
})

test('retry creates a clean runtime after a failed load', async () => {
  const failedWorld = new FakeWorld({ load: async () => { throw new Error('mount failed') } })
  const healthyWorld = new FakeWorld()
  const factory = new FakeRuntimeFactory([failedWorld, healthyWorld])
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { version: '0.6' } }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(),
  })

  await assert.rejects(player.load(), error => error.code === 'PLAYER_WORLD_LOAD_FAILED')
  assert.equal(player.state, 'error')
  assert.equal(failedWorld.disposeCount, 1)

  await player.retry()
  assert.equal(player.state, 'ready')
  assert.equal(player.world, healthyWorld)
  assert.equal(factory.created.length, 2)
  await player.disposeAsync()
})

test('disposeAsync is idempotent and removes the owned canvas', async () => {
  const container = new FakeContainer()
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  await player.load()
  assert.equal(container.children.includes(player.canvas), true)
  assert.equal(container.children.length >= 2, true)

  const first = player.disposeAsync()
  const second = player.disposeAsync()
  assert.equal(first, second)
  await first

  assert.equal(player.state, 'disposed')
  assert.equal(world.disposeCount, 1)
  assert.equal(container.children.length, 0)
  await player.disposeAsync()
})

test('registerAction after readiness binds to the active Anyo world', async () => {
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  await player.load()
  const unregister = player.registerAction('late-action', () => {})
  assert.equal(world.actions.has('late-action'), true)
  unregister()
  assert.equal(world.actions.has('late-action'), false)
  await player.disposeAsync()
})

test('caller-provided canvas attributes and parent are restored on disposal', async () => {
  const originalParent = new FakeContainer()
  const playerContainer = new FakeContainer()
  const canvas = originalParent.ownerDocument.createElement('canvas')
  canvas.tabIndex = 7
  canvas.classList.add('existing-canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'Original canvas')
  originalParent.appendChild(canvas)

  const player = new AnyoPlayerCore({
    container: playerContainer,
    canvas,
    source: { version: '0.6' },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })

  assert.equal(canvas.parentNode, playerContainer)
  await player.load()
  await player.disposeAsync()

  assert.equal(canvas.parentNode, originalParent)
  assert.equal(canvas.tabIndex, 7)
  assert.equal(canvas.getAttribute('role'), 'img')
  assert.equal(canvas.getAttribute('aria-label'), 'Original canvas')
  assert.equal(canvas.classList.contains('existing-canvas'), true)
  assert.equal(canvas.classList.contains('anyo-player__canvas'), false)
})
