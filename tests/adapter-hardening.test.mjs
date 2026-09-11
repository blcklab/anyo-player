import test from 'node:test'
import assert from 'node:assert/strict'
import { FrameworkAdapterController } from '../dist/internal/FrameworkAdapterController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function createPlayer({ disposal = Promise.resolve(), replace } = {}) {
  const listeners = new Map()
  return {
    paused: false,
    replacements: [],
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
      this.replacements.push(source)
      await replace?.(source)
    },
    async load() {},
    async activate() {},
    disposeAsync() { return disposal },
  }
}

const host = { nodeType: 1 }

test('adapter controller collapses one hundred queued source updates to the latest world', async () => {
  const player = createPlayer()
  const controller = new FrameworkAdapterController({}, () => player)
  await controller.mount(host, null)
  const operations = []
  for (let index = 0; index < 100; index += 1) {
    operations.push(controller.setSource(`/world-${index}.json`))
  }
  await Promise.all(operations)
  assert.deepEqual(player.replacements, ['/world-99.json'])
})

test('adapter controller survives fifty complete mount and disposal generations', async () => {
  let creations = 0
  let disposals = 0
  const controller = new FrameworkAdapterController({}, () => {
    creations += 1
    return createPlayer({ disposal: Promise.resolve().then(() => { disposals += 1 }) })
  })
  for (let index = 0; index < 50; index += 1) {
    assert.ok(await controller.mount(host, null))
    await controller.disposeAsync()
  }
  assert.equal(creations, 50)
  assert.equal(disposals, 50)
  assert.equal(controller.player, null)
})

test('adapter event listeners never leak across remount generations', async () => {
  const players = [createPlayer(), createPlayer()]
  const ready = []
  let index = 0
  const controller = new FrameworkAdapterController({ ready: value => ready.push(value) }, () => players[index++])
  await controller.mount(host, null)
  players[0].emit('ready', { generation: 1 })
  await controller.disposeAsync()
  players[0].emit('ready', { generation: 'stale' })
  await controller.mount(host, null)
  players[1].emit('ready', { generation: 2 })
  assert.deepEqual(ready, [{ generation: 1 }, { generation: 2 }])
})

test('updated callbacks are used without reconstructing the Player', async () => {
  const player = createPlayer()
  const calls = []
  const controller = new FrameworkAdapterController({ ready: () => calls.push('first') }, () => player)
  await controller.mount(host, null)
  controller.setCallbacks({ ready: () => calls.push('second') })
  player.emit('ready', {})
  assert.deepEqual(calls, ['second'])
})

test('disposing during an active replacement suppresses stale failure and permits remount', async () => {
  const gate = deferred()
  const errors = []
  const first = createPlayer({ replace: () => gate.promise })
  const second = createPlayer()
  let count = 0
  const controller = new FrameworkAdapterController({ error: error => errors.push(error) }, () => count++ === 0 ? first : second)
  await controller.mount(host, null)
  const replacement = controller.setSource('/slow.json')
  while (first.replacements.length === 0) await Promise.resolve()
  await controller.disposeAsync()
  gate.reject(new Error('stale replacement failed'))
  await replacement.catch(() => undefined)
  assert.deepEqual(errors, [])
  assert.equal(await controller.mount(host, null), second)
})
