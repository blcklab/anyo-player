import {
  defineAnyoPlayerElement,
  type AnyoPlayerElement,
} from '@blcklab/anyo-player/element'

defineAnyoPlayerElement()

const element = document.querySelector<AnyoPlayerElement>('#world')!
element.options = {
  exploration: {
    desktop: true,
    touch: true,
    pointerLock: true,
  },
  ui: {
    theme: {
      accent: '#67e8f9',
      surface: 'rgba(9, 9, 11, 0.88)',
    },
  },
}

element.addEventListener('anyo-player-ready', () => {
  console.log('Custom-element world ready', element.player)
})

element.addEventListener('anyo-player-error', event => {
  console.error('Custom-element player error', (event as CustomEvent).detail)
})

document.querySelector<HTMLButtonElement>('#replace')!.addEventListener('click', async () => {
  await element.replaceWorld('./world.anyo.json')
})
