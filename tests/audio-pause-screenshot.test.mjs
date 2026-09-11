import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeDocument,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function nextTimer() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createPlayer(options = {}, world = new FakeWorld(), document = new FakeDocument()) {
  const container = new FakeContainer(document)
  const runtimeFactory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { pointerLock: false },
    ...options,
  }, {
    runtimeFactory,
    sourceResolver: new StaticSourceResolver(),
    now: () => new Date('2026-07-25T00:00:00.000Z'),
  })
  return { player, container, document, world, runtimeFactory }
}

function trackedAudioTarget() {
  return {
    unlockCalls: 0,
    mutedCalls: [],
    pauseCalls: 0,
    resumeCalls: 0,
    async unlock() { this.unlockCalls += 1 },
    async setMuted(muted) { this.mutedCalls.push(muted) },
    async onPause() { this.pauseCalls += 1 },
    async onResume() { this.resumeCalls += 1 },
  }
}

test('audio targets unlock on enter, publish state, and support runtime mute toggling', async () => {
  const target = trackedAudioTarget()
  const { player } = createPlayer({ audio: { targets: [target] } })
  const unlocked = []
  const changes = []
  player.on('audiounlocked', event => unlocked.push(event))
  player.on('audiochange', event => changes.push(event))

  await nextTimer()
  assert.equal(target.mutedCalls.at(-1), false)
  await player.load()
  player.enter()
  await nextTimer()

  assert.equal(target.unlockCalls, 1)
  assert.equal(player.audio.unlocked, true)
  assert.equal(player.audio.muted, false)
  assert.equal(unlocked.length, 1)
  assert.equal(target.mutedCalls.at(-1), false)

  await player.setAudioMuted(true)
  assert.equal(player.audio.muted, true)
  assert.equal(target.mutedCalls.at(-1), true)
  await player.toggleAudioMuted()
  assert.equal(player.audio.muted, false)
  assert.equal(changes.at(-1).source, 'runtime')
  await player.disposeAsync()
})

test('registered targets receive current mute state and unregister cleanly', async () => {
  const { player } = createPlayer({ audio: { muted: true } })
  const target = trackedAudioTarget()
  const unregister = player.registerAudioTarget(target)
  await nextTimer()
  assert.equal(player.audio.targetCount, 1)
  assert.deepEqual(target.mutedCalls, [true])
  unregister()
  assert.equal(player.audio.targetCount, 0)
  await player.disposeAsync()
})


test('audio target validation fails closed for objects without a supported control method', async () => {
  const { player } = createPlayer()
  assert.throws(() => player.registerAudioTarget({}), TypeError)
  await player.disposeAsync()
})

test('muteOnPause applies temporary mute and restores the user preference', async () => {
  const target = trackedAudioTarget()
  const { player } = createPlayer({ audio: { targets: [target], muteOnPause: true } })
  await player.load()
  player.enter()
  await nextTimer()
  target.mutedCalls.length = 0

  player.pause()
  await nextTimer()
  assert.equal(player.audio.muted, false)
  assert.equal(target.mutedCalls.at(-1), true)

  player.resume()
  await nextTimer()
  assert.equal(target.mutedCalls.at(-1), false)
  await player.disposeAsync()
})

test('player forwards pause and resume lifecycle without requiring muteOnPause', async () => {
  const target = trackedAudioTarget()
  const { player } = createPlayer({ audio: { targets: [target], muteOnPause: false } })
  await player.load()
  player.enter()
  player.pause()
  await nextTimer()
  assert.equal(target.pauseCalls, 1)
  assert.equal(target.mutedCalls.at(-1), false)
  player.resume()
  await nextTimer()
  assert.equal(target.resumeCalls, 1)
  await player.disposeAsync()
})

