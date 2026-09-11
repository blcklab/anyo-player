import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')
const destination = document.querySelector<HTMLSelectElement>('#destination')
const navigateButton = document.querySelector<HTMLButtonElement>('#navigate')
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')
if (!container || !destination || !navigateButton || !cancelButton) {
  throw new Error('Missing multi-world navigation example elements.')
}

const player = createAnyoPlayer({
  container,
  navigation: {
    worlds: {
      lobby: './lobby.anyo.json',
      gallery: {
        source: './gallery.anyo.json',
        label: 'Gallery',
        metadata: { section: 'art' },
      },
      store: './store.anyo.json',
    },
    initialWorld: 'lobby',
    transition: {
      presentation: 'fade',
      minimumDuration: 180,
      beforeSwitch: ({ fromWorldId, toWorldId, signal }) => {
        console.log('Preparing navigation', { fromWorldId, toWorldId, aborted: signal.aborted })
      },
      afterSwitch: ({ toWorldId }) => {
        console.log('Navigation complete', toWorldId)
      },
    },
  },
  embedding: {
    activation: 'immediate',
    preload: 'source',
  },
})

player.on('worldnavigationchange', ({ navigation }) => {
  cancelButton.disabled = navigation.state !== 'preparing'
  navigateButton.disabled = navigation.state === 'preparing' || navigation.state === 'switching'
})

player.on('worldnavigationerror', ({ error }) => {
  console.error(error.code, error.message)
})

navigateButton.addEventListener('click', () => {
  void player.navigateTo(destination.value)
})

cancelButton.addEventListener('click', () => {
  player.cancelNavigation()
})

void player.preloadWorld('gallery')

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
