import { AnyoPlayerError } from '../errors.js'
import type { AnyoPlayerFullscreenOptions } from '../types.js'

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

export interface FullscreenControllerCallbacks {
  onChange(fullscreen: boolean): void
  onError(error: AnyoPlayerError): void
}

export class FullscreenController {
  private readonly document: FullscreenDocument
  private readonly target: FullscreenElement
  private readonly enabled: boolean
  private readonly callbacks: FullscreenControllerCallbacks
  private lastValue = false
  private requestPending = false
  private disposed = false

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    options: false | AnyoPlayerFullscreenOptions | undefined,
    callbacks: FullscreenControllerCallbacks,
  ) {
    this.document = container.ownerDocument as FullscreenDocument
    this.target = (options !== false && options?.target === 'canvas' ? canvas : container) as FullscreenElement
    this.enabled = options !== false && options?.enabled !== false
    this.callbacks = callbacks
    if (this.enabled) {
      this.document.addEventListener('fullscreenchange', this.handleChange)
      this.document.addEventListener('fullscreenerror', this.handleNativeError)
      this.document.addEventListener('webkitfullscreenchange', this.handleChange)
      this.document.addEventListener('webkitfullscreenerror', this.handleNativeError)
    }
  }

  get fullscreen(): boolean {
    return this.fullscreenElement === this.target
  }

  get available(): boolean {
    return this.enabled && (
      typeof this.target.requestFullscreen === 'function'
      || typeof this.target.webkitRequestFullscreen === 'function'
    )
  }

  async enter(): Promise<void> {
    this.assertUsable()
    if (this.fullscreen) return
    const request = this.target.requestFullscreen?.bind(this.target)
      ?? this.target.webkitRequestFullscreen?.bind(this.target)
    if (!request) {
      throw new AnyoPlayerError(
        'PLAYER_FULLSCREEN_UNAVAILABLE',
        'Fullscreen is not available for this Anyo Player in the current browser or embedding context.',
      )
    }
    this.requestPending = true
    try {
      await request()
      this.emitChange()
    } catch (cause) {
      throw this.createFailure(cause)
    } finally {
      this.requestPending = false
    }
  }

  async exit(): Promise<void> {
    this.assertUsable()
    if (!this.fullscreen) return
    const exit = this.document.exitFullscreen?.bind(this.document)
      ?? this.document.webkitExitFullscreen?.bind(this.document)
    if (!exit) {
      const error = new AnyoPlayerError(
        'PLAYER_FULLSCREEN_UNAVAILABLE',
        'The browser cannot exit fullscreen for this Anyo Player.',
      )
      this.callbacks.onError(error)
      throw error
    }
    this.requestPending = true
    try {
      await exit()
      this.emitChange()
    } catch (cause) {
      throw this.createFailure(cause)
    } finally {
      this.requestPending = false
    }
  }

  async toggle(): Promise<void> {
    if (this.fullscreen) await this.exit()
    else await this.enter()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.enabled) {
      this.document.removeEventListener('fullscreenchange', this.handleChange)
      this.document.removeEventListener('fullscreenerror', this.handleNativeError)
      this.document.removeEventListener('webkitfullscreenchange', this.handleChange)
      this.document.removeEventListener('webkitfullscreenerror', this.handleNativeError)
    }
  }

  private get fullscreenElement(): Element | null {
    return this.document.fullscreenElement ?? this.document.webkitFullscreenElement ?? null
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player fullscreen controls were disposed.')
    }
    if (!this.enabled) {
      throw new AnyoPlayerError(
        'PLAYER_FULLSCREEN_UNAVAILABLE',
        'Fullscreen is disabled for this Anyo Player.',
      )
    }
  }

  private emitChange(): void {
    const fullscreen = this.fullscreen
    if (fullscreen === this.lastValue) return
    this.lastValue = fullscreen
    this.callbacks.onChange(fullscreen)
  }

  private readonly handleChange = (): void => {
    if (this.disposed) return
    this.emitChange()
  }

  private readonly handleNativeError = (event: Event): void => {
    if (this.disposed || this.requestPending) return
    this.callbacks.onError(this.createFailure(event))
  }

  private createFailure(cause: unknown): AnyoPlayerError {
    return new AnyoPlayerError(
      'PLAYER_FULLSCREEN_FAILED',
      'Anyo Player could not change fullscreen mode. Check browser permissions and iframe allow policies.',
      { cause },
    )
  }
}
