import type { AnyoPlayerVisibilityOptions } from '../types.js'

export interface VisibilityControllerCallbacks {
  onHidden(): void
  onVisible(): void
  onFocused?(): void
  onUnfocused?(): void
}

export class VisibilityController {
  private readonly document: Document
  private readonly window: Window | null
  readonly pauseWhenHidden: boolean
  readonly resumeWhenVisible: boolean
  readonly reduceWhenUnfocused: boolean
  readonly unfocusedRenderScale: number
  private readonly callbacks: VisibilityControllerCallbacks
  private focusedValue = true
  private disposed = false

  constructor(
    document: Document,
    options: false | AnyoPlayerVisibilityOptions | undefined,
    callbacks: VisibilityControllerCallbacks,
  ) {
    this.document = document
    this.window = document.defaultView
    this.pauseWhenHidden = options !== false && options?.pauseWhenHidden !== false
    this.resumeWhenVisible = options !== false && options?.resumeWhenVisible !== false
    this.reduceWhenUnfocused = options !== false && options?.reduceWhenUnfocused === true
    const requestedScale = options === false ? 0.5 : options?.unfocusedRenderScale ?? 0.5
    if (!Number.isFinite(requestedScale) || requestedScale < 0.25 || requestedScale > 1) {
      throw new TypeError('visibility.unfocusedRenderScale must be between 0.25 and 1.')
    }
    this.unfocusedRenderScale = requestedScale
    this.callbacks = callbacks
    if (options !== false) {
      this.document.addEventListener('visibilitychange', this.handleChange)
      this.window?.addEventListener('focus', this.handleFocus)
      this.window?.addEventListener('blur', this.handleBlur)
    }
  }

  get hidden(): boolean {
    return this.document.hidden === true || this.document.visibilityState === 'hidden'
  }

  get focused(): boolean { return this.focusedValue }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.document.removeEventListener('visibilitychange', this.handleChange)
    this.window?.removeEventListener('focus', this.handleFocus)
    this.window?.removeEventListener('blur', this.handleBlur)
  }

  private readonly handleChange = (): void => {
    if (this.disposed) return
    if (this.hidden) this.callbacks.onHidden()
    else this.callbacks.onVisible()
  }

  private readonly handleFocus = (): void => {
    if (this.disposed || this.focusedValue) return
    this.focusedValue = true
    this.callbacks.onFocused?.()
  }

  private readonly handleBlur = (): void => {
    if (this.disposed || !this.focusedValue) return
    this.focusedValue = false
    this.callbacks.onUnfocused?.()
  }
}
