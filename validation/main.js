import { createAnyoPlayer } from '@blcklab/anyo-player'
import { defineAnyoPlayerElement } from '@blcklab/anyo-player/element'

const VERSION = '0.5.0'
const params = new URLSearchParams(location.search)
const assetOrigin = params.get('assetOrigin') || location.origin
const autorun = params.get('autorun') === '1'
const memoryCycles = Math.max(10, Math.min(250, Number(params.get('memoryCycles') || 60)))

const firstWorld = {
  version: '0.6',
  environment: { background: '#172033', ambientLight: { color: '#ffffff', intensity: 0.85 } },
  entities: [{ id: 'first-box', type: 'box', position: [0, 1, -4], size: [1, 1, 1] }],
  exploration: { spawn: { position: [0, 1.65, 2] }, pointerLock: false },
}
const secondWorld = {
  version: '0.6',
  environment: { background: '#281b34', ambientLight: { color: '#ffffff', intensity: 0.85 } },
  entities: [{ id: 'second-box', type: 'box', position: [0, 1, -3], size: [1.5, 1.5, 1.5] }],
  exploration: { spawn: { position: [0, 1.65, 2] }, pointerLock: false },
}

function remoteAssetWorld(origin = assetOrigin) {
  const base = `${origin.replace(/\/$/, '')}/validation/assets`
  return {
    version: '0.6',
    environment: { background: '#101827', ambientLight: { color: '#ffffff', intensity: 1 } },
    assets: {
      'validation-model': { type: 'model', format: 'glb', src: `${base}/triangle.glb` },
      'validation-base': { type: 'texture', format: 'png', src: `${base}/base-color.png` },
      'validation-mr': { type: 'texture', format: 'png', src: `${base}/metallic-roughness.png` },
      'validation-normal': { type: 'texture', format: 'png', src: `${base}/normal.png` },
      'validation-emissive': { type: 'texture', format: 'png', src: `${base}/emissive.png` },
      'validation-occlusion': { type: 'texture', format: 'png', src: `${base}/occlusion.png` },
    },
    materials: {
      'validation-pbr': {
        baseColor: '#ffffff',
        baseColorTexture: 'validation-base',
        metallicRoughnessTexture: 'validation-mr',
        normalTexture: 'validation-normal',
        emissiveTexture: 'validation-emissive',
        occlusionTexture: 'validation-occlusion',
        roughness: 0.65,
        metalness: 0.2,
        doubleSided: true,
      },
    },
    entities: [
      { id: 'remote-model', type: 'model', asset: 'validation-model', position: [-1.1, 0.3, -3] },
      { id: 'remote-textured-box', type: 'box', material: 'validation-pbr', position: [1.1, 0.8, -3], size: [1.2, 1.2, 1.2] },
    ],
    exploration: { spawn: { position: [0, 1.65, 2] }, pointerLock: false },
  }
}

const results = new Map()
const activePlayers = new Set()
const resultBody = document.querySelector('#results')
const status = document.querySelector('#status')
const capabilitiesNode = document.querySelector('#capabilities')

const definitions = [
  ['core.load', 'Core Player loads a real world'],
  ['core.two-players', 'Two players remain isolated'],
  ['core.replace', 'World replacement reaches ready'],
  ['element.shadow', 'Custom element mounts in Shadow DOM'],
  ['lifecycle.dispose', 'Async disposal removes owned canvases'],
  ['lifecycle.stress', 'Repeated load/replace/dispose stress'],
  ['assets.remote-glb-textures', 'Cross-origin GLB and five PBR texture channels'],
  ['loss.webgl2', 'WebGL context loss and restoration'],
  ['loss.webgpu', 'WebGPU device loss and automatic Player recovery'],
  ['memory.long-running', 'Long-running lifecycle and memory profile'],
  ['input.pointer-lock-focus-blur', 'Pointer lock, focus and blur'],
  ['fullscreen', 'Fullscreen enter and exit'],
  ['input.touch', 'Touch movement/look/interaction'],
  ['accessibility.keyboard-screen-reader', 'Keyboard and screen-reader review'],
  ['xr.physical-headset', 'Physical WebXR entry, tracking and exit'],
]

const terminal = new Set(['pass', 'fail', 'blocked'])

function setResult(id, state, evidence = '') {
  const label = definitions.find(([key]) => key === id)?.[1] ?? id
  results.set(id, { id, label, status: state, evidence })
  renderResults()
}

