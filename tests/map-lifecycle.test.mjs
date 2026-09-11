import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { FakeContainer, FakeDocument, FakeRuntimeFactory, FakeWorld, StaticSourceResolver, findByAttribute } from './helpers.mjs'

function createPlayer(options = {}) {
  const document = new FakeDocument()
  const container = new FakeContainer(document)
  const world = new FakeWorld()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { pointerLock: false },
    ...options,
  }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(),
    now: () => new Date('2026-07-30T00:00:00.000Z'),
  })
  return { player, container }
}

test('registered Map targets receive host lifecycle and visible attribution', async () => {
  const { player, container } = createPlayer()
  let pauses = 0
  let resumes = 0
  const unregister = player.registerMapTarget({
    onPause() { pauses += 1 },
    onResume() { resumes += 1 },
    getAttribution() { return '© OpenStreetMap contributors' },
  })
  const attribution = findByAttribute(container, 'data-anyo-player-map-attribution')
  assert.equal(attribution.textContent, '© OpenStreetMap contributors')
  assert.equal(attribution.hidden, false)
  await player.load()
  player.pause()
  player.resume()
  assert.equal(pauses, 1)
  assert.equal(resumes, 1)
  unregister()
  assert.equal(attribution.hidden, true)
  await player.disposeAsync()
})


test('Map attribution updates after target world setup through subscriptions', async () => {
  const { player, container } = createPlayer()
  let attribution = null
  let listener = null
  let unsubscribed = false
  const target = {
    onPause() {},
    onResume() {},
    getAttribution() { return attribution },
    onAttributionChange(next) {
      listener = next
      next(attribution)
      return () => { unsubscribed = true }
    },
  }
  const unregister = player.registerMapTarget(target)
  const node = findByAttribute(container, 'data-anyo-player-map-attribution')
  assert.equal(node.hidden, true)
  attribution = '© OpenStreetMap contributors'
  listener(attribution)
  assert.equal(node.textContent, '© OpenStreetMap contributors')
  assert.equal(node.hidden, false)
  attribution = null
  listener(attribution)
  assert.equal(node.hidden, true)
  unregister()
  assert.equal(unsubscribed, true)
  await player.disposeAsync()
})

test('manual Map attribution and final disposal remain deterministic', async () => {
  const { player, container } = createPlayer()
  const attribution = findByAttribute(container, 'data-anyo-player-map-attribution')
  player.setMapAttribution('Custom geographic source')
  assert.equal(attribution.textContent, 'Custom geographic source')
  player.setMapAttribution(null)
  assert.equal(attribution.hidden, true)
  assert.throws(() => player.registerMapTarget({}), TypeError)
  await player.disposeAsync()
  assert.equal(attribution.hidden, true)
})
