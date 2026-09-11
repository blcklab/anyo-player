import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')!
const player = createAnyoPlayer({
  container,
  source: './world-a.anyo.json',
  exploration: { desktop: true, touch: true },
})

player.on('worldreplacing', () => console.log('Replacing world…'))
player.on('worldreplaced', ({ status }) => console.log('Replacement complete:', status))
player.on('worldreplaceerror', error => console.warn(error.code, error.message))

await player.load()

document.querySelector('#world-a')?.addEventListener('click', () => {
  void player.replaceWorld('./world-a.anyo.json')
})
document.querySelector('#world-b')?.addEventListener('click', () => {
  void player.replaceWorld('./world-b.anyo.json')
})

window.addEventListener('pagehide', () => void player.disposeAsync(), { once: true })