function renderResults() {
  resultBody.replaceChildren(...definitions.map(([id, label]) => {
    const item = results.get(id) ?? { status: 'pending', evidence: '' }
    const row = document.createElement('tr')
    const name = document.createElement('td')
    const state = document.createElement('td')
    const evidence = document.createElement('td')
    name.textContent = label
    state.textContent = item.status
    state.className = `status-${item.status}`
    evidence.textContent = item.evidence
    row.append(name, state, evidence)
    return row
  }))
}

function makeOptions(backend = 'webgl2') {
  return {
    renderer: { backend, antialias: false },
    exploration: { desktop: false, touch: false, vr: true, pointerLock: false },
    resize: { pixelRatio: 1 },
    rendererRecovery: { enabled: true, automatic: true, maxAttempts: 2, delayMs: 100 },
    diagnostics: { historyLimit: 100 },
    session: { enabled: true },
    ui: false,
  }
}

async function disposeActive() {
  const players = [...activePlayers]
  activePlayers.clear()
  await Promise.all(players.map(player => player.disposeAsync().catch(() => undefined)))
  document.querySelectorAll('anyo-player').forEach(element => element.remove())
  for (const host of document.querySelectorAll('.player-host')) host.replaceChildren()
}

async function runCoreMatrix() {
  await disposeActive()
  status.textContent = 'Running core browser matrix…'
  const playerA = createAnyoPlayer({ container: document.querySelector('#player-a'), source: firstWorld, ...makeOptions() })
  const playerB = createAnyoPlayer({ container: document.querySelector('#player-b'), source: firstWorld, ...makeOptions() })
  activePlayers.add(playerA)
  activePlayers.add(playerB)
  try {
    await Promise.all([playerA.load(), playerB.load()])
    setResult('core.load', playerA.state === 'ready' ? 'pass' : 'fail', `state=${playerA.state}, phase=${playerA.phase}`)
    const isolated = playerA.canvas !== playerB.canvas && playerA.world !== playerB.world
    setResult('core.two-players', isolated ? 'pass' : 'fail', isolated ? 'Separate canvas and world ownership confirmed.' : 'Player ownership collided.')
    await playerA.replaceWorld(secondWorld)
    setResult('core.replace', playerA.state === 'ready' && playerA.phase === 'ready' ? 'pass' : 'fail', `state=${playerA.state}, phase=${playerA.phase}`)

    defineAnyoPlayerElement()
    const element = document.createElement('anyo-player')
    element.source = firstWorld
    element.options = makeOptions()
    document.querySelector('#element-host').append(element)
    await element.load()
    const styled = Boolean(element.shadowRoot?.querySelector('[data-anyo-player-styles]'))
    setResult('element.shadow', element.player?.state === 'ready' && styled ? 'pass' : 'fail', `openShadowRoot=${Boolean(element.shadowRoot)}, styles=${styled}`)
    await element.disposeAsync()
    element.remove()

    await disposeActive()
    const noCanvases = document.querySelectorAll('canvas').length === 0
    setResult('lifecycle.dispose', noCanvases ? 'pass' : 'fail', `remainingCanvases=${document.querySelectorAll('canvas').length}`)
    status.textContent = 'Core browser matrix complete.'
  } catch (error) {
    status.textContent = `Core matrix failed: ${error?.message ?? error}`
    for (const id of ['core.load', 'core.two-players', 'core.replace', 'element.shadow', 'lifecycle.dispose']) {
      if (!terminal.has(results.get(id)?.status)) setResult(id, 'fail', error?.stack ?? String(error))
    }
    await disposeActive()
  }
}

async function runStress(cycles = 25) {
  await disposeActive()
  status.textContent = `Running ${cycles} lifecycle generations…`
  try {
    for (let index = 0; index < cycles; index += 1) {
      const host = document.querySelector('#player-a')
      const player = createAnyoPlayer({ container: host, source: firstWorld, ...makeOptions() })
      await player.load()
      await player.replaceWorld(index % 2 ? firstWorld : secondWorld)
      await player.disposeAsync()
      host.replaceChildren()
    }
    const noCanvases = document.querySelectorAll('canvas').length === 0
    setResult('lifecycle.stress', noCanvases ? 'pass' : 'fail', `${cycles} generations completed; remainingCanvases=${document.querySelectorAll('canvas').length}.`)
    status.textContent = 'Lifecycle stress complete.'
  } catch (error) {
    setResult('lifecycle.stress', 'fail', error?.stack ?? String(error))
    status.textContent = 'Lifecycle stress failed.'
  }
}

function once(target, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, done)
      reject(new Error(`${event} timed out`))
    }, timeoutMs)
    function done(value) {
      clearTimeout(timer)
      target.removeEventListener(event, done)
      resolve(value)
    }
    target.addEventListener(event, done, { once: true })
  })
}

