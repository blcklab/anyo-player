import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AnyoPlayer } from '@blcklab/anyo-player/react'

const root = document.querySelector('#app')
if (!root) throw new Error('Missing #app')

createRoot(root).render(createElement(AnyoPlayer, {
  source: './world.anyo.json',
  options: {
    embedding: {
      activation: 'visible',
      preload: 'source',
      pauseWhenOffscreen: true,
    },
    renderer: {
      backend: 'auto',
    },
  },
  onReady: () => console.info('Anyo Player is ready'),
  onError: (error: unknown) => console.error(error),
}))
