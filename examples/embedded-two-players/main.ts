import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const common = {
  renderer: { backend: 'auto' as const },
  exploration: { desktop: true, touch: true, pointerLock: true },
}
const first = createAnyoPlayer({ container: document.querySelector<HTMLElement>('#world-a')!, source: './world-a.anyo.json', ...common })
const second = createAnyoPlayer({ container: document.querySelector<HTMLElement>('#world-b')!, source: './world-b.anyo.json', ...common })
await Promise.all([first.load(), second.load()])
window.addEventListener('pagehide', () => void Promise.all([first.disposeAsync(), second.disposeAsync()]), { once: true })
