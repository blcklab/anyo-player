import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')!
const status = document.querySelector<HTMLOutputElement>('#status')!

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  exploration: {
    desktop: true,
    touch: true,
    pointerLock: true,
  },
  interaction: {
    reticle: { mode: 'pointer-lock', maxDistance: 5 },
  },
  input: {
    storage: localStorage,
    storageKey: 'anyo-player/example-input-bindings',
    restoreOnLoad: true,
    saveOnChange: true,
    keyboardLookSensitivity: 8,
    gamepad: {
      enabled: true,
      index: 'auto',
      deadZone: 0.18,
      lookSensitivity: 7,
    },
  },
})

player.registerAction('open-product', ({ sku }) => {
  status.value = `Activated product ${String(sku)}`
})

player.on('inputbindingschange', ({ source }) => {
  status.value = `Bindings changed from ${source}`
})

player.on('inputaction', ({ action, value, device }) => {
  if (value > 0) status.value = `${device}: ${action} (${value.toFixed(2)})`
})

player.on('gamepadchange', ({ gamepads, activeGamepad }) => {
  const connected = gamepads.map(gamepad => gamepad.id).join(', ') || 'none'
  status.value = `Gamepads: ${connected}; active: ${activeGamepad ?? 'none'}`
})

player.on('inputbindingserror', error => {
  status.value = `${error.code}: ${error.message}`
})

document.querySelector<HTMLButtonElement>('#alternate')!.addEventListener('click', () => {
  player.setInputBindings({
    'move-forward': [{ device: 'keyboard', code: 'KeyI' }],
    'move-backward': [{ device: 'keyboard', code: 'KeyK' }],
    'move-left': [{ device: 'keyboard', code: 'KeyJ' }],
    'move-right': [{ device: 'keyboard', code: 'KeyL' }],
    interact: [{ device: 'keyboard', code: 'Enter' }, { device: 'gamepad-button', button: 0 }],
  })
})

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  player.resetInputBindings()
})

document.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', async () => {
  await player.saveInputBindings()
  status.value = 'Bindings saved.'
})

document.querySelector<HTMLButtonElement>('#load')!.addEventListener('click', async () => {
  const snapshot = await player.loadInputBindings()
  status.value = snapshot ? 'Bindings loaded.' : 'No saved bindings found.'
})

await player.load()
status.value = 'Ready. Use keyboard, touch, or a connected standard gamepad.'

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
