import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  deferred,
} from './helpers.mjs'

class NamedSourceResolver {
  constructor(delays = {}) {
    this.delays = delays
    this.calls = []
  }

  async resolve(source, signal) {
    this.calls.push(source)
    if (source && typeof source === 'object' && 'document' in source) {
      return { document: structuredClone(source.document) }
    }
    if (this.delays[source]) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.delays[source])
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason)
        }, { once: true })
      })
    }
    if (signal.aborted) throw signal.reason
    return { document: { version: '0.9', metadata: { name: String(source) } } }
  }
}

function createNavigationPlayer(options = {}, resolver = new NamedSourceResolver()) {
  const world = new FakeWorld()
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    navigation: {
      worlds: {
        lobby: { source: 'lobby.json', label: 'Lobby' },
        shop: 'shop.json',
        gallery: { source: 'gallery.json', metadata: { category: 'art' } },
      },
      initialWorld: 'lobby',
      transition: { minimumDuration: 0 },
    },
    ...options,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: resolver,
  })
  return { player, world, container, resolver }
}

test('navigation registry supplies the initial source and exposes immutable navigation state', async () => {
  const { player, world } = createNavigationPlayer()
  assert.deepEqual(player.worldIds, ['lobby', 'shop', 'gallery'])
  assert.equal(player.currentWorldId, 'lobby')
  assert.equal(player.navigation.state, 'idle')

  await player.activate()
  assert.equal(world.loadedDocument.metadata.name, 'lobby.json')
  assert.equal(player.currentWorldId, 'lobby')
  await player.disposeAsync()
})

test('navigateTo resolves before commit, runs hooks, and emits ordered navigation events', async () => {
  const order = []
  const { player, world, container } = createNavigationPlayer({
    navigation: {
      worlds: { lobby: 'lobby.json', shop: 'shop.json' },
      initialWorld: 'lobby',
      transition: {
        minimumDuration: 0,
        beforeSwitch: context => order.push(`before:${context.fromWorldId}->${context.toWorldId}`),
        afterSwitch: context => order.push(`after:${context.toWorldId}:${context.world === world}`),
      },
    },
  })
  const events = []
  player.on('worldnavigationstart', event => events.push(`start:${event.toWorldId}`))
  player.on('worldnavigationchange', event => events.push(`state:${event.navigation.state}`))
  player.on('worldnavigationcomplete', event => events.push(`complete:${event.toWorldId}`))

  await player.activate()
  await player.navigateTo('shop')

  assert.equal(player.currentWorldId, 'shop')
  assert.equal(world.loadedDocument.metadata.name, 'shop.json')
  assert.deepEqual(order, ['before:lobby->shop', 'after:shop:true'])
  assert.equal(events.includes('state:preparing'), true)
  assert.equal(events.includes('state:switching'), true)
  assert.equal(events.at(-1), 'complete:shop')
  assert.equal(container.classList.contains('anyo-player--world-transition'), false)
  assert.equal(container.getAttribute('data-anyo-player-world-transition'), null)
  await player.disposeAsync()
})

test('preloadWorld caches resolved documents until explicitly cleared', async () => {
  const { player, resolver } = createNavigationPlayer()
  const preloaded = []
  player.on('worldpreloaded', event => preloaded.push(event.worldId))

  const first = await player.preloadWorld('shop')
  first.metadata.name = 'mutated'
  const second = await player.preloadWorld('shop')
  assert.equal(second.metadata.name, 'shop.json')
  assert.deepEqual(preloaded, ['shop'])
  assert.equal(resolver.calls.filter(source => source === 'shop.json').length, 1)

  player.clearWorldPreload('shop')
  await player.preloadWorld('shop')
  assert.equal(resolver.calls.filter(source => source === 'shop.json').length, 2)
  await player.disposeAsync()
})

test('cancelNavigation aborts asynchronous preparation without mutating the active world', async () => {
  const gate = deferred()
  const { player, world, container } = createNavigationPlayer({
    navigation: {
      worlds: { lobby: 'lobby.json', shop: 'shop.json' },
      initialWorld: 'lobby',
      transition: {
        minimumDuration: 0,
        beforeSwitch: () => gate.promise,
      },
    },
  })
  await player.activate()
  const navigation = player.navigateTo('shop')
  assert.equal(player.navigation.state, 'preparing')
  assert.equal(player.cancelNavigation(), true)
  gate.resolve()

  await assert.rejects(navigation, error => error.code === 'PLAYER_NAVIGATION_CANCELED')
  assert.equal(player.currentWorldId, 'lobby')
  assert.equal(world.loadedDocument.metadata.name, 'lobby.json')
  assert.equal(player.navigation.state, 'canceled')
  assert.equal(container.classList.contains('anyo-player--world-transition'), false)
  await player.disposeAsync()
})