test('audio disabled rejects public controls and hides audio presentation', async () => {
  const { player, container } = createPlayer({ audio: false })
  await player.load()
  assert.equal(player.audio.enabled, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-audio').hidden, true)
  assert.equal(findByAttribute(container, 'data-anyo-player-pause-audio').hidden, true)
  await assert.rejects(player.unlockAudio(), error => error.code === 'PLAYER_AUDIO_DISABLED')
  await assert.rejects(player.setAudioMuted(true), error => error.code === 'PLAYER_AUDIO_DISABLED')
  await player.disposeAsync()
})

test('audio blocked diagnostics update state and the next UI gesture retries unlock', async () => {
  const target = trackedAudioTarget()
  const { player, container, world } = createPlayer({ audio: { targets: [target], unlockOnEnter: false } })
  await player.load()
  world.emit('audio:blocked', {})
  assert.equal(player.audio.blocked, true)
  const button = findByAttribute(container, 'data-anyo-player-audio')
  assert.equal(button.textContent, 'Enable audio')
  button.click()
  await nextTimer()
  assert.equal(target.unlockCalls, 1)
  assert.equal(player.audio.blocked, false)
  assert.equal(button.textContent, 'Mute audio')
  await player.disposeAsync()
})

test('configurable pause menu exposes working resume, audio, fullscreen, and screenshot actions', async () => {
  const target = trackedAudioTarget()
  const { player, container, document } = createPlayer({
    audio: { targets: [target], unlockOnEnter: false },
    pauseMenu: {
      enabled: true,
      title: 'World options',
      message: 'Choose what happens next.',
      showResume: true,
      showAudio: true,
      showFullscreen: true,
      showScreenshot: true,
    },
  })
  await player.load()
  player.enter()
  player.pause()

  const panel = findByClass(container, 'anyo-player__panel--paused')
  assert.equal(panel.hidden, false)
  assert.equal(panel.getAttribute('aria-label'), 'World options')
  assert.equal(findByClass(panel, 'anyo-player__message').textContent, 'Choose what happens next.')

  findByAttribute(container, 'data-anyo-player-pause-audio').click()
  await nextTimer()
  assert.equal(target.unlockCalls, 1)

  findByAttribute(container, 'data-anyo-player-pause-fullscreen').click()
  await nextTimer()
  assert.equal(document.fullscreenElement, container)

  let captured = 0
  player.on('screenshotcaptured', () => { captured += 1 })
  findByAttribute(container, 'data-anyo-player-pause-screenshot').click()
  await nextTimer()
  assert.equal(captured, 1)

  findByAttribute(container, 'data-anyo-player-pause-resume').click()
  assert.equal(player.state, 'running')
  await player.disposeAsync()
})

test('pause menu can be reduced to a status-only presentation', async () => {
  const { player, container } = createPlayer({ pauseMenu: false })
  await player.load()
  player.pause()
  const panel = findByClass(container, 'anyo-player__panel--paused')
  assert.equal(panel.getAttribute('role'), 'status')
  assert.equal(findByAttribute(container, 'data-anyo-player-pause-resume').hidden, true)
  assert.equal(findByAttribute(container, 'data-anyo-player-pause-audio').hidden, true)
  assert.equal(findByAttribute(container, 'data-anyo-player-pause-fullscreen').hidden, true)
  assert.equal(findByAttribute(container, 'data-anyo-player-pause-screenshot').hidden, true)
  await player.disposeAsync()
})

test('screenshot capture renders the current frame and returns typed metadata', async () => {
  const { player, runtimeFactory } = createPlayer()
  const events = []
  player.on('screenshotcaptured', event => events.push(event))
  await player.load()

  const result = await player.captureScreenshot({ type: 'image/jpeg', quality: 0.8 })
  const renderer = runtimeFactory.created[0].renderer
  assert.equal(renderer.renderCalls.at(-1), 0)
  assert.equal(result.type, 'image/png')
  assert.equal(result.width, 640)
  assert.equal(result.height, 360)
  assert.equal(result.createdAt, '2026-07-25T00:00:00.000Z')
  assert(result.blob instanceof Blob)
  assert.equal(player.canvas.lastToBlob.type, 'image/jpeg')
  assert.equal(player.canvas.lastToBlob.quality, 0.8)
  assert.equal(events.length, 1)
  await player.disposeAsync()
})

test('screenshot failures are typed for invalid state, invalid options, unsupported canvas, and empty output', async () => {
  const { player } = createPlayer()
  const errors = []
  player.on('screenshoterror', error => errors.push(error))
  await assert.rejects(player.captureScreenshot(), error => error.code === 'PLAYER_INVALID_STATE')
  await player.load()
  await assert.rejects(player.captureScreenshot({ quality: 2 }), error => error.code === 'PLAYER_SCREENSHOT_FAILED')
  await assert.rejects(player.captureScreenshot({ type: 'image/gif' }), error => error.code === 'PLAYER_SCREENSHOT_FAILED')

  player.canvas.toBlob = undefined
  await assert.rejects(player.captureScreenshot(), error => error.code === 'PLAYER_SCREENSHOT_UNAVAILABLE')
  player.canvas.toBlob = (callback) => queueMicrotask(() => callback(null))
  await assert.rejects(player.captureScreenshot(), error => error.code === 'PLAYER_SCREENSHOT_FAILED')
  assert.equal(errors.length, 5)
  await player.disposeAsync()
})