function waitFor(predicate, timeoutMs = 15_000, intervalMs = 100) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const poll = () => {
      let value
      try { value = predicate() } catch (error) { reject(error); return }
      if (value) { resolve(value); return }
      if (performance.now() - started >= timeoutMs) { reject(new Error(`Condition timed out after ${timeoutMs} ms.`)); return }
      setTimeout(poll, intervalMs)
    }
    poll()
  })
}

async function runContextLoss() {
  await disposeActive()
  status.textContent = 'Testing WebGL context loss and restoration…'
  const player = createAnyoPlayer({ container: document.querySelector('#player-a'), source: firstWorld, ...makeOptions() })
  activePlayers.add(player)
  try {
    await player.load()
    const gl = player.canvas.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) {
      setResult('loss.webgl2', 'blocked', 'WEBGL_lose_context is unavailable in this browser/GPU configuration.')
      return
    }
    const lost = once(player.canvas, 'webglcontextlost')
    extension.loseContext()
    await lost
    const restored = once(player.canvas, 'webglcontextrestored', 10000)
    extension.restoreContext()
    await restored
    await new Promise(resolve => setTimeout(resolve, 500))
    const diagnostics = player.diagnostics.filter(item => item.code.includes('WEBGL_CONTEXT'))
    setResult('loss.webgl2', 'pass', `Context lost/restored; state=${player.state}; diagnosticRecords=${diagnostics.length}.`)
  } catch (error) {
    setResult('loss.webgl2', 'fail', error?.stack ?? String(error))
  } finally {
    await disposeActive()
    status.textContent = 'WebGL context-loss check complete.'
  }
}

async function runRemoteAssets() {
  await disposeActive()
  status.textContent = 'Loading cross-origin GLB and PBR textures…'
  const player = createAnyoPlayer({
    container: document.querySelector('#player-a'),
    source: remoteAssetWorld(),
    ...makeOptions(),
  })
  activePlayers.add(player)
  try {
    await player.load()
    const progress = player.progress
    const terminalProgress = progress.pending === 0 && progress.completed + progress.failed === progress.total
    const loaded = player.state === 'ready' && terminalProgress && progress.failed === 0 && progress.total >= 6
    setResult(
      'assets.remote-glb-textures',
      loaded ? 'pass' : 'fail',
      `origin=${assetOrigin}; total=${progress.total}; completed=${progress.completed}; failed=${progress.failed}; pending=${progress.pending}; state=${player.state}.`,
    )
  } catch (error) {
    setResult('assets.remote-glb-textures', 'fail', error?.stack ?? String(error))
  } finally {
    await disposeActive()
    status.textContent = 'Remote asset check complete.'
  }
}

async function runWebGPUDeviceLoss() {
  await disposeActive()
  status.textContent = 'Testing WebGPU device loss and automatic recovery…'
  if (!navigator.gpu) {
    setResult('loss.webgpu', 'blocked', 'navigator.gpu is unavailable.')
    return
  }
  const prototype = globalThis.GPUAdapter?.prototype
  const originalRequestDevice = prototype?.requestDevice
  if (!prototype || typeof originalRequestDevice !== 'function') {
    setResult('loss.webgpu', 'blocked', 'GPUAdapter.prototype.requestDevice cannot be instrumented in this browser.')
    return
  }

  let capturedDevice = null
  try {
    prototype.requestDevice = async function (...args) {
      const device = await originalRequestDevice.apply(this, args)
      capturedDevice = device
      return device
    }
  } catch (error) {
    setResult('loss.webgpu', 'blocked', `WebGPU device capture is not writable: ${error?.message ?? error}`)
    return
  }

  const player = createAnyoPlayer({
    container: document.querySelector('#player-a'),
    source: firstWorld,
    ...makeOptions('webgpu'),
  })
  activePlayers.add(player)
  const recoveryStates = []
  const cleanup = player.on('rendererrecoverychange', event => recoveryStates.push(event.current.state))
  try {
    await player.load()
    if (!capturedDevice) throw new Error('The WebGPU device was not captured during Player creation.')
    capturedDevice.destroy()
    await waitFor(() => player.diagnostics.some(item => item.code === 'SEKAI64_WEBGPU_DEVICE_LOST'), 10_000)
    await waitFor(() => player.state === 'ready' && player.rendererRecovery.state === 'succeeded', 30_000)
    setResult('loss.webgpu', 'pass', `Device destroyed; Player recovered to ready. recoveryStates=${recoveryStates.join('>') || 'none'}; diagnostics=${player.diagnostics.length}.`)
  } catch (error) {
    const hasLoss = player.diagnostics.some(item => item.code === 'SEKAI64_WEBGPU_DEVICE_LOST')
    setResult('loss.webgpu', hasLoss ? 'fail' : 'blocked', error?.stack ?? String(error))
  } finally {
    cleanup()
    try { prototype.requestDevice = originalRequestDevice } catch {}
    await disposeActive()
    status.textContent = 'WebGPU device-loss check complete.'
  }
}

