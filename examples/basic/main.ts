import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')
if (!container) throw new Error('Missing #world container.')

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  renderer: {
    backend: 'auto',
    antialias: true,
  },
  resize: {
    pixelRatio: 'device',
    maxPixelRatio: 2,
  },
  exploration: {
    desktop: true,
    touch: true,
    vr: {
      referenceSpace: 'local-floor',
      optionalFeatures: ['bounded-floor'],
      checkSupportOnLoad: true,
    },
    xr: {
      locomotion: 'teleport',
      turning: 'snap',
    },
  },
  interaction: {
    defaultText: 'Interact',
    dataKey: 'interactionPrompt',
  },
  visibility: {
    pauseWhenHidden: true,
    resumeWhenVisible: true,
  },
  fullscreen: {
    target: 'container',
  },
})

player.registerAction('inspect-foundation', ({ name }) => {
  console.log('Inspect', name)
})

player.on('progress', progress => {
  console.log(`Loading ${Math.round(progress.ratio * 100)}%`)
})

player.on('resize', viewport => {
  console.log('Viewport', viewport)
})

player.on('paused', ({ reason }) => {
  console.log('Paused', reason)
})

player.on('interaction', context => {
  console.log('Selected', context.entityId, context.source)
})

player.on('diagnostic', diagnostic => {
  console.warn(diagnostic.code, diagnostic.message)
})


player.on('vrsupportchange', ({ state, supported }) => {
  console.log('VR support', state, supported)
})

player.on('xrtrackingchange', ({ state }) => {
  console.log('XR tracking', state)
})

player.on('vrerror', error => {
  console.warn('VR error', error.code, error.message)
})

await player.load()

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
