import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { AnyoPlayerError } from '../dist/errors.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  fakeEvent,
} from './helpers.mjs'

class MemoryInputStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function button(pressed = false, value = pressed ? 1 : 0) {
  return { pressed, touched: pressed, value }
}

function createGamepad(index = 0) {
  return {
    index,
    id: `Test Gamepad ${index}`,
    mapping: 'standard',
    connected: true,
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => button()),
  }
}

function createPlayer({ input, exploration, interaction, worldOptions = {}, storage } = {}) {
  const primitive = {
    id: 'terminal',
    entityId: 'terminal-entity',
    transform: { position: [0, 1, -2] },
    visible: true,
    interaction: { action: 'open-terminal', distance: 4 },
    data: { interactionPrompt: 'Open terminal' },
  }
  const world = new FakeWorld({
    primitives: [primitive],
    pickResult: { primitiveId: primitive.id, distance: 2 },
    ...worldOptions,
  })
  const container = new FakeContainer()
  const pads = []
  container.ownerDocument.defaultView.navigator.getGamepads = () => pads
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { pointerLock: false, touch: false, ...exploration },
    interaction: interaction === false ? false : { reticle: { mode: 'running' }, ...(interaction ?? {}) },
    input,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver({ version: '0.6' }),
    ...(storage ? { inputStorage: storage } : {}),
  })
  return { player, world, container, pads }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function key(type, code, repeat = false) {
  return fakeEvent(type, { code, repeat })
}

test('the unified default map preserves legacy desktop keys and exposes standard gamepad bindings', async () => {
  const { player } = createPlayer({
    exploration: { keys: { forward: ['KeyI'], run: ['ControlLeft'] } },
    interaction: { activateKeys: ['KeyF'] },
  })
  assert.deepEqual(
    player.inputBindings['move-forward'].filter(value => value.device === 'keyboard'),
    [{ device: 'keyboard', code: 'KeyI' }],
  )
  assert.deepEqual(
    player.inputBindings.interact.filter(value => value.device === 'keyboard'),
    [{ device: 'keyboard', code: 'KeyF' }],
  )
  assert.ok(player.inputBindings.run.some(value => value.device === 'gamepad-button' && value.button === 10))
  assert.ok(player.inputBindings['look-right'].some(value => value.device === 'gamepad-axis' && value.axis === 2))
  assert.ok(player.inputBindings.pause.some(value => value.device === 'keyboard' && value.code === 'KeyP'))
  assert.equal(player.gamepadEnabled, false)
  await player.disposeAsync()
})

test('runtime rebinding updates movement and interaction keys immediately', async () => {
  const { player, world } = createPlayer()
  const changes = []
  player.on('inputbindingschange', event => changes.push(event))
  await player.load()
  player.enter()

  player.setInputBindings({
    'move-forward': [{ device: 'keyboard', code: 'KeyZ' }],
    interact: [{ device: 'keyboard', code: 'KeyF' }],
  })

  const oldMove = key('keydown', 'KeyW')
  player.canvas.dispatchEvent(oldMove)
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  assert.equal(oldMove.defaultPrevented, false)

  const newMove = key('keydown', 'KeyZ')
  player.canvas.dispatchEvent(newMove)
  assert.deepEqual(world.exploration.moveAxes, [0, 1])
  assert.equal(newMove.defaultPrevented, true)
  player.canvas.dispatchEvent(key('keyup', 'KeyZ'))

  const oldInteract = key('keydown', 'KeyE')
  player.canvas.dispatchEvent(oldInteract)
  await tick()
  assert.equal(world.selections.length, 0)

  const newInteract = key('keydown', 'KeyF')
  player.canvas.dispatchEvent(newInteract)
  await tick()
  assert.equal(world.selections.length, 1)
  assert.equal(newInteract.defaultPrevented, true)
  assert.equal(changes.at(-1).source, 'runtime')
  await player.disposeAsync()
})

test('invalid runtime bindings reject through the typed error channel without changing the active map', async () => {
  const { player } = createPlayer()
  const before = player.inputBindings
  const errors = []
  player.on('inputbindingserror', error => errors.push(error))

  assert.throws(() => player.setInputBindings({
    run: [{ device: 'gamepad-axis', axis: -1, direction: 1 }],
  }), error => {
    assert.ok(error instanceof AnyoPlayerError)
    assert.equal(error.code, 'PLAYER_INPUT_BINDINGS_INVALID')
    return true
  })
  assert.deepEqual(player.inputBindings, before)
  assert.equal(errors.length, 1)
  await player.disposeAsync()
})