test('a newer navigation supersedes an older source resolution before commit', async () => {
  const resolver = new NamedSourceResolver({ 'shop.json': 100 })
  const { player, world } = createNavigationPlayer({}, resolver)
  await player.activate()

  const first = player.navigateTo('shop')
  await new Promise(resolve => setTimeout(resolve, 5))
  const second = player.navigateTo('gallery')

  await assert.rejects(first, error => error.code === 'PLAYER_NAVIGATION_CANCELED')
  await second
  assert.equal(player.currentWorldId, 'gallery')
  assert.equal(world.loadedDocument.metadata.name, 'gallery.json')
  await player.disposeAsync()
})

test('same-world navigation is a no-op unless force is requested', async () => {
  const { player, world, resolver } = createNavigationPlayer()
  await player.activate()
  const initialLoads = world.sequence.filter(step => step === 'load').length

  await player.navigateTo('lobby')
  assert.equal(world.sequence.filter(step => step === 'load').length, initialLoads)

  await player.navigateTo('lobby', { force: true, transition: false })
  assert.equal(world.sequence.filter(step => step === 'load').length, initialLoads + 1)
  assert.equal(resolver.calls.filter(source => source === 'lobby.json').length, 2)
  await player.disposeAsync()
})

test('failed navigation preserves the previous world identity and reports a typed failure', async () => {
  const resolver = {
    async resolve(source, signal) {
      if (signal.aborted) throw signal.reason
      if (source && typeof source === 'object' && 'document' in source) return { document: structuredClone(source.document) }
      if (source === 'shop.json') throw new Error('offline')
      return { document: { version: '0.9', metadata: { name: source } } }
    },
  }
  const { player, world } = createNavigationPlayer({}, resolver)
  await player.activate()
  const errors = []
  player.on('worldnavigationerror', event => errors.push(event.error.code))

  await assert.rejects(player.navigateTo('shop'), error => error.code === 'PLAYER_NAVIGATION_FAILED')
  assert.equal(player.currentWorldId, 'lobby')
  assert.equal(world.loadedDocument.metadata.name, 'lobby.json')
  assert.equal(player.navigation.state, 'failed')
  assert.deepEqual(errors, ['PLAYER_NAVIGATION_FAILED'])
  await player.disposeAsync()
})

test('navigation validates configuration and unknown world identifiers', async () => {
  assert.throws(() => new AnyoPlayerCore({
    container: new FakeContainer(),
    navigation: { worlds: {}, initialWorld: 'missing' },
  }), /at least one world/)

  const disabled = new AnyoPlayerCore({ container: new FakeContainer() })
  await assert.rejects(disabled.navigateTo('shop'), error => error.code === 'PLAYER_NAVIGATION_DISABLED')
  await disabled.disposeAsync()

  const { player } = createNavigationPlayer()
  await assert.rejects(player.navigateTo('missing'), error => error.code === 'PLAYER_NAVIGATION_UNKNOWN_WORLD')
  await player.disposeAsync()
})

test('dynamic world registration enables portal-style navigation without constructor registry', async () => {
  const resolver = new NamedSourceResolver()
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { document: { version:'0.9', metadata:{name:'outside'} } } }, {
    runtimeFactory: new FakeRuntimeFactory([world]), sourceResolver: resolver,
  })
  await player.load()
  const unregister = player.registerWorld('interior.json', 'interior.json')
  assert.deepEqual(player.worldIds, ['interior.json'])
  await player.preloadWorld('interior.json')
  await player.navigateTo('interior.json', { transition:false })
  assert.equal(player.currentWorldId, 'interior.json')
  unregister()
  assert.deepEqual(player.worldIds, ['interior.json'])
  await player.disposeAsync()
})

test('cancelWorldPreload aborts an in-flight dynamic world preload', async () => {
  const resolver = new NamedSourceResolver({ 'slow.json': 100 })
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { document: { version:'0.9' } } }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]), sourceResolver: resolver,
  })
  player.registerWorld('slow', 'slow.json')
  const preload = player.preloadWorld('slow')
  await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(player.cancelWorldPreload('slow'), true)
  await assert.rejects(preload, error => error.code === 'PLAYER_NAVIGATION_CANCELED')
  await player.disposeAsync()
})
