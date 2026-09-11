import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeIntersectionObserver,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  findByAttribute,
} from './helpers.mjs'

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve))
}

class CountingSourceResolver extends StaticSourceResolver {
  count = 0
  async resolve(source, signal) {
    this.count += 1
    return super.resolve(source, signal)
  }
}

test('embedding remains manual by default and activate loads the configured source', async () => {
  const container = new FakeContainer()
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(),
  })

  await nextTurn()
  assert.equal(player.activated, false)
  assert.equal(factory.created.length, 0)

  await player.activate()
  assert.equal(player.activated, true)
  assert.equal(player.state, 'ready')
  assert.equal(factory.created.length, 1)
  await player.disposeAsync()
})

test('visible activation waits for intersection and hides the poster when ready', async () => {
  FakeIntersectionObserver.instances.length = 0
  const container = new FakeContainer()
  container.ownerDocument.defaultView.IntersectionObserver = FakeIntersectionObserver
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    embedding: {
      activation: 'visible',
      poster: { src: '/poster.webp', alt: 'World poster' },
      threshold: 0.25,
    },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })

  const observer = FakeIntersectionObserver.instances.at(-1)
  const poster = findByAttribute(container, 'data-anyo-player-poster')
  assert(observer)
  assert(poster)
  assert.equal(player.intersection, 'unknown')
  assert.equal(player.posterVisible, true)
  await nextTurn()
  assert.equal(player.state, 'idle')

  const ready = new Promise(resolve => player.on('ready', resolve))
  observer.trigger(container, true, 0.5)
  await ready

  assert.equal(player.activated, true)
  assert.equal(player.intersection, 'visible')
  assert.equal(player.posterVisible, false)
  assert.equal(poster.hidden, true)
  await player.disposeAsync()
  assert.equal(observer.disconnected, true)
})

test('source preloading resolves once and is consumed by activation without creating an early runtime', async () => {
  const container = new FakeContainer()
  const resolver = new CountingSourceResolver({ version: '0.9', entities: [] })
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.9', entities: [] },
    embedding: { preload: 'source' },
  }, {
    runtimeFactory: factory,
    sourceResolver: resolver,
  })

  await new Promise(resolve => player.on('preloaded', resolve))
  assert.equal(resolver.count, 1)
  assert.equal(factory.created.length, 0)
  assert.equal(player.preloaded, true)

  await player.activate()
  assert.equal(resolver.count, 1)
  assert.equal(factory.created.length, 1)
  assert.equal(player.preloaded, false)
  await player.disposeAsync()
})

test('runtime preload activates immediately while preserving normal ready state', async () => {
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source: { version: '0.6' },
    embedding: { preload: 'runtime' },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })

  if (player.state !== 'ready') await new Promise(resolve => player.on('ready', resolve))
  assert.equal(player.activated, true)
  assert.equal(player.state, 'ready')
  await player.disposeAsync()
})

test('offscreen pause releases input and visible resume does not force pointer lock', async () => {
  FakeIntersectionObserver.instances.length = 0
  const container = new FakeContainer()
  container.ownerDocument.defaultView.IntersectionObserver = FakeIntersectionObserver
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    embedding: {
      pauseWhenOffscreen: true,
      resumeWhenVisible: true,
    },
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  const observer = FakeIntersectionObserver.instances.at(-1)
  observer.trigger(container, true)
  await player.load()
  player.enter()
  assert.equal(player.state, 'running')
  assert.equal(player.pointerLocked, true)

  const exited = new Promise(resolve => player.on('exited', resolve))
  observer.trigger(container, false)
  assert.deepEqual(await exited, { reason: 'offscreen' })
  assert.equal(player.state, 'paused')
  assert.equal(player.pauseReason, 'offscreen')
  assert.equal(player.pointerLocked, false)

  let resumed
  player.on('resumed', event => { resumed = event })
  observer.trigger(container, true)
  assert.equal(player.state, 'ready')
  assert.equal(player.pointerLocked, false)
  assert.deepEqual(resumed, { reason: 'offscreen', controlsRequested: false })
  await player.disposeAsync()
})

test('entered poster policy keeps the poster through load and removes it after entry', async () => {
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    embedding: {
      poster: { src: '/poster.png', hideWhen: 'entered' },
    },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })

  await player.load()
  assert.equal(player.posterVisible, true)
  player.enter()
  assert.equal(player.posterVisible, false)
  await player.disposeAsync()
  assert.equal(findByAttribute(container, 'data-anyo-player-poster'), null)
})

test('visible activation falls back to immediate activation when IntersectionObserver is unavailable', async () => {
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    embedding: { activation: 'visible' },
  }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })

  if (player.state !== 'ready') await new Promise(resolve => player.on('ready', resolve))
  assert.equal(player.intersection, 'unsupported')
  assert.equal(player.activated, true)
  await player.disposeAsync()
})

test('embedding options reject invalid thresholds and empty poster sources', () => {
  assert.throws(() => new AnyoPlayerCore({
    container: new FakeContainer(),
    embedding: { activation: 'visible', threshold: 2 },
  }), /threshold/)

  assert.throws(() => new AnyoPlayerCore({
    container: new FakeContainer(),
    embedding: { poster: { src: '   ' } },
  }), /poster\.src/)
})
