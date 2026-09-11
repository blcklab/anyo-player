import { createAnyoPlayer } from '@blcklab/anyo-player'
import { createWebSurfaceAppRegistry } from '@blcklab/anyo/web-surface'
import { textureWebSurfacePlugin, type TextureWebSurfaceApp } from '@blcklab/anyo-web-surface-texture'
import { createSekai64TextureSurfaceBridge } from '@blcklab/anyo-web-surface-texture/sekai64'

const registry = createWebSurfaceAppRegistry()
const framebufferApp: TextureWebSurfaceApp = {
  texture: { width: 160, height: 144, minFilter: 'nearest', magFilter: 'nearest' },
  mount(container) {
    container.textContent = 'Framebuffer application fallback'
    return { dispose() { container.replaceChildren() } }
  },
  createTextureSurface(canvas) {
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    return {
      render() {
        context?.fillRect(0, 0, canvas.width, canvas.height)
      },
      dispose() {},
    }
  },
}
registry.register('framebuffer-app', framebufferApp)

const texturePlugin = textureWebSurfacePlugin({
  registry,
  createBridge: renderer => createSekai64TextureSurfaceBridge(renderer),
})

const player = createAnyoPlayer({
  container: document.querySelector<HTMLElement>('#world')!,
  source: './world.anyo.json',
  webSurface: false,
  plugins: [texturePlugin],
})

await player.load()
window.addEventListener('pagehide', () => void player.disposeAsync(), { once: true })
