import { createAnyoPlayer } from '@blcklab/anyo-player'
import { defineAnyoPlayerElement } from '@blcklab/anyo-player/element'

const firstWorld = {
  version: '0.6',
  environment: { background: '#182033', ambientLight: { color: '#ffffff', intensity: 0.8 } },
  entities: [
    { id: 'first-box', type: 'box', position: [0, 1, -4], size: [1, 1, 1] },
  ],
  exploration: { spawn: { position: [0, 1.65, 2] }, pointerLock: false },
}

const secondWorld = {
  version: '0.6',
  environment: { background: '#24182f', ambientLight: { color: '#ffffff', intensity: 0.8 } },
  entities: [
    { id: 'second-box', type: 'box', position: [0, 1, -3], size: [1.5, 1.5, 1.5] },
  ],
  exploration: { spawn: { position: [0, 1.65, 2] }, pointerLock: false },
}

const result = document.querySelector('#result')
const log = []
function assert(condition, message) {
  if (!condition) throw new Error(message)
  log.push(`PASS ${message}`)
}

try {
  const playerA = createAnyoPlayer({
    container: document.querySelector('#player-a'),
    source: firstWorld,
    renderer: { backend: 'webgl2', antialias: false },
    exploration: { desktop: false, touch: false, vr: false },
    resize: { pixelRatio: 1 },
    ui: false,
  })
  const playerB = createAnyoPlayer({
    container: document.querySelector('#player-b'),
    source: firstWorld,
    renderer: { backend: 'webgl2', antialias: false },
    exploration: { desktop: false, touch: false, vr: false },
    resize: { pixelRatio: 1 },
    ui: false,
  })

  await Promise.all([playerA.load(), playerB.load()])
  assert(playerA.state === 'ready' && playerB.state === 'ready', 'two real browser players load independently')
  assert(playerA.world !== playerB.world, 'embedded players own separate Anyo worlds')
  assert(playerA.canvas !== playerB.canvas, 'embedded players own separate canvases')

  const originalWorld = playerA.world
  let replaced = false
  playerA.on('worldreplaced', () => { replaced = true })
  await playerA.replaceWorld(secondWorld)
  assert(playerA.world === originalWorld, 'replacement reuses the active Anyo runtime')
  assert(playerA.state === 'ready' && playerA.phase === 'ready', 'replacement returns to deterministic readiness')
  assert(replaced, 'replacement emits the public worldreplaced event')

  defineAnyoPlayerElement()
  const element = document.createElement('anyo-player')
  element.source = firstWorld
  element.options = {
    renderer: { backend: 'webgl2', antialias: false },
    exploration: { desktop: false, touch: false, vr: false },
    resize: { pixelRatio: 1 },
    ui: false,
  }
  const elementHost = document.querySelector('#element-host')
  elementHost.appendChild(element)
  await element.load()
  assert(element.player?.state === 'ready', 'custom element delegates loading to the framework-neutral player')
  assert(Boolean(element.shadowRoot), 'custom element owns an open Shadow Root')
  assert(element.shadowRoot.querySelector('[data-anyo-player-styles]'), 'custom element receives Player Shadow DOM styles')
  await element.replaceWorld(secondWorld)
  assert(element.player?.state === 'ready', 'custom element replaces worlds without rebuilding its adapter')
  await element.disposeAsync()
  element.remove()

  await Promise.all([playerA.disposeAsync(), playerB.disposeAsync()])
  assert(playerA.state === 'disposed' && playerB.state === 'disposed', 'browser players dispose asynchronously')
  assert(document.querySelectorAll('canvas').length === 0, 'owned browser canvases are removed')

  document.documentElement.dataset.smoke = 'pass'
  result.textContent = `ANYO_PLAYER_BROWSER_SMOKE_PASS\n${log.join('\n')}`
} catch (error) {
  document.documentElement.dataset.smoke = 'fail'
  result.textContent = `ANYO_PLAYER_BROWSER_SMOKE_FAIL\n${error?.stack ?? error}`
}
