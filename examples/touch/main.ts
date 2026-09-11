import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'
const player = createAnyoPlayer({
  container: document.querySelector<HTMLElement>('#world')!,
  source: '../basic/world.anyo.json',
  exploration: {
    desktop: false,
    touch: { moveRadius: 64, deadZone: 0.12, runButton: true },
  },
})
await player.load()
window.addEventListener('pagehide', () => void player.disposeAsync(), { once: true })
