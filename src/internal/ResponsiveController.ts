import type { RendererAdapter } from '@blcklab/anyo'
import type {
  AnyoPlayerResizeEvent,
  AnyoPlayerResizeOptions,
} from '../types.js'

interface ResizeObserverLike {
  observe(target: Element): void
  disconnect(): void
}

interface MediaQueryListLike {
  addEventListener?(type: 'change', listener: EventListener): void
  removeEventListener?(type: 'change', listener: EventListener): void
  addListener?(listener: (event: MediaQueryListEvent) => void): void
  removeListener?(listener: (event: MediaQueryListEvent) => void): void
}

export interface ResponsiveControllerCallbacks {
  onResize(event: AnyoPlayerResizeEvent): void
  onWarning(message: string): void
}

export class ResponsiveController {
  private readonly container: HTMLElement
  private readonly document: Document
  private readonly window: Window | null
  private readonly enabled: boolean
  private readonly fixedPixelRatio: number | null
  private readonly maxPixelRatio: number
  private readonly callbacks: ResponsiveControllerCallbacks
  private renderer: RendererAdapter | null = null
  private observer: ResizeObserverLike | null = null
  private mediaQuery: MediaQueryListLike | null = null
  private current: AnyoPlayerResizeEvent = { width: 1, height: 1, pixelRatio: 1 }
  private started = false
  private disposed = false

  constructor(
    container: HTMLElement,
    options: false | AnyoPlayerResizeOptions | undefined,
    rendererPixelRatio: number | undefined,
    rendererMaxPixelRatio: number | undefined,
    callbacks: ResponsiveControllerCallbacks,
  ) {
    this.container = container
    this.document = container.ownerDocument
    this.window = this.document.defaultView
    this.enabled = options !== false && options?.enabled !== false
    const requestedRatio = options === false
      ? rendererPixelRatio
      : options?.pixelRatio === 'device'
        ? undefined
        : options?.pixelRatio ?? rendererPixelRatio
    this.fixedPixelRatio = requestedRatio === undefined ? null : normalizePositive(requestedRatio, 1)
    this.maxPixelRatio = normalizePositive(
      options === false ? rendererMaxPixelRatio : options?.maxPixelRatio ?? rendererMaxPixelRatio ?? 2,
      2,
    )
    this.callbacks = callbacks
  }

  get viewport(): AnyoPlayerResizeEvent {
    return { ...this.current }
  }

  start(): void {
    if (!this.enabled || this.started || this.disposed) return
    this.started = true
    const scopedWindow = this.window as (Window & { ResizeObserver?: typeof ResizeObserver }) | null
    const ResizeObserverConstructor = scopedWindow?.ResizeObserver ?? globalThis.ResizeObserver
    if (typeof ResizeObserverConstructor === 'function') {
      const observer = new ResizeObserverConstructor(() => this.resizeNow())
      this.observer = observer
      observer.observe(this.container)
    }
    this.window?.addEventListener('resize', this.handleWindowResize)
    this.window?.addEventListener('orientationchange', this.handleWindowResize)
    this.installDprWatcher()
    this.resizeNow()
  }

  attach(renderer: RendererAdapter): void {
    if (this.disposed) return
    this.renderer = renderer
    this.resizeNow(true)
  }

  detach(renderer?: RendererAdapter): void {
    if (renderer && this.renderer !== renderer) return
    this.renderer = null
  }

  resizeNow(force = false): AnyoPlayerResizeEvent {
    if (this.disposed) return this.viewport
    const next = this.measure()
    const changed = force
      || next.width !== this.current.width
      || next.height !== this.current.height
      || next.pixelRatio !== this.current.pixelRatio
    this.current = next
    if (this.enabled && this.renderer) {
      try {
        this.renderer.resize(next.width, next.height, next.pixelRatio)
      } catch (error) {
        this.callbacks.onWarning(`Anyo Player could not resize the renderer: ${String(error)}`)
      }
    }
    if (changed) this.callbacks.onResize(this.viewport)
    return this.viewport
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderer = null
    this.observer?.disconnect()
    this.observer = null
    this.window?.removeEventListener('resize', this.handleWindowResize)
    this.window?.removeEventListener('orientationchange', this.handleWindowResize)
    this.removeDprWatcher()
  }

  private measure(): AnyoPlayerResizeEvent {
    const rect = this.container.getBoundingClientRect?.()
    const rawWidth = rect?.width ?? this.container.clientWidth ?? 0
    const rawHeight = rect?.height ?? this.container.clientHeight ?? 0
    return {
      width: Math.max(1, Math.round(Number.isFinite(rawWidth) ? rawWidth : 1)),
      height: Math.max(1, Math.round(Number.isFinite(rawHeight) ? rawHeight : 1)),
      pixelRatio: this.resolvePixelRatio(),
    }
  }

  private rawDevicePixelRatio(): number {
    const ratio = this.window?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1
    return normalizePositive(ratio, 1)
  }

  private resolvePixelRatio(): number {
    const ratio = this.fixedPixelRatio ?? this.window?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1
    return Math.max(0.25, Math.min(this.maxPixelRatio, normalizePositive(ratio, 1)))
  }

  private installDprWatcher(): void {
    this.removeDprWatcher()
    if (this.fixedPixelRatio !== null || !this.window?.matchMedia) return
    try {
      const query = `(resolution: ${this.rawDevicePixelRatio()}dppx)`
      this.mediaQuery = this.window.matchMedia(query)
      this.mediaQuery.addEventListener?.('change', this.handleDprChange)
      this.mediaQuery.addListener?.(this.handleLegacyDprChange)
    } catch (error) {
      this.callbacks.onWarning(`Anyo Player could not observe device-pixel-ratio changes: ${String(error)}`)
    }
  }

  private removeDprWatcher(): void {
    this.mediaQuery?.removeEventListener?.('change', this.handleDprChange)
    this.mediaQuery?.removeListener?.(this.handleLegacyDprChange)
    this.mediaQuery = null
  }

  private readonly handleWindowResize = (): void => {
    this.resizeNow()
  }

  private readonly handleDprChange: EventListener = () => {
    this.installDprWatcher()
    this.resizeNow()
  }

  private readonly handleLegacyDprChange = (): void => {
    this.installDprWatcher()
    this.resizeNow()
  }
}

function normalizePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
