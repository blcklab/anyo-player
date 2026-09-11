import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeDocument,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  fakeEvent,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function createTouchPlayer(options = {}, document = new FakeDocument(), world = new FakeWorld()) {
  const container = new FakeContainer(document)
  const factory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { desktop: false, touch: true },
    ...options,
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(),
  })
  return { player, container, document, world, factory }
}

function pointer(type, properties) {
  return fakeEvent(type, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...properties,
  })
}

test('touch movement enters the player and maps a normalized virtual joystick into Anyo exploration', async () => {
  const { player, container, world } = createTouchPlayer()
  let entered
  player.on('entered', event => { entered = event })
  await player.load()

  const root = findByAttribute(container, 'data-anyo-player-touch')
  const move = findByAttribute(container, 'data-anyo-player-touch-move')
  const thumb = findByClass(container, 'anyo-player__touch-thumb')
  assert(root)
  assert.equal(root.hidden, false)
  assert.equal(player.touchEnabled, true)

  move.dispatchEvent(pointer('pointerdown', { pointerId: 10, clientX: 100, clientY: 100 }))
  move.dispatchEvent(pointer('pointermove', { pointerId: 10, clientX: 140, clientY: 60 }))

  assert.equal(player.state, 'running')
  assert.equal(player.entered, true)
  assert.equal(player.inputMode, 'touch')
  assert.equal(entered.mode, 'touch')
  assert.equal(entered.pointerLockRequested, false)
  assert.equal(world.exploration.inputEnabled, true)
  assert(world.exploration.moveAxes[0] > 0)
  assert(world.exploration.moveAxes[1] > 0)
  assert.match(thumb.style.getPropertyValue('transform'), /translate\(/)

  move.dispatchEvent(pointer('pointerup', { pointerId: 10, clientX: 140, clientY: 60 }))
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  assert.equal(thumb.style.getPropertyValue('transform'), 'translate(0px, 0px)')
  await player.disposeAsync()
})

test('touch look supports independent pointers and a tap uses renderer picking plus Anyo selection', async () => {
  const world = new FakeWorld({
    pickResult: { primitiveId: 'product-primitive', distance: 1.5 },
    selectedEntityId: 'product',
    selectedData: { interactionPrompt: 'View product' },
  })
  const { player, container, factory } = createTouchPlayer({}, new FakeDocument(), world)
  await player.load()
  const move = findByAttribute(container, 'data-anyo-player-touch-move')

  move.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 80, clientY: 220 }))
  move.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 110, clientY: 190 }))
  const movementBeforeLook = [...world.exploration.moveAxes]

  player.canvas.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 300, clientY: 160 }))
  player.canvas.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 325, clientY: 145 }))
  player.canvas.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 325, clientY: 145 }))
  assert.deepEqual(world.exploration.lookDeltas.at(-1), [25, -15])
  assert.deepEqual(world.exploration.moveAxes, movementBeforeLook)
  assert.equal(world.selections.length, 0)

  player.canvas.dispatchEvent(pointer('pointerdown', { pointerId: 3, clientX: 360, clientY: 180 }))
  player.canvas.dispatchEvent(pointer('pointerup', { pointerId: 3, clientX: 360, clientY: 180 }))
  await Promise.resolve()

  const renderer = factory.created[0].renderer
  assert.deepEqual(renderer.pickCalls.at(-1), { clientX: 360, clientY: 180 })
  assert.equal(world.selections.length, 1)
  assert.equal(world.selections[0].primitiveId, 'product-primitive')
  assert.equal(world.selections[0].source, 'touch')
  assert.match(findByClass(container, 'anyo-player__interaction-prompt-message').textContent, /View product/)

  const syntheticClick = fakeEvent('click', { target: player.canvas })
  player.canvas.dispatchEvent(syntheticClick)
  assert.equal(syntheticClick.defaultPrevented, true)
  assert.equal(player.inputMode, 'touch')

  move.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 110, clientY: 190 }))
  await player.disposeAsync()
})

test('touch run is independent from movement and exposes pressed accessibility state', async () => {
  const { player, container, world } = createTouchPlayer()
  await player.load()
  const run = findByAttribute(container, 'data-anyo-player-touch-run')

  run.dispatchEvent(pointer('pointerdown', { pointerId: 7 }))
  assert.equal(player.inputMode, 'touch')
  assert.equal(world.exploration.running, true)
  assert.equal(run.getAttribute('aria-pressed'), 'true')

  run.dispatchEvent(pointer('pointerup', { pointerId: 7 }))
  assert.equal(world.exploration.running, false)
  assert.equal(run.getAttribute('aria-pressed'), 'false')
  await player.disposeAsync()
})


test('touch jump requests one character jump', async () => {
  const { player, container, world } = createTouchPlayer()
  await player.load()
  const jump = findByAttribute(container, 'data-anyo-player-touch-jump')
  jump.dispatchEvent(pointer('pointerdown', { pointerId: 8 }))
  assert.equal(world.exploration.jumpCount, 1)
  await player.disposeAsync()
})

