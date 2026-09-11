import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeDocument,
  FakeResizeObserver,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  fakeEvent,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

const nextTurn = () => new Promise(resolve => setImmediate(resolve))

function createPlayer(options = {}, document = new FakeDocument(), world = new FakeWorld()) {
  const container = new FakeContainer(document)
  const factory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    ...options,
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(options.document ?? { version: '0.6' }),
  })
  return { player, container, document, world, factory }
}

test('responsive sizing owns container dimensions, DPR caps, resize, orientation, and DPR changes', async () => {
  const OriginalResizeObserver = globalThis.ResizeObserver
  FakeResizeObserver.instances.length = 0
  globalThis.ResizeObserver = FakeResizeObserver
  try {
    const document = new FakeDocument()
    document.defaultView.devicePixelRatio = 3
    const { player, container, factory } = createPlayer({ resize: { maxPixelRatio: 2 } }, document)
    container.clientWidth = 800
    container.clientHeight = 450
    const resizeEvents = []
    player.on('resize', event => resizeEvents.push(event))

    await player.load()
    const renderer = factory.created[0].renderer
    assert.deepEqual(renderer.resizeCalls.at(-1), { width: 800, height: 450, pixelRatio: 2 })
    assert.deepEqual(player.viewport, { width: 800, height: 450, pixelRatio: 2 })

    container.clientWidth = 1024
    container.clientHeight = 512
    FakeResizeObserver.instances[0].trigger()
    assert.deepEqual(renderer.resizeCalls.at(-1), { width: 1024, height: 512, pixelRatio: 2 })

    document.defaultView.devicePixelRatio = 1.5
    document.defaultView.mediaQueries.at(-1).trigger()
    assert.deepEqual(renderer.resizeCalls.at(-1), { width: 1024, height: 512, pixelRatio: 1.5 })

    container.clientWidth = 600
    container.clientHeight = 900
    document.defaultView.dispatchEvent(fakeEvent('orientationchange'))
    assert.deepEqual(renderer.resizeCalls.at(-1), { width: 600, height: 900, pixelRatio: 1.5 })
    assert.equal(resizeEvents.some(event => event.width === 600 && event.height === 900), true)

    await player.disposeAsync()
    assert.equal(FakeResizeObserver.instances[0].disconnected, true)
    assert.equal(document.defaultView.listeners.has('resize'), false)
    assert.equal(document.defaultView.listeners.has('orientationchange'), false)
  } finally {
    globalThis.ResizeObserver = OriginalResizeObserver
  }
})

test('fixed DPR ignores device changes and responsive ownership can be disabled', async () => {
  const fixedDocument = new FakeDocument()
  fixedDocument.defaultView.devicePixelRatio = 4
  const fixed = createPlayer({ resize: { pixelRatio: 1.25, maxPixelRatio: 3 } }, fixedDocument)
  await fixed.player.load()
  const fixedRenderer = fixed.factory.created[0].renderer
  assert.equal(fixedRenderer.resizeCalls.at(-1).pixelRatio, 1.25)
  fixedDocument.defaultView.devicePixelRatio = 2
  fixedDocument.defaultView.dispatchEvent(fakeEvent('resize'))
  assert.equal(fixedRenderer.resizeCalls.at(-1).pixelRatio, 1.25)
  await fixed.player.disposeAsync()

  const disabled = createPlayer({ resize: false })
  await disabled.player.load()
  assert.equal(disabled.factory.created[0].renderer.resizeCalls.length, 0)
  disabled.player.resizeNow()
  assert.equal(disabled.factory.created[0].renderer.resizeCalls.length, 0)
  await disabled.player.disposeAsync()
})

