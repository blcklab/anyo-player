import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')
const saveButton = document.querySelector<HTMLButtonElement>('#save')
const restoreButton = document.querySelector<HTMLButtonElement>('#restore')
const clearButton = document.querySelector<HTMLButtonElement>('#clear')
const status = document.querySelector<HTMLElement>('#status')
if (!container || !saveButton || !restoreButton || !clearButton || !status) {
  throw new Error('Missing session example elements.')
}

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  exploration: { desktop: true, touch: true },
  session: {
    storage: localStorage,
    storageKey: 'anyo-player-session-example',
    worldKey: 'session-example-world',
    dataPaths: ['visit.count'],
    restoreOnLoad: true,
    saveOnVisibilityHidden: true,
  },
})

player.on('sessionsaved', ({ key }) => { status.textContent = `Saved ${key}` })
player.on('sessionrestored', () => { status.textContent = 'Checkpoint restored' })
player.on('sessioncleared', () => { status.textContent = 'Checkpoint cleared' })
player.on('sessionerror', error => { status.textContent = error.message })

saveButton.addEventListener('click', () => {
  void player.saveSession()
})
restoreButton.addEventListener('click', () => {
  void player.loadSession()
})
clearButton.addEventListener('click', () => {
  void player.clearSession()
})

await player.load()

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
