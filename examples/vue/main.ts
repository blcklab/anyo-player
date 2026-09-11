import { createApp, h } from 'vue'
import { AnyoPlayer } from '@blcklab/anyo-player/vue'

createApp({
  render: () => h(AnyoPlayer, {
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
  }),
}).mount('#app')