test('pause and resume use Anyo lifecycle while preserving user control intent', async () => {
  const { player, container, world } = createPlayer({ exploration: { pointerLock: false } })
  const paused = []
  const resumed = []
  const exited = []
  player.on('paused', event => paused.push(event))
  player.on('resumed', event => resumed.push(event))
  player.on('exited', event => exited.push(event.reason))
  await player.load()
  player.canvas.click()
  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyW' }))
  assert.equal(player.state, 'running')
  assert.deepEqual(world.exploration.moveAxes, [0, 1])

  player.pause()
  assert.equal(player.state, 'paused')
  assert.equal(player.paused, true)
  assert.equal(player.pauseReason, 'user')
  assert.equal(world.exploration.inputEnabled, false)
  assert.deepEqual(world.exploration.moveAxes, [0, 0])
  assert.equal(world.sequence.includes('pause'), true)
  assert.deepEqual(exited, ['pause'])
  assert.deepEqual(paused, [{ reason: 'user' }])
  assert.equal(findByClass(container, 'anyo-player__panel--paused').hidden, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-pause').textContent, 'Resume')

  player.resume()
  assert.equal(world.sequence.includes('resume'), true)
  assert.equal(player.state, 'running')
  assert.equal(player.pauseReason, null)
  assert.deepEqual(resumed, [{ reason: 'user', controlsRequested: true }])
  assert.equal(findByClass(container, 'anyo-player__panel--paused').hidden, true)
  await player.disposeAsync()
})

test('pausing a ready world resumes to ready without activating desktop input', async () => {
  const { player, world } = createPlayer({ exploration: { pointerLock: false } })
  await player.load()
  player.pause()
  assert.equal(player.state, 'paused')
  player.resume()
  assert.equal(player.state, 'ready')
  assert.equal(world.exploration.inputEnabled, false)
  await player.disposeAsync()
})

test('visibility pause resumes rendering without requesting pointer lock', async () => {
  const document = new FakeDocument()
  const { player, world, container } = createPlayer({}, document)
  const resumed = []
  player.on('resumed', event => resumed.push(event))
  await player.load()
  player.canvas.click()
  assert.equal(player.pointerLocked, true)

  document.setHidden(true)
  assert.equal(player.state, 'paused')
  assert.equal(player.pauseReason, 'visibility')
  assert.equal(player.pointerLocked, false)
  assert.equal(findByClass(container, 'anyo-player__panel--paused').hidden, false)

  document.setHidden(false)
  assert.equal(player.state, 'ready')
  assert.equal(player.pointerLocked, false)
  assert.equal(world.exploration.inputEnabled, false)
  assert.deepEqual(resumed, [{ reason: 'visibility', controlsRequested: false }])
  assert.equal(findByClass(container, 'anyo-player__panel--enter').hidden, false)
  await player.disposeAsync()
})

test('visibility policy respects user pauses, disabled policy, and initially hidden documents', async () => {
  const userDocument = new FakeDocument()
  const userPaused = createPlayer({ exploration: { pointerLock: false } }, userDocument)
  await userPaused.player.load()
  userPaused.player.pause()
  userDocument.setHidden(true)
  userDocument.setHidden(false)
  assert.equal(userPaused.player.state, 'paused')
  assert.equal(userPaused.player.pauseReason, 'user')
  await userPaused.player.disposeAsync()

  const disabledDocument = new FakeDocument()
  const disabled = createPlayer({ visibility: false }, disabledDocument)
  await disabled.player.load()
  disabledDocument.setHidden(true)
  assert.equal(disabled.player.state, 'ready')
  await disabled.player.disposeAsync()

  const hiddenDocument = new FakeDocument()
  hiddenDocument.hidden = true
  hiddenDocument.visibilityState = 'hidden'
  const hidden = createPlayer({}, hiddenDocument)
  await hidden.player.load()
  assert.equal(hidden.player.state, 'paused')
  assert.equal(hidden.player.pauseReason, 'visibility')
  hiddenDocument.setHidden(false)
  assert.equal(hidden.player.state, 'ready')
  await hidden.player.disposeAsync()
})

test('fullscreen ownership is reflected in public state, UI, events, and renderer resize', async () => {
  const { player, container, document, factory } = createPlayer()
  const changes = []
  player.on('fullscreenchange', event => changes.push(event.fullscreen))
  await player.load()
  const renderer = factory.created[0].renderer
  const before = renderer.resizeCalls.length

  await player.enterFullscreen()
  assert.equal(document.fullscreenElement, container)
  assert.equal(player.fullscreen, true)
  assert.deepEqual(changes, [true])
  const button = findByAttribute(container, 'data-anyo-player-fullscreen')
  assert.equal(button.textContent, 'Exit fullscreen')
  assert.equal(button.getAttribute('aria-pressed'), 'true')
  assert.equal(renderer.resizeCalls.length > before, true)

  await document.exitFullscreen()
  assert.equal(player.fullscreen, false)
  assert.deepEqual(changes, [true, false])
  assert.equal(button.textContent, 'Enter fullscreen')
  await player.disposeAsync()
})

test('fullscreen can target the canvas and failures remain recoverable', async () => {
  const canvasTarget = createPlayer({ fullscreen: { target: 'canvas' } })
  await canvasTarget.player.load()
  await canvasTarget.player.enterFullscreen()
  assert.equal(canvasTarget.document.fullscreenElement, canvasTarget.player.canvas)
  await canvasTarget.player.exitFullscreen()
  await canvasTarget.player.disposeAsync()

  const failed = createPlayer()
  const errors = []
  failed.player.on('fullscreenerror', error => errors.push(error))
  failed.container.fullscreenMode = 'reject'
  await failed.player.load()
  await assert.rejects(failed.player.enterFullscreen(), error => error.code === 'PLAYER_FULLSCREEN_FAILED')
  assert.equal(failed.player.state, 'ready')
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'PLAYER_FULLSCREEN_FAILED')
  assert.match(findByClass(failed.container, 'anyo-player__diagnostic-message').textContent, /Fullscreen was unavailable/i)
  await failed.player.disposeAsync()

  const unavailable = createPlayer({ fullscreen: false })
  await unavailable.player.load()
  assert.equal(findByAttribute(unavailable.container, 'data-anyo-player-fullscreen').hidden, true)
  await assert.rejects(unavailable.player.enterFullscreen(), error => error.code === 'PLAYER_FULLSCREEN_UNAVAILABLE')
  await unavailable.player.disposeAsync()
})

test('disposal exits owned fullscreen and removes browser lifecycle listeners', async () => {
  const { player, document, container } = createPlayer()
  await player.load()
  await player.enterFullscreen()
  assert.equal(document.fullscreenElement, container)
  await player.disposeAsync()
  assert.equal(document.fullscreenElement, null)
  assert.equal(document.listeners.has('fullscreenchange'), false)
  assert.equal(document.listeners.has('fullscreenerror'), false)
  assert.equal(document.listeners.has('visibilitychange'), false)
})

test('pause, resume, and fullscreen reject invalid lifecycle states', async () => {
  const { player } = createPlayer()
  assert.throws(() => player.pause(), error => error.code === 'PLAYER_INVALID_STATE')
  assert.throws(() => player.resume(), error => error.code === 'PLAYER_INVALID_STATE')
  await assert.rejects(player.enterFullscreen(), error => error.code === 'PLAYER_INVALID_STATE')
  await player.disposeAsync()
})
