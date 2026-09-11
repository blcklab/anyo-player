import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve))
}

function createVRPlayer(world = new FakeWorld({ xrSupported: true }), extra = {}) {
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { vr: true },
    ...extra,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  return { player, world, container }
}

test('VR support is detected after load and exposed through public state, events, and UI', async () => {
  const { player, world, container } = createVRPlayer()
  const supportEvents = []
  player.on('vrsupportchange', event => supportEvents.push(event.state))

  await player.load()
  await nextTurn()

  assert.equal(player.vrEnabled, true)
  assert.equal(player.vrSupported, true)
  assert.equal(player.vrSupportState, 'supported')
  assert.equal(world.sequence.includes('xr-support:immersive-vr'), true)
  assert.deepEqual(supportEvents, ['checking', 'supported'])
  const button = findByAttribute(container, 'data-anyo-player-vr')
  assert.equal(button.hidden, false)
  assert.equal(button.disabled, false)
  assert.equal(button.textContent, 'Enter VR')
  await player.disposeAsync()
})

test('VR-disabled players expose no active VR control and support checks return false', async () => {
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({ container, source: { version: '0.6' } }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: new StaticSourceResolver(),
  })
  await player.load()
  assert.equal(player.vrEnabled, false)
  assert.equal(player.vrSupportState, 'disabled')
  assert.equal(await player.checkVRSupport(), false)
  assert.equal(findByAttribute(container, 'data-anyo-player-vr').hidden, true)
  await assert.rejects(player.enterVR(), error => error.code === 'PLAYER_VR_DISABLED')
  await player.disposeAsync()
})

test('enterVR suspends desktop input and transfers lifecycle ownership to Anyo XR', async () => {
  const { player, world, container } = createVRPlayer()
  await player.load()
  await nextTurn()
  player.enter()
  assert.equal(player.state, 'running')

  const exited = []
  const entered = []
  player.on('exited', event => exited.push(event.reason))
  player.on('vrentered', event => entered.push(event))
  await player.enterVR()

  assert.equal(player.state, 'vr-active')
  assert.equal(player.xrState, 'active')
  assert.equal(player.entered, false)
  assert.equal(player.inputMode, null)
  assert.equal(world.sequence.includes('xr-enter'), true)
  assert.deepEqual(exited, ['vr-enter'])
  assert.equal(entered.length, 1)
  assert.equal(findByAttribute(container, 'data-anyo-player-vr').textContent, 'Exit VR')
  assert.equal(findByAttribute(container, 'data-anyo-player-vr').getAttribute('aria-pressed'), 'true')
  await player.disposeAsync()
})

test('exitVR returns to ready without reacquiring pointer lock or desktop controls', async () => {
  const { player, world, container } = createVRPlayer()
  await player.load()
  await nextTurn()
  await player.enterVR()
  const exits = []
  player.on('vrexited', event => exits.push(event))

  await player.exitVR()

  assert.equal(player.state, 'ready')
  assert.equal(player.xrState, 'idle')
  assert.equal(player.entered, false)
  assert.equal(player.pointerLocked, false)
  assert.equal(world.sequence.includes('xr-exit'), true)
  assert.deepEqual(exits, [{ browserEnded: false }])
  assert.equal(findByAttribute(container, 'data-anyo-player-vr').textContent, 'Enter VR')
  await player.disposeAsync()
})

test('browser-ended XR sessions recover the player to ready and report browser ownership', async () => {
  const { player, world } = createVRPlayer()
  await player.load()
  await nextTurn()
  await player.enterVR()
  const exited = new Promise(resolve => player.on('vrexited', resolve))

  world.endXRFromBrowser()
  const event = await exited

  assert.equal(event.browserEnded, true)
  assert.equal(player.state, 'ready')
  assert.equal(player.xrTracking, 'unavailable')
  assert.deepEqual(player.xrInputs, [])
  await player.disposeAsync()
})

test('tracking loss, restoration, and input-source changes update public state and accessible UI', async () => {
  const { player, world, container } = createVRPlayer()
  await player.load()
  await nextTurn()
  await player.enterVR()
  const tracking = []
  const inputs = []
  player.on('xrtrackingchange', event => tracking.push(event.state))
  player.on('xrinputchange', event => inputs.push(event.inputs.length))

  world.setXRInputs([{ id: 'left', handedness: 'left', targetRayMode: 'tracked-pointer', profiles: [], targetRay: null, grip: null, buttons: [], axes: [], supportsHaptics: false }])
  world.loseXRTracking()
  const status = findByAttribute(container, 'data-anyo-player-xr-status')
  assert.equal(player.xrInputs.length, 1)
  assert.equal(player.xrTracking, 'lost')
  assert.equal(status.hidden, false)
  assert.match(status.children[0].textContent, /tracking lost/i)
  assert.equal(status.getAttribute('data-severity'), 'error')

  world.restoreXRTracking()
  assert.equal(player.xrTracking, 'tracked')
  assert.deepEqual(tracking, ['lost', 'tracked'])
  assert.deepEqual(inputs, [1])
  assert.match(findByClass(container, 'anyo-player__diagnostic-message').textContent, /tracking restored/i)
  await player.disposeAsync()
})

