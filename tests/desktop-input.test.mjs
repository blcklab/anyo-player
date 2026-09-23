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
  findByClass,
} from './helpers.mjs'

const nextTurn = () => new Promise(resolve => setImmediate(resolve))

function createPlayer(options = {}, document = new FakeDocument(), world = new FakeWorld()) {
  const container = new FakeContainer(document)
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    ...options,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(options.document ?? { version: '0.6' }),
  })
  return { player, container, world, document }
}

test('the first canvas click is consumed for entry and enables scoped Anyo exploration input', async () => {
  const { player, container, world, document } = createPlayer()
  const states = []
  const locks = []
  let entered
  player.on('statechange', event => states.push(event.state))
  player.on('pointerlockchange', event => locks.push(event.locked))
  player.on('entered', event => { entered = event })
  await player.load()

  const enterPanel = findByClass(container, 'anyo-player__panel--enter')
  assert.equal(player.state, 'ready')
  assert.equal(enterPanel.hidden, false)

  let interactionClicks = 0
  player.canvas.addEventListener('click', () => { interactionClicks += 1 })
  player.canvas.click()

  assert.equal(interactionClicks, 0)
  assert.equal(player.state, 'running')
  assert.equal(player.entered, true)
  assert.equal(player.pointerLocked, true)
  assert.equal(world.exploration.inputEnabled, true)
  assert.equal(entered.pointerLockRequested, true)
  assert.equal(enterPanel.hidden, true)
  assert.deepEqual(states.slice(-2), ['entering', 'running'])
  assert.deepEqual(locks, [true])

  const forward = fakeEvent('keydown', { code: 'KeyW' })
  player.canvas.dispatchEvent(forward)
  assert.equal(forward.defaultPrevented, true)
  assert.deepEqual(world.exploration.moveAxes, [0, 1])

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyD' }))
  assert.deepEqual(world.exploration.moveAxes, [1, 1])

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'ShiftLeft' }))
  assert.equal(world.exploration.running, true)

  document.dispatchEvent(fakeEvent('mousemove', { movementX: 12, movementY: -4 }))
  assert.deepEqual(world.exploration.lookDeltas.at(-1), [12, -4])

  player.canvas.dispatchEvent(fakeEvent('keyup', { code: 'KeyW' }))
  player.canvas.dispatchEvent(fakeEvent('keyup', { code: 'KeyD' }))
  player.canvas.dispatchEvent(fakeEvent('keyup', { code: 'ShiftLeft' }))
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  assert.equal(world.exploration.running, false)

  document.exitPointerLock()
  assert.equal(player.state, 'ready')
  assert.equal(player.entered, false)
  assert.equal(player.pointerLocked, false)
  assert.equal(world.exploration.inputEnabled, false)
  assert.equal(enterPanel.hidden, false)
  assert.deepEqual(locks, [true, false])

  await player.disposeAsync()
})

test('the Enter button uses the same user-gesture path as the canvas', async () => {
  const { player, container } = createPlayer()
  await player.load()
  const enterButton = container.children
    .flatMap(child => child.children ?? [])
    .flatMap(child => child.children ?? [])
    .find(child => child.getAttribute?.('data-anyo-player-enter') !== null)
    ?? findByClass(container, 'anyo-player__button')

  assert(enterButton)
  enterButton.click()
  assert.equal(player.state, 'running')
  assert.equal(player.pointerLocked, true)
  await player.disposeAsync()
})

test('pointer-lock rejection is recoverable and returns to the enter-ready state', async () => {
  const { player, container, world } = createPlayer()
  const inputErrors = []
  const exits = []
  player.on('inputerror', error => inputErrors.push(error))
  player.on('exited', event => exits.push(event.reason))
  player.canvas.pointerLockMode = 'reject'
  await player.load()

  player.canvas.click()
  await nextTurn()

  assert.equal(player.state, 'ready')
  assert.equal(player.entered, false)
  assert.equal(world.exploration.inputEnabled, false)
  assert.equal(inputErrors.length, 1)
  assert.equal(inputErrors[0].code, 'PLAYER_POINTER_LOCK_FAILED')
  assert.deepEqual(exits, ['pointer-lock-error'])
  const enterPanel = findByClass(container, 'anyo-player__panel--enter')
  assert.equal(enterPanel.hidden, false)
  assert.match(enterPanel.children[1].textContent, /try again/i)
  await player.disposeAsync()
})

test('non-pointer-lock mode maps canvas and document mouse movement and exits cleanly on blur', async () => {
  const world = new FakeWorld()
  const document = new FakeDocument()
  const container = new FakeContainer(document)
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { pointerLock: false },
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver({
      version: '0.6',
      exploration: { pointerLock: false },
    }),
  })
  await player.load()
  player.canvas.click()

  assert.equal(player.state, 'running')
  assert.equal(player.pointerLocked, false)
  player.canvas.dispatchEvent(fakeEvent('mousemove', { movementX: 5, movementY: 7 }))
  assert.deepEqual(world.exploration.lookDeltas, [[5, 7]])

  document.dispatchEvent(fakeEvent('mousemove', { movementX: 99, movementY: 99 }))
  assert.deepEqual(world.exploration.lookDeltas, [[5, 7], [99, 99]])

  player.canvas.blur()
  assert.equal(player.state, 'ready')
  assert.equal(world.exploration.inputEnabled, false)
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  await player.disposeAsync()
})