test('input bindings save, load, reset, and clear through a host storage adapter', async () => {
  const storage = new MemoryInputStorage()
  const { player } = createPlayer({
    input: { storageKey: 'controls', gamepad: false },
    storage,
  })
  const saved = []
  const loaded = []
  player.on('inputbindingssaved', event => saved.push(event))
  player.on('inputbindingsloaded', event => loaded.push(event))

  player.setInputBindings({ interact: [{ device: 'keyboard', code: 'Enter' }] })
  const snapshot = await player.saveInputBindings()
  assert.equal(snapshot.format, '@blcklab/anyo-player/input-bindings')
  assert.equal(saved[0].key, 'controls')

  player.resetInputBindings()
  assert.equal(player.inputBindings.interact.some(value => value.device === 'keyboard' && value.code === 'KeyE'), true)

  const restored = await player.loadInputBindings()
  assert.deepEqual(restored, snapshot)
  assert.equal(player.inputBindings.interact.some(value => value.device === 'keyboard' && value.code === 'Enter'), true)
  assert.equal(loaded.at(-1).key, 'controls')

  await player.clearInputBindings()
  assert.equal(storage.values.has('controls'), false)
  await player.disposeAsync()
})

test('restoreOnLoad applies persisted bindings before the first world becomes ready', async () => {
  const storage = new MemoryInputStorage()
  storage.setItem('controls', JSON.stringify({
    format: '@blcklab/anyo-player/input-bindings',
    version: 1,
    bindings: {
      'move-forward': [{ device: 'keyboard', code: 'KeyI' }],
      'move-backward': [],
      'move-left': [],
      'move-right': [],
      'look-up': [],
      'look-down': [],
      'look-left': [],
      'look-right': [],
      run: [],
      interact: [{ device: 'keyboard', code: 'Enter' }],
      pause: [],
    },
  }))
  const { player, world } = createPlayer({
    input: { storageKey: 'controls', restoreOnLoad: true },
    storage,
  })
  await player.load()
  player.enter()
  player.canvas.dispatchEvent(key('keydown', 'KeyI'))
  assert.deepEqual(world.exploration.moveAxes, [0, 1])
  player.canvas.dispatchEvent(key('keyup', 'KeyI'))
  await player.disposeAsync()
})

test('standard gamepad input enters safely and maps analog movement, look, and run into Anyo exploration', async () => {
  const { player, world, pads } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad()
  pads.push(gamepad)
  const entered = []
  player.on('entered', event => entered.push(event))
  await player.load()

  gamepad.axes[1] = -0.8
  player.gamepadInput.pollNow(16)
  assert.equal(player.state, 'running')
  assert.equal(player.inputMode, 'gamepad')
  assert.deepEqual(world.exploration.moveAxes.map(value => Math.round(value * 100) / 100), [0, 0.76])
  assert.equal(entered[0].mode, 'gamepad')

  gamepad.buttons[10] = button(true)
  gamepad.axes[2] = 0.6
  gamepad.axes[3] = -0.5
  gamepad.timestamp += 1
  player.gamepadInput.pollNow(32)
  assert.equal(world.exploration.running, true)
  assert.ok(world.exploration.lookDeltas.length > 0)
  assert.ok(world.exploration.lookDeltas.at(-1)[0] > 0)
  assert.ok(world.exploration.lookDeltas.at(-1)[1] < 0)
  await player.disposeAsync()
})


test('standard gamepad A/Cross requests a character jump', async () => {
  const { player, world, pads } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad()
  pads.push(gamepad)
  await player.load()
  gamepad.axes[1] = -0.7
  player.gamepadInput.pollNow(16)
  gamepad.axes[1] = 0
  gamepad.buttons[0] = button(true)
  player.gamepadInput.pollNow(32)
  player.gamepadInput.pollNow(48)
  assert.equal(world.exploration.jumpCount, 1)
  await player.disposeAsync()
})

test('gamepad interaction and pause actions use the same Player APIs and require neutral re-press to resume', async () => {
  const { player, world, pads } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad()
  pads.push(gamepad)
  await player.load()

  gamepad.axes[1] = -0.7
  player.gamepadInput.pollNow(16)
  gamepad.axes[1] = 0
  player.gamepadInput.pollNow(32)

  gamepad.buttons[2] = button(true)
  player.gamepadInput.pollNow(48)
  await tick()
  assert.equal(world.selections.length, 1)
  gamepad.buttons[2] = button(false)
  player.gamepadInput.pollNow(64)

  gamepad.buttons[9] = button(true)
  player.gamepadInput.pollNow(80)
  assert.equal(player.state, 'paused')
  gamepad.buttons[9] = button(false)
  player.gamepadInput.pollNow(96)
  gamepad.buttons[9] = button(true)
  player.gamepadInput.pollNow(112)
  assert.equal(player.state, 'running')
  assert.equal(player.inputMode, 'gamepad')
  await player.disposeAsync()
})

test('gamepad disconnect exits controls, clears Anyo input, and emits immutable device state', async () => {
  const { player, world, pads, container } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad(2)
  pads.push(gamepad)
  const changes = []
  player.on('gamepadchange', event => changes.push(event))
  await player.load()
  gamepad.axes[0] = 0.7
  player.gamepadInput.pollNow(16)
  assert.equal(player.inputMode, 'gamepad')

  gamepad.connected = false
  pads.length = 0
  container.ownerDocument.defaultView.dispatchEvent(fakeEvent('gamepaddisconnected', { gamepad }))
  assert.equal(player.state, 'ready')
  assert.equal(player.inputMode, null)
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  assert.equal(changes.at(-1).activeGamepad, null)
  await player.disposeAsync()
  assert.equal(container.ownerDocument.defaultView.listeners.has('gamepadconnected'), false)
  assert.equal(container.ownerDocument.defaultView.listeners.has('gamepaddisconnected'), false)
})

