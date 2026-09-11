import test from 'node:test'
import assert from 'node:assert/strict'
import { FrameworkAdapterController } from '../dist/internal/FrameworkAdapterController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function fakePlayer(options = {}) {
  const listeners = new Map()
  const replacements = []
  const disposal = options.disposal ?? { promise: Promise.resolve(), resolve() {} }
  const player = {
    paused: false,
    replacements,
    on(event, listener) {
      let bucket = listeners.get(event)
      if (!bucket) listeners.set(event, bucket = new Set())
      bucket.add(listener)
      return () => bucket.delete(listener)
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload)
    },
    async replaceWorld(source) {
      replacements.push(source)
      await options.replaceWorld?.(source)
    },
    async load() {},
    async activate() {},
    disposeAsync() { return disposal.promise },
  }
  return player
}

const host = { nodeType: 1 }

test('framework controller mounts once and forwards curated events', async () => {
  const changes = []
  const ready = []
  const player = fakePlayer()
  let creations = 0
  const controller = new FrameworkAdapterController({
    playerchange: value => changes.push(value),
    ready: event => ready.push(event),
  }, options => {
    creations += 1
    assert.equal(options.container, host)
    assert.equal(options.source, '/world.json')
    return player
  })

  assert.equal(await controller.mount(host, '/world.json', { ariaLabel: 'World' }), player)
  assert.equal(await controller.mount(host, '/other.json'), player)
  assert.equal(creations, 1)
  player.emit('ready', { status: 'ready' })
  assert.deepEqual(ready, [{ status: 'ready' }])
  assert.deepEqual(changes, [player])
})

test('framework controller applies only the newest queued source', async () => {
  const player = fakePlayer()
  const controller = new FrameworkAdapterController({}, () => player)
  await controller.mount(host, null)

  const first = controller.setSource('/first.json')
  const second = controller.setSource('/second.json')
  await Promise.all([first, second])
  assert.deepEqual(player.replacements, ['/second.json'])
})

test('framework controller awaits disposal before a new mount generation', async () => {
  const gate = deferred()
  const first = fakePlayer({ disposal: gate })
  const second = fakePlayer()
  const created = []
  const controller = new FrameworkAdapterController({}, () => {
    const player = created.length === 0 ? first : second
    created.push(player)
    return player
  })

  await controller.mount(host, null)
  const disposal = controller.disposeAsync()
  const remount = controller.mount(host, null)
  await Promise.resolve()
  assert.equal(created.length, 1)
  gate.resolve()
  await disposal
  assert.equal(await remount, second)
  assert.equal(created.length, 2)
})

test('framework controller isolates stale replacement failures', async () => {
  const gate = deferred()
  const errors = []
  const player = fakePlayer({
    replaceWorld: source => source === '/first.json' ? gate.promise : Promise.resolve(),
  })
  const controller = new FrameworkAdapterController({ error: error => errors.push(error) }, () => player)
  await controller.mount(host, null)

  const first = controller.setSource('/first.json')
  while (player.replacements.length === 0) await Promise.resolve()
  const second = controller.setSource('/second.json')
  gate.reject(new Error('stale failed'))
  await first.catch(() => undefined)
  await second
  assert.equal(errors.length, 0)
  assert.deepEqual(player.replacements, ['/first.json', '/second.json'])
})

test('framework controller reports disposal failure without blocking remount', async () => {
  const errors = []
  const first = fakePlayer({ disposal: { promise: Promise.reject(new Error('dispose failed')) } })
  const second = fakePlayer()
  let count = 0
  const controller = new FrameworkAdapterController({ error: error => errors.push(error) }, () => count++ === 0 ? first : second)
  await controller.mount(host, null)
  await controller.disposeAsync()
  assert.equal(errors.at(-1).code, 'PLAYER_DISPOSED')
  assert.equal(await controller.mount(host, null), second)
})