test('custom key bindings stay canvas-scoped and can preserve browser defaults', async () => {
  const { player, world } = createPlayer({
    exploration: {
      pointerLock: false,
      keys: { forward: ['KeyI'], run: ['Space'] },
      preventDefaultKeys: false,
    },
  })
  await player.load()
  player.canvas.click()

  const ignored = fakeEvent('keydown', { code: 'KeyW' })
  player.canvas.dispatchEvent(ignored)
  assert.deepEqual(world.exploration.moveAxes, [0, 0])

  const forward = fakeEvent('keydown', { code: 'KeyI' })
  player.canvas.dispatchEvent(forward)
  assert.equal(forward.defaultPrevented, false)
  assert.deepEqual(world.exploration.moveAxes, [0, 1])

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Space' }))
  assert.equal(world.exploration.running, true)
  await player.disposeAsync()
})


test('Space requests one character jump while desktop exploration is active', async () => {
  const { player, world } = createPlayer({ exploration: { pointerLock: false } })
  await player.load()
  player.canvas.click()
  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Space', repeat: false }))
  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Space', repeat: true }))
  player.canvas.dispatchEvent(fakeEvent('keyup', { code: 'Space' }))
  assert.equal(world.exploration.jumpCount, 1)
  await player.disposeAsync()
})

test('two embedded players transfer focus and pointer ownership without input theft', async () => {
  const document = new FakeDocument()
  const first = createPlayer({}, document, new FakeWorld())
  const second = createPlayer({}, document, new FakeWorld())
  await Promise.all([first.player.load(), second.player.load()])

  first.player.canvas.click()
  assert.equal(first.player.state, 'running')
  assert.equal(first.player.pointerLocked, true)
  assert.equal(second.player.state, 'ready')

  second.player.canvas.click()
  assert.equal(first.player.state, 'ready')
  assert.equal(first.player.entered, false)
  assert.equal(first.world.exploration.inputEnabled, false)
  assert.equal(second.player.state, 'running')
  assert.equal(second.player.pointerLocked, true)

  first.player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyW' }))
  assert.deepEqual(first.world.exploration.moveAxes, [0, 0])
  second.player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyW' }))
  assert.deepEqual(second.world.exploration.moveAxes, [0, 1])

  await Promise.all([first.player.disposeAsync(), second.player.disposeAsync()])
})

test('Escape and window blur clear movement before returning to ready', async () => {
  const { player, world, document } = createPlayer({ exploration: { pointerLock: false } })
  await player.load()
  player.canvas.click()
  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyW' }))
  assert.deepEqual(world.exploration.moveAxes, [0, 1])

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Escape' }))
  assert.equal(player.state, 'ready')
  assert.deepEqual(world.exploration.moveAxes, [0, 0])

  player.canvas.click()
  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyD' }))
  document.defaultView.dispatchEvent(fakeEvent('blur'))
  assert.equal(player.state, 'ready')
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  await player.disposeAsync()
})

test('desktop-disabled players do not consume canvas clicks or expose an enter prompt', async () => {
  const { player, container } = createPlayer({ exploration: { desktop: false } })
  await player.load()
  const root = container.children.find(child => child.getAttribute?.('data-anyo-player-ui') !== null)
  const enterPanel = findByClass(container, 'anyo-player__panel--enter')
  assert.equal(root.hidden, false)
  assert.equal(enterPanel.hidden, true)
  assert.equal(findByClass(container, 'anyo-player__controls').hidden, false)

  let clicks = 0
  player.canvas.addEventListener('click', () => { clicks += 1 })
  player.canvas.click()
  assert.equal(clicks, 1)
  assert.throws(() => player.enter(), error => error.code === 'PLAYER_INVALID_STATE')
  await player.disposeAsync()
})

test('desktop listeners and pointer ownership are removed during asynchronous disposal', async () => {
  const { player, document, world } = createPlayer()
  await player.load()
  player.canvas.click()
  assert.equal(document.pointerLockElement, player.canvas)

  await player.disposeAsync()
  assert.equal(document.pointerLockElement, null)
  assert.equal(player.canvas.listeners.has('keydown'), false)
  assert.equal(player.canvas.captureListeners.has('click'), false)
  assert.equal(document.listeners.has('mousemove'), false)
  assert.equal(document.listeners.has('pointerlockchange'), false)
  assert.equal(document.defaultView.listeners.has('blur'), false)
  assert.equal(world.exploration.inputEnabled, false)
})
