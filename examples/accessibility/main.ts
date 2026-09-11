import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#player')!
const status = document.querySelector<HTMLOutputElement>('#status')!

const player = createAnyoPlayer({
  container,
  source: new URL('./world.anyo.json', import.meta.url),
  exploration: {
    pointerLock: false,
  },
  accessibility: {
    reducedMotion: 'system',
    keyboardNavigation: true,
    focusManagement: true,
    announcements: true,
    roleDescription: 'Explorable Anyo product world',
  },
})

function renderStatus(): void {
  status.value = `Modality: ${player.inputModality}; reduced motion: ${player.reducedMotion}`
}

player.on('inputmodalitychange', renderStatus)
player.on('reducedmotionchange', renderStatus)

await player.load()
renderStatus()

document.querySelector<HTMLButtonElement>('#motion')!.addEventListener('click', () => {
  player.setReducedMotion(!player.reducedMotion)
})

document.querySelector<HTMLButtonElement>('#announce')!.addEventListener('click', () => {
  player.announce('Checkpoint saved. You can continue exploring.')
})