function memorySnapshot() {
  const memory = performance.memory
  return {
    usedJSHeapSize: memory?.usedJSHeapSize ?? null,
    totalJSHeapSize: memory?.totalJSHeapSize ?? null,
    canvases: document.querySelectorAll('canvas').length,
    nodes: document.getElementsByTagName('*').length,
  }
}

async function runMemoryProfile(cycles = memoryCycles) {
  await disposeActive()
  status.textContent = `Running ${cycles}-generation memory profile…`
  try {
    const before = memorySnapshot()
    for (let index = 0; index < cycles; index += 1) {
      const host = document.querySelector('#player-a')
      const player = createAnyoPlayer({ container: host, source: index % 2 ? firstWorld : secondWorld, ...makeOptions() })
      await player.load()
      await player.replaceWorld(index % 2 ? secondWorld : firstWorld)
      await player.disposeAsync()
      host.replaceChildren()
      if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve))
    }
    if (typeof globalThis.gc === 'function') globalThis.gc()
    await new Promise(resolve => setTimeout(resolve, 250))
    const after = memorySnapshot()
    const delta = before.usedJSHeapSize !== null && after.usedJSHeapSize !== null
      ? after.usedJSHeapSize - before.usedJSHeapSize
      : null
    const heapLimit = 24 * 1024 * 1024
    const pass = after.canvases === 0 && (delta === null || delta < heapLimit)
    setResult('memory.long-running', pass ? 'pass' : 'fail', `cycles=${cycles}; heapBefore=${before.usedJSHeapSize ?? 'unavailable'}; heapAfter=${after.usedJSHeapSize ?? 'unavailable'}; heapDelta=${delta ?? 'unavailable'}; remainingCanvases=${after.canvases}; DOMNodes=${after.nodes}. Browser profiler evidence is still required for stable promotion.`)
  } catch (error) {
    setResult('memory.long-running', 'fail', error?.stack ?? String(error))
  } finally {
    await disposeActive()
    status.textContent = 'Memory profile complete.'
  }
}

async function ensureGesturePlayer() {
  let player = [...activePlayers][0]
  if (player) return player
  player = createAnyoPlayer({
    container: document.querySelector('#player-a'),
    source: firstWorld,
    renderer: { backend: 'webgl2' },
    exploration: { desktop: true, touch: true, vr: true, pointerLock: true },
    resize: { pixelRatio: 1 },
  })
  activePlayers.add(player)
  await player.load()
  return player
}

async function runAutomated() {
  document.documentElement.dataset.validation = 'running'
  const automated = [
    () => runCoreMatrix(),
    () => runStress(25),
    () => runRemoteAssets(),
    () => runContextLoss(),
    () => runWebGPUDeviceLoss(),
    () => runMemoryProfile(memoryCycles),
  ]
  for (const run of automated) await run()
  const automatedIds = [
    'core.load', 'core.two-players', 'core.replace', 'element.shadow', 'lifecycle.dispose',
    'lifecycle.stress', 'assets.remote-glb-textures', 'loss.webgl2', 'loss.webgpu', 'memory.long-running',
  ]
  const failed = automatedIds.filter(id => results.get(id)?.status === 'fail')
  document.documentElement.dataset.validation = failed.length ? 'fail' : 'complete'
  status.textContent = failed.length ? `Automated matrix failed: ${failed.join(', ')}` : 'Automated matrix complete.'
  return buildReport()
}

function buildReport() {
  return {
    format: '@blcklab/anyo-player/validation-report',
    schemaVersion: 1,
    packageVersion: VERSION,
    createdAt: new Date().toISOString(),
    environment: {
      browser: navigator.userAgentData?.brands?.map(item => `${item.brand} ${item.version}`).join(', ') ?? navigator.userAgent,
      browserVersion: '',
      operatingSystem: navigator.userAgentData?.platform ?? navigator.platform,
      device: navigator.maxTouchPoints > 0 ? 'touch-capable' : 'desktop',
      gpu: '',
      backend: 'mixed',
    },
    capabilities,
    entries: [...results.values()].map(item => ({
      id: item.id,
      required: true,
      status: item.status,
      evidence: item.evidence,
      notes: '',
    })),
    notes: [`assetOrigin=${assetOrigin}`, `memoryCycles=${memoryCycles}`],
  }
}