test('touch pause and resume preserve the previous input mode without pointer-lock behavior', async () => {
  const { player, container, world } = createTouchPlayer()
  await player.load()
  player.canvas.dispatchEvent(pointer('pointerdown', { pointerId: 3, clientX: 200, clientY: 120 }))
  player.canvas.dispatchEvent(pointer('pointermove', { pointerId: 3, clientX: 220, clientY: 110 }))
  assert.equal(player.inputMode, 'touch')

  player.pause()
  assert.equal(player.state, 'paused')
  assert.equal(player.inputMode, null)
  assert.equal(world.exploration.inputEnabled, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-touch').hidden, true)

  player.resume()
  assert.equal(player.state, 'running')
  assert.equal(player.inputMode, 'touch')
  assert.equal(player.pointerLocked, false)
  assert.equal(world.exploration.inputEnabled, true)
  assert.equal(findByAttribute(container, 'data-anyo-player-touch').hidden, false)
  await player.disposeAsync()
})

test('interaction prompts use data conventions, host resolvers, and hover leave cleanup', async () => {
  const { player, container, world } = createTouchPlayer({
    interaction: {
      defaultText: 'Use',
      selectionDuration: 0,
      resolvePrompt: context => context.entityId === 'special'
        ? (context.trigger === 'select' ? 'Selected special item' : 'Inspect special item')
        : undefined,
    },
  })
  const changes = []
  const interactions = []
  player.on('interactionpromptchange', event => changes.push(event))
  player.on('interaction', event => interactions.push(event))
  await player.load()

  world.emit('entity:hover', { entityId: 'door', data: { interactionPrompt: 'Open door' } })
  const prompt = findByAttribute(container, 'data-anyo-player-interaction-prompt')
  assert.equal(prompt.hidden, false)
  assert.equal(prompt.children[0].textContent, 'Open door')
  assert.equal(player.interactionPrompt.entityId, 'door')

  world.emit('entity:hover-leave', { entityId: 'other' })
  assert.equal(prompt.hidden, false)
  world.emit('entity:hover-leave', { entityId: 'door' })
  assert.equal(prompt.hidden, true)

  world.emit('entity:hover', { entityId: 'special', data: {} })
  assert.equal(prompt.children[0].textContent, 'Inspect special item')
  world.emit('entity:select', {
    entityId: 'special',
    primitiveId: 'p1',
    source: 'touch',
    data: {},
  })
  assert.equal(interactions.length, 1)
  assert.equal(interactions[0].trigger, 'select')
  assert.equal(interactions[0].source, 'touch')
  assert.equal(prompt.children[0].textContent, 'Inspect special item')
  assert.equal(changes.some(change => change.visible), true)
  await player.disposeAsync()
})

test('interaction presentation can be disabled while selection events remain available', async () => {
  const { player, container, world } = createTouchPlayer({ interaction: false })
  const interactions = []
  player.on('interaction', event => interactions.push(event))
  await player.load()

  world.emit('entity:hover', { entityId: 'door', data: { interactionPrompt: 'Open' } })
  assert.equal(findByAttribute(container, 'data-anyo-player-interaction-prompt').hidden, true)
  world.emit('entity:select', { entityId: 'door', primitiveId: 'p1', source: 'touch' })
  assert.equal(interactions.length, 1)
  assert.equal(player.interactionPrompt.visible, false)
  await player.disposeAsync()
})

test('two touch players keep movement and canvas gestures isolated', async () => {
  const first = createTouchPlayer()
  const second = createTouchPlayer()
  await Promise.all([first.player.load(), second.player.load()])
  const firstMove = findByAttribute(first.container, 'data-anyo-player-touch-move')

  firstMove.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 }))
  firstMove.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 80, clientY: 30 }))
  assert.equal(first.player.state, 'running')
  assert.equal(second.player.state, 'ready')
  assert.notDeepEqual(first.world.exploration.moveAxes, [0, 0])
  assert.deepEqual(second.world.exploration.moveAxes, [0, 0])
  assert.equal(second.world.exploration.inputEnabled, false)

  await Promise.all([first.player.disposeAsync(), second.player.disposeAsync()])
})

test('touch controls can be hidden while canvas touch look and tap remain host-usable', async () => {
  const world = new FakeWorld({ pickResult: { primitiveId: 'p1' } })
  const { player, container } = createTouchPlayer({ ui: false }, new FakeDocument(), world)
  await player.load()
  assert.equal(findByAttribute(container, 'data-anyo-player-ui'), null)
  assert.equal(findByAttribute(container, 'data-anyo-player-touch'), null)

  player.canvas.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 30, clientY: 30 }))
  player.canvas.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 30, clientY: 30 }))
  await Promise.resolve()
  assert.equal(player.state, 'running')
  assert.equal(world.selections.length, 1)
  await player.disposeAsync()
})

test('touch-disabled players install no touch surface and do not consume touch pointers', async () => {
  const document = new FakeDocument()
  const container = new FakeContainer(document)
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { desktop: false, touch: false },
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  await player.load()
  const down = pointer('pointerdown', { pointerId: 1, clientX: 20, clientY: 20 })
  player.canvas.dispatchEvent(down)
  assert.equal(down.defaultPrevented, false)
  assert.equal(player.state, 'ready')
  assert.equal(player.touchEnabled, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-touch'), null)
  await player.disposeAsync()
})

test('touch and interaction listeners are removed during asynchronous disposal', async () => {
  const { player, container, world } = createTouchPlayer()
  await player.load()
  const move = findByAttribute(container, 'data-anyo-player-touch-move')
  assert.equal(player.canvas.captureListeners.get('pointerdown').size > 0, true)
  assert.equal(world.events.get('entity:hover').size, 1)

  await player.disposeAsync()
  assert.equal(player.canvas.captureListeners.has('pointerdown'), false)
  assert.equal(player.canvas.captureListeners.has('click'), false)
  assert.equal(move.listeners.has('pointerdown'), false)
  assert.equal(world.events.get('entity:hover')?.size ?? 0, 0)
  assert.equal(findByAttribute(container, 'data-anyo-player-touch'), null)
})
