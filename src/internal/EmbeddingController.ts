import type {
  AnyoPlayerEmbeddingOptions,
  AnyoPlayerIntersectionState,
  AnyoPlayerPosterOptions,
} from '../types.js'

export interface EmbeddingControllerCallbacks {
  onIntersectionChange(previous: AnyoPlayerIntersectionState, state: AnyoPlayerIntersectionState): void
  onVisible(): void
  onHidden(): void
  onPosterChange(visible: boolean): void
}

interface NormalizedPosterOptions {
  src: string
  alt: string
  fit: 'cover' | 'contain'
  position: string
  background: string | null
  className: string | null
  hideWhen: 'loading' | 'ready' | 'entered'
}

function normalizeThreshold(value: number | readonly number[] | undefined): number | number[] {
  if (value === undefined) return 0
  const values = Array.isArray(value) ? [...value] : [value]
  if (values.length === 0) return 0
  for (const threshold of values) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new TypeError('embedding.threshold values must be finite numbers between 0 and 1.')
    }
  }
  return Array.isArray(value) ? values : values[0]!
}

function normalizePoster(value: string | AnyoPlayerPosterOptions | undefined): NormalizedPosterOptions | null {
  if (value === undefined) return null
  const input = typeof value === 'string' ? { src: value } : value
  const src = input.src.trim()
  if (!src) throw new TypeError('embedding.poster.src must not be empty.')
  return {
    src,
    alt: input.alt ?? '',
    fit: input.fit ?? 'cover',
    position: input.position ?? 'center',
    background: input.background ?? null,
    className: input.className ?? null,
    hideWhen: input.hideWhen ?? 'ready',
  }
}

export class EmbeddingController {
  readonly activation: 'manual' | 'immediate' | 'visible'
  readonly preload: 'none' | 'source' | 'runtime'
  readonly pauseWhenOffscreen: boolean
  readonly resumeWhenVisible: boolean

  private readonly container: HTMLElement
  private readonly callbacks: EmbeddingControllerCallbacks
  private readonly posterOptions: NormalizedPosterOptions | null
  private readonly observer: IntersectionObserver | null
  private readonly posterRoot: HTMLDivElement | null
  private intersectionValue: AnyoPlayerIntersectionState
  private posterVisibleValue = false
  private disposed = false

  constructor(
    container: HTMLElement,
    options: false | AnyoPlayerEmbeddingOptions | undefined,
    callbacks: EmbeddingControllerCallbacks,
  ) {
    this.container = container
    this.callbacks = callbacks
    const config = options === false ? {} : options ?? {}
    this.activation = options === false ? 'manual' : config.activation ?? 'manual'
    this.preload = options === false ? 'none' : config.preload ?? 'none'
    this.pauseWhenOffscreen = options !== false && config.pauseWhenOffscreen === true
    this.resumeWhenVisible = options !== false && config.resumeWhenVisible !== false
    this.posterOptions = options === false ? null : normalizePoster(config.poster)
    const threshold = normalizeThreshold(config.threshold)

    if (!['manual', 'immediate', 'visible'].includes(this.activation)) {
      throw new TypeError('embedding.activation must be "manual", "immediate", or "visible".')
    }
    if (!['none', 'source', 'runtime'].includes(this.preload)) {
      throw new TypeError('embedding.preload must be "none", "source", or "runtime".')
    }

    this.posterRoot = this.createPoster()

    const Observer = container.ownerDocument?.defaultView?.IntersectionObserver
      ?? globalThis.IntersectionObserver
    const needsObserver = this.activation === 'visible' || this.pauseWhenOffscreen
    if (needsObserver && typeof Observer === 'function') {
      this.intersectionValue = 'unknown'
      this.observer = new Observer(entries => {
        const entry = entries.find(candidate => candidate.target === this.container) ?? entries[0]
        if (!entry) return
        this.setIntersection(entry.isIntersecting && entry.intersectionRatio > 0 ? 'visible' : 'hidden')
      }, {
        root: config.root ?? null,
        rootMargin: config.rootMargin ?? '0px',
        threshold,
      })
      this.observer.observe(container)
    } else {
      this.intersectionValue = needsObserver ? 'unsupported' : 'visible'
      this.observer = null
    }
  }

  get intersection(): AnyoPlayerIntersectionState {
    return this.intersectionValue
  }

  get posterVisible(): boolean {
    return this.posterVisibleValue
  }

  handleLoadStart(): void {
    if (this.posterOptions?.hideWhen === 'loading') this.setPosterVisible(false)
  }

  handleReady(): void {
    if (this.posterOptions?.hideWhen === 'ready') this.setPosterVisible(false)
  }

  handleEntered(): void {
    if (this.posterOptions?.hideWhen === 'entered') this.setPosterVisible(false)
  }

  handleError(): void {
    if (this.posterRoot) this.setPosterVisible(true)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.observer?.disconnect()
    if (this.posterRoot?.parentNode === this.container) this.container.removeChild(this.posterRoot)
    if (this.posterVisibleValue) {
      this.posterVisibleValue = false
      this.callbacks.onPosterChange(false)
    }
  }

  private createPoster(): HTMLDivElement | null {
    if (!this.posterOptions) return null
    const document = this.container.ownerDocument
    const root = document.createElement('div')
    root.classList.add('anyo-player__poster')
    if (this.posterOptions.className) root.classList.add(this.posterOptions.className)
    root.setAttribute('data-anyo-player-poster', '')
    root.setAttribute('aria-hidden', this.posterOptions.alt ? 'false' : 'true')
    if (this.posterOptions.background) root.style.background = this.posterOptions.background

    const image = document.createElement('img') as HTMLImageElement
    image.classList.add('anyo-player__poster-image')
    image.src = this.posterOptions.src
    image.alt = this.posterOptions.alt
    image.draggable = false
    image.style.objectFit = this.posterOptions.fit
    image.style.objectPosition = this.posterOptions.position
    root.appendChild(image)
    this.container.appendChild(root)
    this.posterVisibleValue = true
    return root
  }

  private setIntersection(state: AnyoPlayerIntersectionState): void {
    if (this.disposed || this.intersectionValue === state) return
    const previous = this.intersectionValue
    this.intersectionValue = state
    this.callbacks.onIntersectionChange(previous, state)
    if (state === 'visible') this.callbacks.onVisible()
    else if (state === 'hidden') this.callbacks.onHidden()
  }

  private setPosterVisible(visible: boolean): void {
    if (!this.posterRoot || this.posterVisibleValue === visible) return
    this.posterVisibleValue = visible
    this.posterRoot.hidden = !visible
    this.posterRoot.setAttribute('aria-hidden', visible && this.posterOptions?.alt ? 'false' : 'true')
    this.callbacks.onPosterChange(visible)
  }
}
