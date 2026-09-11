import assert from 'node:assert/strict'
import test from 'node:test'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { AnyoPlayerError } from '../dist/errors.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  fakeEvent,
  findByAttribute,
  findByClass,
} from './helpers.mjs'

function interactivePrimitive(overrides = {}) {
  return {
    id: 'primitive-1',
    entityId: 'product-1',
    transform: { position: [0, 1, -3] },
    visible: true,
    interaction: {
      action: 'open-product',
      params: { sku: 'SKU-1' },
      distance: 5,
    },
    data: {
      interactionPrompt: {
        title: 'Product',
        text: 'Open product details',
        description: 'View specifications and availability.',
        actionLabel: 'View details',
        ariaLabel: 'Open product details for SKU-1',
      },
    },
    ...overrides,
  }
}

function createReticlePlayer({
  worldOptions = {},
  interaction = {},
  exploration = {},
  ui = {},
} = {}) {
  const primitive = interactivePrimitive()
  const world = new FakeWorld({
    primitives: [primitive],
    pickResult: { primitiveId: primitive.id, distance: 2 },
    ...worldOptions,
  })
  const runtimeFactory = new FakeRuntimeFactory([world])
  const container = new FakeContainer()
  const player = new AnyoPlayerCore({
    container,
    source: { version: '0.6' },
    exploration: { touch: false, ...exploration },
    interaction,
    ui,
  }, {
    runtimeFactory,
    sourceResolver: new StaticSourceResolver({ version: '0.6' }),
  })
  return { player, world, container, runtimeFactory, primitive }
}