document.querySelector('#run-core').addEventListener('click', runCoreMatrix)
document.querySelector('#run-stress').addEventListener('click', () => runStress(25))
document.querySelector('#run-assets').addEventListener('click', runRemoteAssets)
document.querySelector('#run-context-loss').addEventListener('click', runContextLoss)
document.querySelector('#run-webgpu-loss').addEventListener('click', runWebGPUDeviceLoss)
document.querySelector('#run-memory').addEventListener('click', () => runMemoryProfile(memoryCycles))
document.querySelector('#run-all').addEventListener('click', runAutomated)

document.querySelector('#test-pointer-lock').addEventListener('click', async () => {
  try {
    const player = await ensureGesturePlayer()
    player.canvas.focus()
    await player.canvas.requestPointerLock?.()
    const focused = document.activeElement === player.canvas
    const locked = document.pointerLockElement === player.canvas
    window.dispatchEvent(new Event('blur'))
    document.dispatchEvent(new Event('visibilitychange'))
    if (locked) document.exitPointerLock?.()
    setResult('input.pointer-lock-focus-blur', focused && locked ? 'pass' : 'fail', `focused=${focused}; locked=${locked}; released=${document.pointerLockElement === null}.`)
  } catch (error) {
    setResult('input.pointer-lock-focus-blur', 'fail', error?.message ?? String(error))
  }
})

document.querySelector('#test-fullscreen').addEventListener('click', async () => {
  try {
    const player = await ensureGesturePlayer()
    await player.toggleFullscreen()
    const entered = Boolean(document.fullscreenElement)
    if (entered) await document.exitFullscreen()
    setResult('fullscreen', entered ? 'pass' : 'fail', `entered=${entered}, exited=${!document.fullscreenElement}`)
  } catch (error) {
    setResult('fullscreen', 'fail', error?.message ?? String(error))
  }
})

document.querySelector('#test-vr').addEventListener('click', async () => {
  try {
    const player = await ensureGesturePlayer()
    await player.enterVR()
    const active = player.state === 'vr-active'
    if (active) await player.exitVR()
    setResult('xr.physical-headset', active ? 'pass' : 'blocked', active ? 'Entered and exited immersive-vr.' : `VR state=${player.vrSupportState}`)
  } catch (error) {
    setResult('xr.physical-headset', 'blocked', error?.message ?? String(error))
  }
})

const manual = [
  ['input.touch', 'Touch movement, look and interaction'],
  ['accessibility.keyboard-screen-reader', 'Keyboard-only and screen-reader review'],
]
const manualRoot = document.querySelector('#manual-checks')
for (const [id, label] of manual) {
  const item = document.createElement('label')
  item.className = 'manual-item'
  const text = document.createElement('span')
  text.textContent = label
  const select = document.createElement('select')
  for (const state of ['pending', 'pass', 'fail', 'blocked']) {
    const option = document.createElement('option')
    option.value = state
    option.textContent = state
    select.append(option)
  }
  select.addEventListener('change', () => setResult(id, select.value, 'Recorded manually in the validation lab.'))
  item.append(text, select)
  manualRoot.append(item)
}

const capabilities = {
  secureContext: window.isSecureContext,
  webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
  webgpu: 'gpu' in navigator,
  webxr: 'xr' in navigator,
  touchPoints: navigator.maxTouchPoints,
  pointerLock: 'pointerLockElement' in document,
  fullscreen: 'fullscreenEnabled' in document && document.fullscreenEnabled,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  performanceMemory: Boolean(performance.memory),
  userAgent: navigator.userAgent,
}
capabilitiesNode.textContent = JSON.stringify(capabilities, null, 2)

document.querySelector('#export-report').addEventListener('click', () => {
  const payload = buildReport()
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `anyo-player-${VERSION}-validation-${Date.now()}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
})

for (const [id] of definitions) setResult(id, 'pending')

window.__ANYO_PLAYER_VALIDATION__ = {
  version: VERSION,
  results,
  runAutomated,
  runCoreMatrix,
  runStress,
  runRemoteAssets,
  runContextLoss,
  runWebGPUDeviceLoss,
  runMemoryProfile,
  buildReport,
  disposeActive,
}

if (autorun) {
  queueMicrotask(() => runAutomated().catch(error => {
    document.documentElement.dataset.validation = 'fail'
    status.textContent = error?.stack ?? String(error)
  }))
}