test('unsupported VR remains non-fatal and enterVR rejects with a typed error', async () => {
  const { player, container } = createVRPlayer(new FakeWorld({ xrSupported: false }))
  const errors = []
  player.on('vrerror', error => errors.push(error.code))
  await player.load()
  await nextTurn()

  assert.equal(player.state, 'ready')
  assert.equal(player.vrSupported, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-vr').disabled, true)
  await assert.rejects(player.enterVR(), error => error.code === 'PLAYER_VR_UNSUPPORTED')
  assert.equal(player.state, 'ready')
  assert.deepEqual(errors, ['PLAYER_VR_UNSUPPORTED'])
  await player.disposeAsync()
})

test('VR entry failure returns to ready and preserves a retryable desktop experience', async () => {
  const { player, container } = createVRPlayer(new FakeWorld({
    xrSupported: true,
    xrEnter: async () => { throw new Error('permission denied') },
  }))
  const errors = []
  player.on('vrerror', error => errors.push(error.code))
  await player.load()
  await nextTurn()

  await assert.rejects(player.enterVR(), error => error.code === 'PLAYER_VR_ENTER_FAILED')
  assert.equal(player.state, 'ready')
  assert.equal(player.entered, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-enter').hidden, false)
  assert.match(findByClass(container, 'anyo-player__diagnostic-message').textContent, /VR could not start/i)
  assert.deepEqual(errors, ['PLAYER_VR_ENTER_FAILED'])
  await player.disposeAsync()
})

test('visibility changes do not pause an active XR session', async () => {
  const { player, world, container } = createVRPlayer()
  await player.load()
  await nextTurn()
  await player.enterVR()

  container.ownerDocument.setHidden(true)
  assert.equal(player.state, 'vr-active')
  assert.equal(world.sequence.includes('pause'), false)
  container.ownerDocument.setHidden(false)
  assert.equal(player.state, 'vr-active')
  await player.disposeAsync()
})


test('support detection failures stay non-fatal and can be retried through the public API', async () => {
  const world = new FakeWorld({ xrSupportError: new Error('navigator.xr unavailable') })
  const { player } = createVRPlayer(world)
  const errors = []
  player.on('vrerror', error => errors.push(error.code))
  await player.load()
  await nextTurn()

  assert.equal(player.state, 'ready')
  assert.equal(player.vrSupportState, 'error')
  await assert.rejects(player.checkVRSupport(), error => error.code === 'PLAYER_VR_SUPPORT_FAILED')
  assert.equal(player.state, 'ready')
  assert.equal(errors.includes('PLAYER_VR_SUPPORT_FAILED'), true)
  await player.disposeAsync()
})

test('support auto-check can be disabled for hosts that schedule capability checks explicitly', async () => {
  const world = new FakeWorld({ xrSupported: true })
  const { player } = createVRPlayer(world, {
    exploration: { vr: { checkSupportOnLoad: false } },
  })
  await player.load()
  await nextTurn()

  assert.equal(player.vrSupportState, 'unknown')
  assert.equal(world.sequence.includes('xr-support:immersive-vr'), false)
  assert.equal(await player.checkVRSupport(), true)
  assert.equal(player.vrSupportState, 'supported')
  await player.disposeAsync()
})

test('VR exit failure preserves the active session state and emits one typed error', async () => {
  const world = new FakeWorld({
    xrSupported: true,
    xrExit: async () => { throw new Error('headset refused exit') },
  })
  const { player } = createVRPlayer(world)
  const errors = []
  player.on('vrerror', error => errors.push(error.code))
  await player.load()
  await nextTurn()
  await player.enterVR()

  await assert.rejects(player.exitVR(), error => error.code === 'PLAYER_VR_EXIT_FAILED')
  assert.equal(player.state, 'vr-active')
  assert.equal(player.xrState, 'active')
  assert.deepEqual(errors, ['PLAYER_VR_EXIT_FAILED'])
  await player.disposeAsync()
})

test('XR listeners and UI controls are removed during async disposal', async () => {
  const { player, world, container } = createVRPlayer()
  await player.load()
  await nextTurn()
  await player.enterVR()
  const button = findByAttribute(container, 'data-anyo-player-vr')
  const status = findByAttribute(container, 'data-anyo-player-xr-status')

  await player.disposeAsync()

  assert.equal(player.state, 'disposed')
  assert.equal(world.disposeCount, 1)
  assert.equal(button.listeners.has('click'), false)
  assert.equal(findByAttribute(container, 'data-anyo-player-xr-status'), null)
  assert.equal(world.events.get('xr:session-start')?.size ?? 0, 0)
  assert.equal(world.events.get('xr:tracking-lost')?.size ?? 0, 0)
})
