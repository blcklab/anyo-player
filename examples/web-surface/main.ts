import { createAnyoPlayer } from '@blcklab/anyo-player'
import '@blcklab/anyo-player/styles.css'

const container = document.querySelector<HTMLElement>('#world')
const status = document.querySelector<HTMLOutputElement>('#status')
if (!container || !status) throw new Error('Missing Web Surface example host elements.')

const player = createAnyoPlayer({
  container,
  source: './world.anyo.json',
  exploration: {
    desktop: true,
    touch: true,
    pointerLock: true,
    vr: true,
  },
  webSurface: {
    zIndex: 10,
    apps: {
      'spatial-dashboard': {
        mount(surface, props, context) {
          surface.innerHTML = `
            <style>
              .spatial-app { width: 100%; height: 100%; padding: 8%; display: grid; align-content: center; gap: 6%; color: #f8fafc; background: radial-gradient(circle at 80% 15%, rgba(139,92,246,.32), transparent 34%), #111827; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
              .spatial-app__badge { width: max-content; padding: .5em .8em; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(255,255,255,.08); font-size: clamp(12px, 2.2vw, 28px); }
              .spatial-app h1 { margin: 0; max-width: 12ch; font-size: clamp(30px, 6vw, 82px); line-height: .98; letter-spacing: -.05em; }
              .spatial-app__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
              .spatial-app__metric { font-size: clamp(20px, 4vw, 54px); font-weight: 750; font-variant-numeric: tabular-nums; }
              .spatial-app button { border: 0; border-radius: 1rem; padding: .8em 1.1em; color: #111827; background: #f8fafc; font: inherit; font-weight: 700; cursor: pointer; }
            </style>
            <article class="spatial-app">
              <span class="spatial-app__badge"></span>
              <h1>Bring the web into 3D.</h1>
              <div class="spatial-app__row">
                <span class="spatial-app__metric"></span>
                <button type="button">Add visitor</button>
              </div>
            </article>
          `

          const badge = surface.querySelector<HTMLElement>('.spatial-app__badge')!
          const metric = surface.querySelector<HTMLElement>('.spatial-app__metric')!
          const button = surface.querySelector<HTMLButtonElement>('button')!
          const render = (next: Readonly<Record<string, unknown>>): void => {
            badge.textContent = String(next.status ?? 'Live')
            metric.textContent = `${Number(next.visitors ?? 0)} visitors`
          }
          const increment = (): void => {
            const visitors = Number(context.world.getData('visitors') ?? 0)
            void context.world.setData('visitors', visitors + 1)
          }

          render(props)
          button.addEventListener('click', increment)
          return {
            update: render,
            pause() { surface.dataset.paused = 'true' },
            resume() { delete surface.dataset.paused },
            dispose() {
              button.removeEventListener('click', increment)
              surface.replaceChildren()
            },
          }
        },
      },
    },
    onDiagnostic(diagnostic) {
      console.warn('[Player Web Surface]', diagnostic)
    },
  },
})

player.on('ready', () => {
  status.value = 'Move with WASD and mouse. The live wall app uses its snapshot fallback in immersive XR.'
})

await player.load()

window.addEventListener('pagehide', () => {
  void player.disposeAsync()
}, { once: true })
