import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const player = createAnyoPlayer({
  container: document.querySelector<HTMLElement>('#world')!,
  source: './world.anyo.json',
  exploration: {
    desktop: true,
    touch: true,
    pointerLock: true,
  },
  interaction: {
    activateKeys: ['KeyE', 'Enter'],
    reticle: {
      mode: 'pointer-lock',
      sampleInterval: 80,
      maxDistance: 5,
    },
    resolvePrompt: context => {
      if (context.action === 'open-product') {
        return {
          title: 'Featured product',
          text: 'Open product details',
          description: 'View specifications, pricing, and availability.',
          actionLabel: 'View details',
          ariaLabel: 'Open the featured product details',
        }
      }
      return undefined
    },
  },
})

player.registerAction('open-product', ({ sku }) => {
  window.alert(`Open product ${String(sku)}`)
})

player.on('interactiontargetchange', ({ target }) => {
  console.log('Focused interaction target:', target)
})

player.on('interactionactivated', ({ target, selected }) => {
  console.log('Interaction activated:', target.entityId, selected)
})

await player.load()
