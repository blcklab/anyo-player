import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { AnyoPlayerError } from '../dist/errors.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
} from './helpers.mjs'

class MemorySessionStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function createSessionPlayer(world, options = {}, dependencies = {}) {
  const container = options.container ?? new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6', metadata: { name: 'session-world' } },
    ...options,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver({ version: '0.6', metadata: { name: 'session-world' } }),
    ...dependencies,
  })
  return { player, container }
}

function validSnapshot(overrides = {}) {
  return {
    format: '@blcklab/anyo-player/session',
    version: 1,
    createdAt: '2026-07-24T00:00:00.000Z',
    world: { key: 'store', documentVersion: '0.6', room: 'gallery' },
    camera: { position: [4, 1.7, 8], yaw: 1.25, pitch: -0.15 },
    xrRig: { position: [1, 0, 2], yaw: 0.5 },
    data: [{ path: 'cart.count', value: 3 }],
    player: { paused: true, pauseReason: 'user', inputMode: 'desktop' },
    ...overrides,
  }
}

test('captureSession records camera, room, XR rig, pause state, and selected runtime data', async () => {
  const world = new FakeWorld({
    cameraPosition: [2, 1.8, 5],
    cameraRotation: [0.75, -0.1],
    currentRoom: 'gallery',
    rooms: ['gallery'],
    xrRig: { position: [1, 0, 1], yaw: 0.25 },
    runtimeData: { cart: { count: 2 }, secret: 'not-captured' },
  })
  const { player } = createSessionPlayer(world, {
    session: { worldKey: 'store', dataPaths: ['cart.count'] },
  }, { now: () => new Date('2026-07-24T12:34:56.000Z') })

  const capturedEvents = []
  player.on('sessioncaptured', event => capturedEvents.push(event))
  await player.load()
  player.enter()
  player.pause()
  const snapshot = player.captureSession({ metadata: { reason: 'checkpoint' } })

  assert.equal(snapshot.format, '@blcklab/anyo-player/session')
  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.createdAt, '2026-07-24T12:34:56.000Z')
  assert.deepEqual(snapshot.world, { key: 'store', documentVersion: '0.6', room: 'gallery' })
  assert.deepEqual(snapshot.camera, { position: [2, 1.8, 5], yaw: 0.75, pitch: -0.1 })
  assert.deepEqual(snapshot.xrRig, { position: [1, 0, 1], yaw: 0.25 })
  assert.deepEqual(snapshot.data, [{ path: 'cart.count', value: 2 }])
  assert.deepEqual(snapshot.player, { paused: true, pauseReason: 'user', inputMode: 'desktop' })
  assert.deepEqual(snapshot.metadata, { reason: 'checkpoint' })
  assert.equal(capturedEvents.length, 1)
  await player.disposeAsync()
})

test('restoreSession applies selected data, pose, room, XR rig, and paused input state', async () => {
  const world = new FakeWorld({
    rooms: ['gallery'],
    runtimeData: { cart: { count: 0 } },
  })
  const { player } = createSessionPlayer(world, {
    session: { worldKey: 'store' },
  })
  const restoredEvents = []
  player.on('sessionrestored', event => restoredEvents.push(event))
  await player.load()

  const restored = await player.restoreSession(validSnapshot())
  assert.deepEqual(world.cameraPosition, [4, 1.7, 8])
  assert.deepEqual(world.cameraRotation, [1.25, -0.15])
  assert.deepEqual(world.xrRig, { position: [1, 0, 2], yaw: 0.5 })
  assert.equal(world.currentRoom, 'gallery')
  assert.equal(world.runtimeData.cart.count, 3)
  assert.equal(player.state, 'paused')
  assert.equal(player.pauseReason, 'user')
  assert.equal(restoredEvents.length, 1)
  assert.deepEqual(restored, restoredEvents[0].snapshot)

  player.resume()
  assert.equal(player.state, 'running')
  assert.equal(player.inputMode, 'desktop')
  await player.disposeAsync()
})

