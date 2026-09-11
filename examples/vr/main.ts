import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'
const player = createAnyoPlayer({
  container: document.querySelector<HTMLElement>('#world')!,
  source: '../basic/world.anyo.json',
  renderer: { backend: 'webgl2' },
  exploration: {
    desktop: true,
    touch: true,
    vr: { referenceSpace: 'local-floor', checkSupportOnLoad: true },
    xr: { locomotion: 'teleport', turning: 'snap' },
  },
})
await player.load()
window.addEventListener('pagehide', () => void player.disposeAsync(), { once: true })
