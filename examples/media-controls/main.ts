import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#player')!
const status = document.querySelector<HTMLOutputElement>('#status')!
const download = document.querySelector<HTMLAnchorElement>('#download')!
const audioContext = new AudioContext()
const gain = audioContext.createGain()
gain.connect(audioContext.destination)
let screenshotUrl: string | null = null

const player = createAnyoPlayer({
  container,
  source: new URL('./world.anyo.json', import.meta.url),
  exploration: { pointerLock: false },
  audio: {
    unlockOnEnter: true,
    muteOnPause: true,
    targets: [{
      unlock: () => audioContext.resume(),
      setMuted: muted => { gain.gain.value = muted ? 0 : 1 },
    }],
  },
  pauseMenu: {
    enabled: true,
    title: 'World options',
    message: 'Resume, change audio, enter fullscreen, or save the current frame.',
    showResume: true,
    showAudio: true,
    showFullscreen: true,
    showScreenshot: true,
  },
})

function renderAudio(): void {
  status.value = `Audio: ${player.audio.unlocked ? 'unlocked' : 'locked'}, ${player.audio.muted ? 'muted' : 'audible'}`
}

player.on('audiochange', renderAudio)
player.on('audiounlocked', renderAudio)
player.on('screenshotcaptured', ({ screenshot }) => {
  if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
  screenshotUrl = URL.createObjectURL(screenshot.blob)
  download.href = screenshotUrl
  download.download = `anyo-world-${Date.now()}.png`
  download.hidden = false
  status.value = `Captured ${screenshot.width} × ${screenshot.height}`
})

await player.load()
renderAudio()

document.querySelector<HTMLButtonElement>('#mute')!.addEventListener('click', async () => {
  if (!player.audio.unlocked) await player.unlockAudio()
  else await player.toggleAudioMuted()
})

document.querySelector<HTMLButtonElement>('#shot')!.addEventListener('click', async () => {
  await player.captureScreenshot({ type: 'image/png' })
})

window.addEventListener('beforeunload', () => {
  if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
  void player.disposeAsync()
})