test('gamepad support remains opt-in and disabled players install no gamepad listeners', async () => {
  const { player, container } = createPlayer()
  assert.equal(player.gamepadEnabled, false)
  assert.equal(container.ownerDocument.defaultView.listeners.has('gamepadconnected'), false)
  await player.load()
  assert.equal(player.gamepads.length, 0)
  await player.disposeAsync()
})

test('inputaction events expose unified keyboard movement and run values', async () => {
  const { player } = createPlayer()
  const actions = []
  player.on('inputaction', event => actions.push(event))
  await player.load()
  player.enter()

  player.canvas.dispatchEvent(key('keydown', 'KeyW'))
  player.canvas.dispatchEvent(key('keydown', 'ShiftLeft'))
  player.canvas.dispatchEvent(key('keyup', 'KeyW'))
  player.canvas.dispatchEvent(key('keyup', 'ShiftLeft'))

  assert.deepEqual(actions.filter(event => event.action === 'move-forward'), [
    { action: 'move-forward', value: 1, pressed: true, device: 'keyboard' },
    { action: 'move-forward', value: 0, pressed: false, device: 'keyboard' },
  ])
  assert.deepEqual(actions.filter(event => event.action === 'run'), [
    { action: 'run', value: 1, pressed: true, device: 'keyboard' },
    { action: 'run', value: 0, pressed: false, device: 'keyboard' },
  ])
  await player.disposeAsync()
})

test('gamepadchange reports topology changes without emitting every timestamp poll', async () => {
  const { player, pads } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad()
  pads.push(gamepad)
  const changes = []
  player.on('gamepadchange', event => changes.push(event))
  await player.load()

  player.gamepadInput.pollNow(16)
  const initialCount = changes.length
  gamepad.timestamp += 1
  player.gamepadInput.pollNow(32)
  gamepad.timestamp += 1
  player.gamepadInput.pollNow(48)
  assert.equal(changes.length, initialCount)
  assert.equal(player.gamepads[0].timestamp, 3)
  await player.disposeAsync()
})

test('keyboard look bindings apply renderer-neutral look deltas and emit action state', async () => {
  const { player, world } = createPlayer({
    input: {
      keyboardLookSensitivity: 12,
      bindings: {
        'look-left': [{ device: 'keyboard', code: 'KeyQ' }],
        'look-up': [{ device: 'keyboard', code: 'KeyR' }],
      },
    },
  })
  const actions = []
  player.on('inputaction', event => actions.push(event))
  await player.load()
  player.enter()

  player.canvas.dispatchEvent(key('keydown', 'KeyQ'))
  player.canvas.dispatchEvent(key('keyup', 'KeyQ'))
  player.canvas.dispatchEvent(key('keydown', 'KeyR'))
  player.canvas.dispatchEvent(key('keyup', 'KeyR'))

  assert.deepEqual(world.exploration.lookDeltas.slice(-2), [[-12, 0], [0, -12]])
  assert.deepEqual(actions.filter(event => event.action === 'look-left'), [
    { action: 'look-left', value: 1, pressed: true, device: 'keyboard' },
    { action: 'look-left', value: 0, pressed: false, device: 'keyboard' },
  ])
  await player.disposeAsync()
})

test('saveOnChange persists runtime and reset binding maps without blocking the public setter', async () => {
  const storage = new MemoryInputStorage()
  const { player } = createPlayer({
    input: { storageKey: 'controls', saveOnChange: true },
    storage,
  })
  const saved = []
  player.on('inputbindingssaved', event => saved.push(event))

  player.setInputBindings({ interact: [{ device: 'keyboard', code: 'Enter' }] })
  await tick()
  assert.equal(saved.length, 1)
  assert.equal(JSON.parse(storage.values.get('controls')).bindings.interact[0].code, 'Enter')

  player.resetInputBindings()
  await tick()
  assert.equal(saved.length, 2)
  assert.equal(JSON.parse(storage.values.get('controls')).bindings.interact[0].code, 'KeyE')
  await player.disposeAsync()
})

test('gamepad interaction prompts describe the active standard controller binding', async () => {
  const { player, pads } = createPlayer({ input: { gamepad: true } })
  const gamepad = createGamepad()
  pads.push(gamepad)
  await player.load()

  gamepad.axes[1] = -0.7
  player.gamepadInput.pollNow(16)
  gamepad.axes[1] = 0
  player.gamepadInput.pollNow(32)
  player.interactionPresentation.refreshNow()
  await tick()

  assert.equal(player.inputMode, 'gamepad')
  assert.match(player.interactionPrompt.inputHint ?? '', /X \/ Square/)
  await player.disposeAsync()
})
