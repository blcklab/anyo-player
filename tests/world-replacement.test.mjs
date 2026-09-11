import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { AnyoPlayerError } from '../dist/errors.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  deferred,
} from './helpers.mjs'

class PassthroughSourceResolver {
  async resolve(source, signal) {
    if (signal.aborted) throw signal.reason
    if (source && typeof source === 'object' && 'document' in source) {
      return { document: structuredClone(source.document) }
    }
    return { document: structuredClone(source) }
  }
}

function createPlayer(world, options = {}) {
  const factory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source: { version: '0.6', metadata: { name: 'first' } },
    ...options,
  }, {
    runtimeFactory: factory,
    sourceResolver: new PassthroughSourceResolver(),
  })
  return { player, factory }
}

test('replaceWorld reuses the active Anyo runtime and reaches a deterministic ready state', async () => {
  const world = new FakeWorld()
  const { player, factory } = createPlayer(world)
  const states = []
  const replaced = []
  player.on('statechange', event => states.push(event.state))
  player.on('worldreplaced', event => replaced.push(event))
  player.registerAction('open-product', () => {})

  await player.load()
  const originalWorld = player.world
  await player.replaceWorld({ version: '0.6', metadata: { name: 'second' } })

  assert.equal(factory.created.length, 1)
  assert.equal(player.world, originalWorld)
  assert.equal(player.world, world)
  assert.equal(world.loadedDocument.metadata.name, 'second')
  assert.equal(world.disposeCount, 0)
  assert.equal(world.actions.has('open-product'), true)
  assert.equal(player.state, 'ready')
  assert.equal(player.phase, 'ready')
  assert.deepEqual(states.slice(-2), ['replacing', 'ready'])
  assert.equal(replaced.length, 1)
  assert.equal(replaced[0].world, world)
  await player.disposeAsync()
})

test('a failed replacement restores the previous usable world without entering fatal error', async () => {
  let committedDocument = null
  let world
  world = new FakeWorld({
    load: async document => {
      if (document.metadata?.fail) {
        world.loadedDocument = structuredClone(committedDocument)
        world.running = false
        throw new Error('replacement mount failed')
      }
      committedDocument = structuredClone(document)
    },
  })
  const { player } = createPlayer(world)
  const replacementErrors = []
  const fatalErrors = []
  player.on('worldreplaceerror', error => replacementErrors.push(error))
  player.on('error', error => fatalErrors.push(error))

  await player.load()
  await assert.rejects(
    player.replaceWorld({ version: '0.6', metadata: { fail: true } }),
    error => {
      assert(error instanceof AnyoPlayerError)
      assert.equal(error.code, 'PLAYER_WORLD_REPLACE_FAILED')
      return true
    },
  )

  assert.equal(player.state, 'ready')
  assert.equal(player.error, null)
  assert.equal(world.loadedDocument.metadata.name, 'first')
  assert.equal(world.running, true)
  assert.equal(world.disposeCount, 0)
  assert.equal(replacementErrors.length, 1)
  assert.equal(fatalErrors.length, 0)
  await player.disposeAsync()
})

test('replacement preserves a user-paused lifecycle without restarting the world', async () => {
  const world = new FakeWorld()
  const { player } = createPlayer(world)

  await player.load()
  player.pause()
  assert.equal(player.state, 'paused')

  await player.replaceWorld({ version: '0.6', metadata: { name: 'paused-second' } })

  assert.equal(player.state, 'paused')
  assert.equal(player.pauseReason, 'user')
  assert.equal(world.running, false)
  assert.equal(world.loadedDocument.metadata.name, 'paused-second')
  await player.disposeAsync()
})

test('a newer replacement aborts an unresolved replacement source before world mutation begins', async () => {
  const firstStarted = deferred()
  const resolver = {
    async resolve(source, signal) {
      if (source === 'slow') {
        firstStarted.resolve()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      if (typeof source === 'string') {
        return { document: { version: '0.6', metadata: { name: source } } }
      }
      return { document: structuredClone(source) }
    },
  }
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source: { version: '0.6', metadata: { name: 'first' } },
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: resolver,
  })
  await player.load()

  const first = player.replaceWorld('slow')
  await firstStarted.promise
  const second = player.replaceWorld('latest')

  await assert.rejects(first, error => error.code === 'PLAYER_OPERATION_SUPERSEDED')
  await second
  assert.equal(player.state, 'ready')
  assert.equal(world.loadedDocument.metadata.name, 'latest')
  assert.equal(world.sequence.filter(step => step === 'load').length, 2)
  await player.disposeAsync()
})

test('replacement exits an active XR session before mutating the world', async () => {
  const world = new FakeWorld({ xrSupported: true })
  const { player } = createPlayer(world, {
    exploration: {
      desktop: true,
      vr: true,
    },
  })

  await player.load()
  await player.enterVR()
  assert.equal(player.state, 'vr-active')

  await player.replaceWorld({ version: '0.6', metadata: { name: 'after-vr' } })

  assert.equal(player.state, 'ready')
  assert.equal(world.loadedDocument.metadata.name, 'after-vr')
  assert.equal(world.sequence.indexOf('xr-exit') < world.sequence.lastIndexOf('load'), true)
  await player.disposeAsync()
})

test('load remains initial-only and directs loaded players to replaceWorld', async () => {
  const { player } = createPlayer(new FakeWorld())
  await player.load()
  assert.throws(
    () => player.load({ version: '0.6' }),
    error => error.code === 'PLAYER_INVALID_STATE' && error.message.includes('replaceWorld'),
  )
  await player.disposeAsync()
})

test('progress and interaction events remain connected after replacement generations change', async () => {
  const world = new FakeWorld()
  const { player } = createPlayer(world)
  const interactions = []
  player.on('interaction', event => interactions.push(event))
  await player.load()
  await player.replaceWorld({ version: '0.6', metadata: { name: 'second' } })

  world.progress = { queued: 0, loading: 0, loaded: 2, failed: 0, total: 2, ratio: 1 }
  world.emit('assets:progress', world.progress)
  world.emit('entity:select', {
    entityId: 'replacement-entity',
    primitiveId: 'replacement-primitive',
    source: 'test',
  })

  assert.equal(player.progress.loaded, 2)
  assert.equal(interactions.length, 1)
  assert.equal(interactions[0].entityId, 'replacement-entity')
  await player.disposeAsync()
})