test('restoring while desktop controls are active exits controls safely and does not auto-enter again', async () => {
  const world = new FakeWorld({ rooms: ['gallery'] })
  const { player } = createSessionPlayer(world, { session: { worldKey: 'store' } })
  const exits = []
  player.on('exited', event => exits.push(event.reason))
  await player.load()
  player.enter()
  assert.equal(player.state, 'running')

  await player.restoreSession(validSnapshot({
    player: { paused: false, pauseReason: null, inputMode: 'desktop' },
  }))

  assert.equal(player.state, 'ready')
  assert.equal(player.entered, false)
  assert.deepEqual(exits, ['session-restore'])
  await player.disposeAsync()
})

test('invalid and unsafe session snapshots fail closed with typed errors', async () => {
  const world = new FakeWorld()
  const { player } = createSessionPlayer(world)
  await player.load()

  await assert.rejects(
    player.restoreSession({ format: '@blcklab/anyo-player/session', version: 99 }),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_INVALID',
  )

  await assert.rejects(
    player.restoreSession(validSnapshot({
      data: [{ path: '__proto__.polluted', value: true }],
    })),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_INVALID',
  )
  assert.equal({}.polluted, undefined)
  await player.disposeAsync()
})

test('strict world keys reject a snapshot from a different world', async () => {
  const world = new FakeWorld({ rooms: ['gallery'] })
  const { player } = createSessionPlayer(world, { session: { worldKey: 'store-a' } })
  await player.load()

  await assert.rejects(
    player.restoreSession(validSnapshot({
      world: { key: 'store-b', documentVersion: '0.6', room: 'gallery' },
    })),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_WORLD_MISMATCH',
  )
  await player.disposeAsync()
})

test('saveSession, loadSession, and clearSession use a portable storage adapter', async () => {
  const storage = new MemorySessionStorage()
  const world = new FakeWorld({
    rooms: ['gallery'],
    currentRoom: 'gallery',
    cameraPosition: [1, 2, 3],
    cameraRotation: [0.4, 0.1],
    runtimeData: { cart: { count: 4 } },
  })
  const { player } = createSessionPlayer(world, {
    session: {
      storage,
      storageKey: 'session-key',
      worldKey: 'store',
      dataPaths: ['cart.count'],
    },
  })
  const events = []
  player.on('sessionsaved', event => events.push(['saved', event.key]))
  player.on('sessionloaded', event => events.push(['loaded', event.key]))
  player.on('sessioncleared', event => events.push(['cleared', event.key]))
  await player.load()

  const saved = await player.saveSession()
  assert.equal(player.sessionStorageAvailable, true)
  assert.equal(player.sessionKey, 'session-key')
  assert.deepEqual(JSON.parse(storage.values.get('session-key')), saved)

  world.cameraPosition = [9, 9, 9]
  world.cameraRotation = [0, 0]
  world.runtimeData.cart.count = 0
  const loaded = await player.loadSession()
  assert.deepEqual(loaded, saved)
  assert.deepEqual(world.cameraPosition, [1, 2, 3])
  assert.equal(world.runtimeData.cart.count, 4)

  await player.clearSession()
  assert.equal(storage.values.has('session-key'), false)
  assert.deepEqual(events, [
    ['saved', 'session-key'],
    ['loaded', 'session-key'],
    ['cleared', 'session-key'],
  ])
  await player.disposeAsync()
})

test('restoreOnLoad restores a configured saved session before load resolves', async () => {
  const storage = new MemorySessionStorage()
  storage.setItem('auto', JSON.stringify(validSnapshot()))
  const world = new FakeWorld({ rooms: ['gallery'], runtimeData: { cart: { count: 0 } } })
  const { player } = createSessionPlayer(world, {
    session: {
      storage,
      storageKey: 'auto',
      worldKey: 'store',
      restoreOnLoad: true,
    },
  })

  await player.load()
  assert.deepEqual(world.cameraPosition, [4, 1.7, 8])
  assert.equal(world.runtimeData.cart.count, 3)
  assert.equal(player.state, 'paused')
  await player.disposeAsync()
})

test('automatic pause persistence is non-blocking and uses the configured snapshot policy', async () => {
  const storage = new MemorySessionStorage()
  const world = new FakeWorld({ runtimeData: { checkpoint: { value: 7 } } })
  const { player } = createSessionPlayer(world, {
    session: {
      storage,
      storageKey: 'pause-save',
      dataPaths: ['checkpoint.value'],
      saveOnPause: true,
    },
  })
  await player.load()
  player.pause()
  await new Promise(resolve => setImmediate(resolve))

  const saved = JSON.parse(storage.values.get('pause-save'))
  assert.equal(saved.player.paused, true)
  assert.deepEqual(saved.data, [{ path: 'checkpoint.value', value: 7 }])
  await player.disposeAsync()
})

