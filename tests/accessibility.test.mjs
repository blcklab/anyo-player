import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeDocument,
  FakeMediaQueryList,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  fakeEvent,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function nextTimer() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createPlayer(options = {}, document = new FakeDocument(), world = new FakeWorld()) {
  const container = new FakeContainer(document)
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { pointerLock: false },
    ...options,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
  })
  return { player, container, document, world }
}

test('system reduced-motion preference is observable, overridable, and restored on disposal', async () => {
  const document = new FakeDocument()
  const media = new FakeMediaQueryList('(prefers-reduced-motion: reduce)')
  media.matches = false
  document.defaultView.matchMedia = () => media
  const { player, container } = createPlayer({}, document)
  const changes = []
  player.on('reducedmotionchange', event => changes.push(event))

  assert.equal(player.reducedMotionPreference, 'system')
  assert.equal(player.reducedMotion, false)
  assert.equal(container.getAttribute('data-anyo-player-reduced-motion'), 'false')

  media.matches = true
  media.trigger()
  assert.equal(player.reducedMotion, true)
  assert.deepEqual(changes.at(-1), { previous: false, reducedMotion: true, preference: 'system' })

  assert.equal(player.setReducedMotion(false), false)
  media.matches = false
  media.trigger()
  assert.equal(player.reducedMotion, false)
  assert.equal(player.setReducedMotion('system'), false)

  await player.disposeAsync()
  assert.equal(container.getAttribute('data-anyo-player-reduced-motion'), null)
  assert.equal(media.listeners.has('change'), false)
})

test('canvas semantics and instructions reflect live input rebinding', async () => {
  const { player, container } = createPlayer()
  await player.load()

  const instructions = findByAttribute(container, 'data-anyo-player-instructions')
  const enter = findByAttribute(container, 'data-anyo-player-enter')
  const pause = findByAttribute(container, 'data-anyo-player-pause')
  const interaction = findByClass(container, 'anyo-player__interaction-action')
  assert(instructions)
  assert.equal(player.canvas.getAttribute('aria-roledescription'), 'Interactive 3D world')
  assert.match(player.canvas.getAttribute('aria-describedby'), /anyo-player-instructions-/)
  assert.match(instructions.textContent, /Move with W/i)
  assert.equal(enter.getAttribute('aria-keyshortcuts'), 'Enter Space')
  assert.equal(pause.getAttribute('aria-keyshortcuts'), 'P')
  assert.equal(interaction.getAttribute('aria-keyshortcuts'), 'E')

  player.setInputBindings({
    'move-forward': [{ device: 'keyboard', code: 'KeyI' }],
    interact: [{ device: 'keyboard', code: 'Enter' }],
  })
  assert.match(instructions.textContent, /Move with I/i)
  assert.equal(interaction.getAttribute('aria-keyshortcuts'), 'Enter')

  await player.disposeAsync()
  assert.equal(player.canvas.getAttribute('aria-describedby'), null)
  assert.equal(player.canvas.getAttribute('aria-roledescription'), null)
})

test('keyboard users can enter with Enter or Space and pause without a pointer gesture', async () => {
  const { player, document } = createPlayer()
  await player.load()
  player.canvas.focus()

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Enter', repeat: false }))
  assert.equal(player.state, 'running')
  assert.equal(player.inputMode, 'desktop')
  assert.equal(player.inputModality, 'keyboard')

  player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'KeyP', repeat: false }))
  assert.equal(player.state, 'paused')
  const pause = findByAttribute(player.container, 'data-anyo-player-pause')
  assert.equal(document.activeElement, pause)

  await player.disposeAsync()
})

test('keyboard focus management and toolbar roving navigation use native controls', async () => {
  const document = new FakeDocument()
  const { player, container } = createPlayer({}, document)
  document.dispatchEvent(fakeEvent('keydown', { code: 'Tab' }))
  await player.load()

  const enter = findByAttribute(container, 'data-anyo-player-enter')
  const pause = findByAttribute(container, 'data-anyo-player-pause')
  const fullscreen = findByAttribute(container, 'data-anyo-player-fullscreen')
  const controls = findByClass(container, 'anyo-player__controls')
  assert.equal(document.activeElement, enter)
  assert.equal(pause.tabIndex, 0)
  assert.equal(fullscreen.tabIndex, -1)

  pause.focus()
  controls.dispatchEvent(fakeEvent('keydown', { code: 'ArrowRight' }))
  assert.equal(document.activeElement, fullscreen)
  assert.equal(fullscreen.tabIndex, 0)
  controls.dispatchEvent(fakeEvent('keydown', { code: 'Home' }))
  assert.equal(document.activeElement, pause)

  await player.disposeAsync()
  assert.equal(controls.listeners.has('keydown'), false)
})

test('fatal errors focus retry only for keyboard modality', async () => {
  const document = new FakeDocument()
  const container = new FakeContainer(document)
  const player = new AnyoPlayerCore({ container }, {
    runtimeFactory: new FakeRuntimeFactory(),
    sourceResolver: new StaticSourceResolver(),
  })
  document.dispatchEvent(fakeEvent('keydown', { code: 'Tab' }))
  await assert.rejects(player.load())
  assert.equal(document.activeElement, findByAttribute(container, 'data-anyo-player-retry'))
  await player.disposeAsync()
})

test('public announcements use dedicated polite and assertive live regions', async () => {
  const { player, container } = createPlayer()
  player.announce('Checkpoint saved')
  await nextTimer()
  assert.equal(findByAttribute(container, 'data-anyo-player-live-polite').textContent, 'Checkpoint saved')

  player.announce('Connection lost', { priority: 'assertive' })
  await nextTimer()
  assert.equal(findByAttribute(container, 'data-anyo-player-live-assertive').textContent, 'Connection lost')
  await player.disposeAsync()
})

test('input modality changes are typed and accessibility can be disabled', async () => {
  const document = new FakeDocument()
  const { player, container } = createPlayer({}, document)
  const changes = []
  player.on('inputmodalitychange', event => changes.push(event))
  document.dispatchEvent(fakeEvent('keydown', { code: 'Tab' }))
  document.dispatchEvent(fakeEvent('pointerdown', { pointerType: 'mouse' }))
  document.dispatchEvent(fakeEvent('touchstart'))
  assert.deepEqual(changes.map(value => value.modality), ['keyboard', 'pointer', 'touch'])
  await player.disposeAsync()

  const disabled = createPlayer({ accessibility: false })
  await disabled.player.load()
  assert.equal(findByAttribute(disabled.container, 'data-anyo-player-instructions'), null)
  disabled.player.canvas.dispatchEvent(fakeEvent('keydown', { code: 'Enter', repeat: false }))
  assert.equal(disabled.player.state, 'ready')
  await disabled.player.disposeAsync()
})
