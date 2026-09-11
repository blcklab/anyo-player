import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { ANYO_PLAYER_CSS_TEXT } from '../dist/index.js'
import {
  FakeContainer,
  FakeElement,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
  findByAttribute,
} from './helpers.mjs'

function createPlayer(options = {}, worlds = [new FakeWorld()]) {
  const container = options.container ?? new FakeContainer()
  const player = new AnyoPlayerCore({
    source: { version: '0.6' },
    ...options,
    container,
  }, {
    runtimeFactory: new FakeRuntimeFactory(worlds),
    sourceResolver: new StaticSourceResolver(),
  })
  return { player, container }
}

class FakeShadowRoot extends FakeElement {
  constructor(host) {
    super('#shadow-root', host.ownerDocument)
    this.host = host
  }
}

test('theme tokens apply to the player container, update at runtime, emit, and restore on disposal', async () => {
  const container = new FakeContainer()
  container.style.setProperty('--anyo-player-ui-accent', 'host-accent')
  const { player } = createPlayer({
    container,
    ui: {
      styles: false,
      theme: {
        accent: '#66ddaa',
        panelRadius: '20px',
        fontFamily: 'Inter, sans-serif',
      },
    },
  })

  assert.equal(player.theme.accent, '#66ddaa')
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-accent'), '#66ddaa')
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-panel-radius'), '20px')

  const changes = []
  player.on('themechange', event => changes.push(event.theme))
  const theme = player.setTheme({ accent: '#ffcc66', controlRadius: '4px' })
  assert.deepEqual(theme, { accent: '#ffcc66', controlRadius: '4px' })
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-accent'), '#ffcc66')
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-panel-radius'), '')
  assert.equal(changes.length, 1)

  await player.disposeAsync()
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-accent'), 'host-accent')
  assert.equal(container.style.getPropertyValue('--anyo-player-ui-control-radius'), '')
})

test('auto styling injects the default stylesheet into a ShadowRoot and removes it on disposal', async () => {
  const container = new FakeContainer()
  const shadow = new FakeShadowRoot(container)
  container.getRootNode = () => shadow
  shadow.appendChild(container)

  const { player } = createPlayer({ container })
  const style = findByAttribute(shadow, 'data-anyo-player-styles')
  assert(style)
  assert.match(style.textContent, /\.anyo-player__panel/)
  assert.match(ANYO_PLAYER_CSS_TEXT, /data-anyo-player-adapter-mode/)

  await player.disposeAsync()
  assert.equal(findByAttribute(shadow, 'data-anyo-player-styles'), null)
})

test('external style mode leaves ShadowRoot stylesheet ownership to the host', async () => {
  const container = new FakeContainer()
  const shadow = new FakeShadowRoot(container)
  container.getRootNode = () => shadow
  shadow.appendChild(container)
  const { player } = createPlayer({ container, ui: { styles: { mode: 'external' } } })
  assert.equal(findByAttribute(shadow, 'data-anyo-player-styles'), null)
  await player.disposeAsync()
})

test('UI adapter receives named slots, actions, immutable snapshots, and deterministic cleanup', async () => {
  let context
  const snapshots = []
  let cleanupCount = 0
  let disposeCount = 0
  const adapter = {
    mode: 'replace',
    mount(value) {
      context = value
      const custom = value.root.ownerDocument.createElement('button')
      custom.setAttribute('data-host-enter', '')
      custom.textContent = 'Open custom world'
      custom.addEventListener('click', value.actions.enter)
      value.slots.enter.appendChild(custom)
      return () => { cleanupCount += 1 }
    },
    update(snapshot) { snapshots.push(snapshot) },
    dispose() { disposeCount += 1 },
  }
  const { player, container } = createPlayer({ ui: { adapter } })
  assert(context)
  assert.deepEqual(Object.keys(context.slots).sort(), [
    'controls', 'diagnostic', 'enter', 'error', 'interaction', 'loading', 'pause', 'reticle', 'xr-status',
  ])
  const root = findByAttribute(container, 'data-anyo-player-ui')
  assert.equal(root.getAttribute('data-anyo-player-adapter-mode'), 'replace')
  assert(findByAttribute(container, 'data-host-enter'))

  await player.load()
  assert.equal(context.getSnapshot().phase, 'ready')
  assert.equal(snapshots.at(-1).phase, 'ready')
  assert.equal(Object.isFrozen(snapshots.at(-1)), true)

  context.actions.enter()
  assert.equal(player.state, 'running')
  await player.disposeAsync()
  assert.equal(cleanupCount, 1)
  assert.equal(disposeCount, 1)
})

test('UI adapter failures are isolated and surfaced through the host warning callback', async () => {
  const warnings = []
  const { player } = createPlayer({
    onWarning: message => warnings.push(message),
    ui: {
      adapter: {
        mount() { throw new Error('adapter mount exploded') },
      },
    },
  })
  assert.match(warnings[0], /adapter mount exploded/)
  await player.load()
  assert.equal(player.state, 'ready')
  await player.disposeAsync()
})


test('exported CSS text stays byte-identical to the published stylesheet source', async () => {
  const sourceCss = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.equal(ANYO_PLAYER_CSS_TEXT, sourceCss)
})