test('visibility persistence saves only when configured', async () => {
  const storage = new MemorySessionStorage()
  const container = new FakeContainer()
  const world = new FakeWorld()
  const { player } = createSessionPlayer(world, {
    container,
    session: {
      storage,
      storageKey: 'visibility-save',
      saveOnVisibilityHidden: true,
    },
  })
  await player.load()
  container.ownerDocument.setHidden(true)
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(player.state, 'paused')
  assert.equal(JSON.parse(storage.values.get('visibility-save')).player.pauseReason, 'visibility')
  await player.disposeAsync()
})

test('session support can be explicitly disabled', async () => {
  const world = new FakeWorld()
  const { player } = createSessionPlayer(world, { session: false })
  await player.load()
  assert.equal(player.sessionEnabled, false)
  assert.throws(
    () => player.captureSession(),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_DISABLED',
  )
  await player.disposeAsync()
})

test('a missing session room warns and preserves the current room unless strictRoom is enabled', async () => {
  const warnings = []
  const world = new FakeWorld({ rooms: ['lobby'], currentRoom: 'lobby' })
  const { player } = createSessionPlayer(world, {
    session: { worldKey: 'store' },
    onWarning: message => warnings.push(message),
  })
  await player.load()

  await player.restoreSession(validSnapshot())
  assert.equal(world.currentRoom, 'lobby')
  assert.equal(warnings.some(message => message.includes('does not exist')), true)

  await assert.rejects(
    player.restoreSession(validSnapshot(), { strictRoom: true }),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_WORLD_MISMATCH',
  )
  await player.disposeAsync()
})

test('restoring a session exits active VR before mutating world state', async () => {
  const world = new FakeWorld({ xrSupported: true, rooms: ['gallery'] })
  const { player } = createSessionPlayer(world, {
    session: { worldKey: 'store' },
    exploration: { vr: true },
  })
  await player.load()
  await player.enterVR()
  assert.equal(player.state, 'vr-active')

  await player.restoreSession(validSnapshot({
    player: { paused: false, pauseReason: null, inputMode: null },
  }))

  assert.equal(world.sequence.includes('xr-exit'), true)
  assert.equal(player.state, 'ready')
  assert.deepEqual(world.xrRig, { position: [1, 0, 2], yaw: 0.5 })
  await player.disposeAsync()
})

test('runtime-data restore rolls back earlier selected paths when a later path fails', async () => {
  const world = new FakeWorld({ runtimeData: { first: 1, second: 2 } })
  const originalSetData = world.setData.bind(world)
  world.setData = async (path, value) => {
    if (path === 'second' && value === 20) throw new Error('semantic update rejected')
    await originalSetData(path, value)
  }
  const { player } = createSessionPlayer(world)
  await player.load()
  const snapshot = validSnapshot({
    world: { documentVersion: '0.6', room: null },
    data: [
      { path: 'first', value: 10 },
      { path: 'second', value: 20 },
    ],
    player: { paused: false, pauseReason: null, inputMode: null },
  })

  await assert.rejects(
    player.restoreSession(snapshot, { strictWorldKey: false }),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_RESTORE_FAILED',
  )
  assert.equal(world.runtimeData.first, 1)
  assert.equal(world.runtimeData.second, 2)
  await player.disposeAsync()
})

test('strict world-key validation rejects snapshots that omit the configured identity', async () => {
  const world = new FakeWorld()
  const { player } = createSessionPlayer(world, { session: { worldKey: 'required-world' } })
  await player.load()
  const snapshot = validSnapshot({
    world: { documentVersion: '0.6', room: null },
    player: { paused: false, pauseReason: null, inputMode: null },
  })
  await assert.rejects(
    player.restoreSession(snapshot),
    error => error instanceof AnyoPlayerError && error.code === 'PLAYER_SESSION_WORLD_MISMATCH',
  )
  await player.disposeAsync()
})
