import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')
if (!container) throw new Error('Missing #world container.')

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  embedding: {
    activation: 'visible',
    preload: 'source',
    poster: {
      src: './poster.webp',
      alt: 'Preview of the embedded Anyo world',
      fit: 'cover',
      hideWhen: 'ready',
    },
    pauseWhenOffscreen: true,
    resumeWhenVisible: true,
    rootMargin: '240px 0px',
    threshold: 0.1,
  },
})

player.on('preloaded', ({ document }) => {
  console.log('Source ready without a renderer', document.version)
})

player.on('intersectionchange', ({ state }) => {
  console.log('Embed visibility', state)
})

player.on('activationchange', ({ activated }) => {
  console.log('Runtime activated', activated)
})

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
