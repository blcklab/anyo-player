import { createAnyoPlayer, type AnyoPlayerTelemetryEvent } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#player')!
const status = document.querySelector<HTMLOutputElement>('#status')!
const recoverButton = document.querySelector<HTMLButtonElement>('#recover')!

const analyticsSink = (event: AnyoPlayerTelemetryEvent): void => {
  console.log('[Anyo telemetry]', event)
}

const player = createAnyoPlayer({
  container,
  source: new URL('./world.anyo.json', import.meta.url),
  exploration: { pointerLock: false },
  session: {
    worldKey: 'recovery-example',
    dataPaths: ['progress'],
  },
  rendererRecovery: {
    automatic: true,
    maxAttempts: 2,
    delayMs: 500,
    backoff: 2,
    restoreSession: true,
  },
  analytics: {
    sink: event => analyticsSink(event),
    bufferSize: 100,
  },
  diagnostics: {
    historyLimit: 25,
  },
})

function renderStatus(): void {
  const recovery = player.rendererRecovery
  status.value = `Player: ${player.state}; recovery: ${recovery.state}; diagnostics: ${player.diagnostics.length}`
  recoverButton.disabled = player.state !== 'error' || player.error?.code !== 'PLAYER_RENDERER_LOST'
}

player.on('statechange', renderStatus)
player.on('rendererrecoverychange', renderStatus)
player.on('diagnosticrecorded', ({ record }) => {
  console.warn('[Anyo diagnostic]', record.code, record.message)
  renderStatus()
})
player.on('analyticserror', error => {
  console.warn('Analytics sink failed without affecting Player:', error)
})

await player.load()
renderStatus()

document.querySelector<HTMLButtonElement>('#checkpoint')!.addEventListener('click', () => {
  player.trackTelemetry('example.checkpoint', {
    room: player.world?.getCurrentRoom() ?? null,
    state: player.state,
  })
})

recoverButton.addEventListener('click', async () => {
  await player.recoverRenderer()
})

window.addEventListener('beforeunload', () => {
  void player.disposeAsync()
})