function key(code) {
  return fakeEvent('keydown', { code, repeat: false })
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('pointer-lock reticle targets the canvas center and exposes rich accessible prompt state', async () => {
  const { player, container, runtimeFactory } = createReticlePlayer()
  const targetChanges = []
  player.on('interactiontargetchange', event => targetChanges.push(event.target))
  await player.load()
  player.canvas.click()

  assert.equal(player.state, 'running')
  assert.equal(player.reticle.visible, true)
  assert.equal(player.reticle.active, true)
  assert.equal(player.interactionTarget.available, true)
  assert.equal(player.interactionTarget.primitiveId, 'primitive-1')
  assert.equal(runtimeFactory.created[0].renderer.pickCalls[0].clientX, 320)
  assert.equal(runtimeFactory.created[0].renderer.pickCalls[0].clientY, 180)

  const reticle = findByAttribute(container, 'data-anyo-player-reticle')
  assert.equal(reticle.hidden, false)
  assert.equal(reticle.getAttribute('data-active'), 'true')

  const prompt = findByAttribute(container, 'data-anyo-player-interaction-prompt')
  assert.equal(prompt.hidden, false)
  assert.equal(player.interactionPrompt.title, 'Product')
  assert.equal(player.interactionPrompt.text, 'Open product details')
  assert.equal(player.interactionPrompt.description, 'View specifications and availability.')
  assert.equal(player.interactionPrompt.actionLabel, 'View details')
  assert.equal(player.interactionPrompt.inputHint, 'Press E')
  assert.equal(player.interactionPrompt.ariaLabel, 'Open product details for SKU-1')
  assert.equal(player.interactionPrompt.actionAvailable, true)
  assert.equal(targetChanges.at(-1).available, true)
  await player.disposeAsync()
})

test('keyboard and accessible action button activate the current target through Anyo selection', async () => {
  const { player, world, container } = createReticlePlayer({ interaction: { selectionDuration: 0 } })
  const activated = []
  player.on('interactionactivated', event => activated.push(event))
  await player.load()
  player.canvas.click()

  const event = key('KeyE')
  player.canvas.dispatchEvent(event)
  await tick()
  assert.equal(event.defaultPrevented, true)
  assert.equal(world.selections.length, 1)
  assert.equal(world.selections[0].source, 'crosshair')
  assert.equal(activated[0].selected, true)

  const action = findByClass(container, 'anyo-player__interaction-action')
  assert.equal(action.hidden, false)
  action.click()
  await tick()
  assert.equal(world.selections.length, 2)
  assert.equal(world.selections[1].source, 'crosshair')
  await player.disposeAsync()
})

test('custom activation keys work and unrelated keys remain untouched', async () => {
  const { player, world } = createReticlePlayer({ interaction: { activateKeys: ['Enter'] } })
  await player.load()
  player.canvas.click()

  const ignored = key('KeyE')
  player.canvas.dispatchEvent(ignored)
  await tick()
  assert.equal(ignored.defaultPrevented, false)
  assert.equal(world.selections.length, 0)

  assert.equal(player.interactionPrompt.inputHint, 'Press Enter')

  const accepted = key('Enter')
  player.canvas.dispatchEvent(accepted)
  await tick()
  assert.equal(accepted.defaultPrevented, true)
  assert.equal(world.selections.length, 1)
  await player.disposeAsync()
})

test('reticle respects authored and host maximum distances', async () => {
  const tooFar = createReticlePlayer({
    worldOptions: { pickResult: { primitiveId: 'primitive-1', distance: 8 } },
  })
  await tooFar.player.load()
  tooFar.player.canvas.click()
  assert.equal(tooFar.player.interactionTarget.available, false)
  assert.equal(tooFar.player.reticle.active, false)
  assert.equal(await tooFar.player.interact(), false)
  await tooFar.player.disposeAsync()

  const hostLimited = createReticlePlayer({
    worldOptions: { pickResult: { primitiveId: 'primitive-1', distance: 3 } },
    interaction: { reticle: { maxDistance: 2 } },
  })
  await hostLimited.player.load()
  hostLimited.player.canvas.click()
  assert.equal(hostLimited.player.interactionTarget.available, false)
  await hostLimited.player.disposeAsync()
})

test('pointer-lock exit, pause, and disposal clear reticle targets and presentation', async () => {
  const { player, container } = createReticlePlayer()
  const changes = []
  player.on('interactiontargetchange', event => changes.push(event.target))
  await player.load()
  player.canvas.click()
  assert.equal(player.interactionTarget.available, true)

  player.canvas.ownerDocument.exitPointerLock()
  assert.equal(player.state, 'ready')
  assert.equal(player.reticle.visible, false)
  assert.equal(player.interactionTarget.available, false)
  assert.equal(findByAttribute(container, 'data-anyo-player-reticle').hidden, true)
  assert.equal(changes.at(-1).available, false)

  player.enter()
  player.pause()
  assert.equal(player.reticle.visible, false)
  await player.disposeAsync()
  assert.equal(player.canvas.captureListeners.get('keydown')?.size ?? 0, 0)
})

test('running reticle mode supports non-pointer-lock desktop worlds', async () => {
  const { player } = createReticlePlayer({
    exploration: { pointerLock: false },
    interaction: { reticle: { mode: 'running' } },
  })
  await player.load()
  player.enter()
  assert.equal(player.pointerLocked, false)
  assert.equal(player.reticle.visible, true)
  assert.equal(player.interactionTarget.available, true)
  await player.disposeAsync()
})

test('rich prompt resolver can override data while null suppresses presentation', async () => {
  const resolved = createReticlePlayer({
    interaction: {
      resolvePrompt: context => ({
        title: context.action,
        text: 'Resolved interaction',
        description: `Distance ${context.distance}`,
        actionLabel: 'Activate',
        inputHint: 'Use interaction key',
      }),
    },
  })
  await resolved.player.load()
  resolved.player.canvas.click()
  assert.equal(resolved.player.interactionPrompt.title, 'open-product')
  assert.equal(resolved.player.interactionPrompt.text, 'Resolved interaction')
  assert.equal(resolved.player.interactionPrompt.actionLabel, 'Activate')
  await resolved.player.disposeAsync()

  const suppressed = createReticlePlayer({ interaction: { resolvePrompt: () => null } })
  await suppressed.player.load()
  suppressed.player.canvas.click()
  assert.equal(suppressed.player.interactionTarget.available, true)
  assert.equal(suppressed.player.interactionPrompt.visible, false)
  await suppressed.player.disposeAsync()
})

test('interaction activation failures emit a typed non-fatal error', async () => {
  const { player } = createReticlePlayer({
    worldOptions: { selectPrimitive: async () => { throw new Error('selection failed') } },
  })
  const errors = []
  player.on('interactionerror', error => errors.push(error))
  await player.load()
  player.canvas.click()

  await assert.rejects(player.interact(), error => {
    assert.ok(error instanceof AnyoPlayerError)
    assert.equal(error.code, 'PLAYER_INTERACTION_FAILED')
    return true
  })
  assert.equal(errors.length, 1)
  assert.equal(player.state, 'running')
  await player.disposeAsync()
})
