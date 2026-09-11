import { createAnyoPlayer, type AnyoPlayerUiAdapter } from '@blcklab/anyo-player'

const host = document.querySelector<HTMLElement>('#app')!
const shadow = host.attachShadow({ mode: 'open' })
const container = document.createElement('div')
container.style.cssText = 'width:100%;height:100%'
shadow.appendChild(container)

const adapter: AnyoPlayerUiAdapter = {
  mode: 'augment',

  mount({ slots, actions, getSnapshot }) {
    const badge = document.createElement('div')
    badge.textContent = `Phase: ${getSnapshot().phase}`
    badge.style.cssText = 'padding:8px 10px;border-radius:8px;background:#07111bcc;color:#dff8ff;font:600 12px system-ui'
    slots.diagnostic.appendChild(badge)

    const enter = document.createElement('button')
    enter.type = 'button'
    enter.textContent = 'Enter from host adapter'
    enter.addEventListener('click', actions.enter)
    slots.enter.appendChild(enter)

    return () => {
      badge.remove()
      enter.remove()
    }
  },

  update(snapshot) {
    console.log('Player UI snapshot:', snapshot.phase, snapshot.paused)
  },
}

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  renderer: { backend: 'auto' },
  exploration: { desktop: true, touch: true, vr: false },
  ui: {
    styles: { mode: 'auto' },
    theme: {
      accent: '#67e8f9',
      accentText: '#051014',
      surface: 'rgba(8, 18, 30, 0.92)',
      panelRadius: '18px',
      controlRadius: '8px',
    },
    adapter,
  },
})

player.on('themechange', ({ theme }) => console.log('Theme:', theme))
await player.load()

setTimeout(() => {
  player.setTheme({ accent: '#fbbf24', accentText: '#1d1300' })
}, 3000)

window.addEventListener('beforeunload', () => {
  void player.disposeAsync()
})
