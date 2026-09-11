import { createAnyoPlayer } from './createAnyoPlayer.js'
import { AnyoPlayerError, toPlayerError } from './errors.js'
import type {
  AnyoPlayer,
  AnyoPlayerActivationMode,
  AnyoPlayerEventMap,
  AnyoPlayerOptions,
  AnyoPlayerPreloadMode,
  AnyoPlayerSource,
} from './types.js'

export const ANYO_PLAYER_ELEMENT_TAG = 'anyo-player'

export type AnyoPlayerElementOptions = Omit<
  AnyoPlayerOptions,
  'container' | 'canvas' | 'source'
>

export interface AnyoPlayerElementEventMap {
  'anyo-player-ready': CustomEvent<AnyoPlayerEventMap['ready']>
  'anyo-player-error': CustomEvent<AnyoPlayerError>
  'anyo-player-statechange': CustomEvent<AnyoPlayerEventMap['statechange']>
  'anyo-player-phasechange': CustomEvent<AnyoPlayerEventMap['phasechange']>
  'anyo-player-worldreplaced': CustomEvent<AnyoPlayerEventMap['worldreplaced']>
  'anyo-player-themechange': CustomEvent<AnyoPlayerEventMap['themechange']>
  'anyo-player-disposed': CustomEvent<undefined>
}

export type AnyoPlayerElementEventName = keyof AnyoPlayerElementEventMap

const OBSERVED_ATTRIBUTES = [
  'src',
  'activation',
  'preload',
  'backend',
  'poster',
  'pause-when-offscreen',
  'aria-label',
] as const

const ACTIVATION_VALUES = new Set<AnyoPlayerActivationMode>(['manual', 'immediate', 'visible'])
const PRELOAD_VALUES = new Set<AnyoPlayerPreloadMode>(['none', 'source', 'runtime'])
type AnyoPlayerBackend = NonNullable<NonNullable<AnyoPlayerOptions['renderer']>['backend']>

const BACKEND_VALUES = new Set<AnyoPlayerBackend>([
  'auto',
  'webgl2',
  'webgpu',
])

const HTMLElementBase = (
  globalThis.HTMLElement ?? class HTMLElementFallback {}
) as typeof HTMLElement

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeOptions(value: AnyoPlayerElementOptions | null | undefined): AnyoPlayerElementOptions {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('AnyoPlayerElement.options must be an object.')
  }
  for (const reserved of ['container', 'canvas', 'source'] as const) {
    if (hasOwn(value as object, reserved)) {
      throw new TypeError(`AnyoPlayerElement.options must not define "${reserved}".`)
    }
  }
  return { ...value }
}

function attributeValue<T extends string>(
  name: string,
  value: string | null,
  accepted: ReadonlySet<T>,
): T | undefined {
  if (value === null || value.trim() === '') return undefined
  const normalized = value.trim() as T
  if (!accepted.has(normalized)) {
    throw new TypeError(`${name} must be one of: ${[...accepted].join(', ')}.`)
  }
  return normalized
}

function customEvent<T>(element: HTMLElement, type: string, detail: T): Event {
  const EventConstructor = element.ownerDocument?.defaultView?.CustomEvent ?? globalThis.CustomEvent
  if (typeof EventConstructor === 'function') {
    return new EventConstructor(type, {
      detail,
      bubbles: true,
      composed: true,
    })
  }
  const event = element.ownerDocument.createEvent('CustomEvent')
  event.initCustomEvent(type, true, false, detail)
  return event
}

function createElementStyle(document: Document, nonce?: string): HTMLStyleElement {
  const style = document.createElement('style')
  style.setAttribute('data-anyo-player-element-styles', '')
  if (nonce) style.setAttribute('nonce', nonce)
  style.textContent = `
:host {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

[part="container"] {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}
`
  return style
}

export class AnyoPlayerElement extends HTMLElementBase {
  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRIBUTES
  }

  private sourceValue: AnyoPlayerSource | null = null
  private optionsValue: AnyoPlayerElementOptions = {}
  private playerValue: AnyoPlayer | null = null
  private containerValue: HTMLDivElement | null = null
  private eventCleanups: Array<() => void> = []
  private disposalPromise: Promise<void> | null = null
  private generation = 0
  private lastMountError: AnyoPlayerError | null = null

  constructor() {
    super()
    this.upgradeProperty('source')
    this.upgradeProperty('options')
    this.upgradeProperty('src')
  }

  get src(): string {
    return this.getAttribute('src') ?? ''
  }

  set src(value: string) {
    const normalized = String(value).trim()
    if (normalized) this.setAttribute('src', normalized)
    else this.removeAttribute('src')
  }

  get source(): AnyoPlayerSource | null {
    return this.sourceValue
  }

  set source(value: AnyoPlayerSource | null) {
    this.sourceValue = value
  }

  get options(): AnyoPlayerElementOptions {
    return this.optionsValue
  }

  set options(value: AnyoPlayerElementOptions) {
    if (this.playerValue) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'AnyoPlayerElement.options cannot be replaced while its Player is mounted. Dispose or reconnect the element first.',
      )
    }
    this.optionsValue = normalizeOptions(value)
  }

  get player(): AnyoPlayer | null {
    return this.playerValue
  }

  connectedCallback(): void {
    const generation = ++this.generation
    if (this.playerValue) return
    queueMicrotask(() => {
      if (this.generation !== generation || !this.isConnected || this.playerValue) return
      if (this.disposalPromise) {
        void this.disposalPromise.then(() => {
          if (this.generation === generation && this.isConnected && !this.playerValue) {
            this.mountPlayer(generation)
          }
        })
        return
      }
      this.mountPlayer(generation)
    })
  }

  disconnectedCallback(): void {
    const generation = this.generation
    queueMicrotask(() => {
      if (this.isConnected || generation !== this.generation) return
      void this.beginDisposal()
    })
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return
    try {
      this.validateAttribute(name, newValue)
      if (name === 'src') this.sourceValue = newValue?.trim() || null
      if (name === 'aria-label' && this.playerValue) {
        this.playerValue.canvas.setAttribute('aria-label', newValue?.trim() || 'Interactive Anyo world')
      }
    } catch (cause) {
      this.reportError(toPlayerError(
        cause,
        'PLAYER_INVALID_STATE',
        `Anyo Player custom-element attribute "${name}" is invalid.`,
      ))
    }
  }

  async load(source: AnyoPlayerSource | undefined = this.sourceValue ?? undefined): Promise<void> {
    if (source !== undefined) this.sourceValue = source
    const player = await this.ensurePlayer()
    await player.load(source)
  }

  async activate(): Promise<void> {
    const player = await this.ensurePlayer()
    await player.activate()
  }

  async replaceWorld(source: AnyoPlayerSource): Promise<void> {
    const player = await this.ensurePlayer()
    await player.replaceWorld(source)
    this.sourceValue = source
  }

  disposeAsync(): Promise<void> {
    return this.beginDisposal()
  }

  protected createPlayer(options: AnyoPlayerOptions): AnyoPlayer {
    return createAnyoPlayer(options)
  }

  private ensureStructure(): HTMLDivElement {
    if (this.containerValue) return this.containerValue
    const document = this.ownerDocument
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const uiStyles = this.optionsValue.ui === false ? undefined : this.optionsValue.ui?.styles
    const nonce = uiStyles && typeof uiStyles === 'object' ? uiStyles.nonce : undefined
    const style = createElementStyle(document, nonce)
    const container = document.createElement('div')
    container.setAttribute('part', 'container')
    container.setAttribute('data-anyo-player-element-container', '')
    root.appendChild(style)
    root.appendChild(container)
    this.containerValue = container
    return container
  }

  private composeOptions(container: HTMLElement): AnyoPlayerOptions {
    const activation = attributeValue('activation', this.getAttribute('activation'), ACTIVATION_VALUES)
    const preload = attributeValue('preload', this.getAttribute('preload'), PRELOAD_VALUES)
    const backend = attributeValue('backend', this.getAttribute('backend'), BACKEND_VALUES)
    const poster = this.getAttribute('poster')?.trim() || undefined
    const ariaLabel = this.getAttribute('aria-label')?.trim() || this.optionsValue.ariaLabel
    const pauseWhenOffscreen = this.hasAttribute('pause-when-offscreen')

    const embeddingBase = this.optionsValue.embedding === false ? {} : this.optionsValue.embedding ?? {}
    const embedding: NonNullable<Exclude<AnyoPlayerOptions['embedding'], false>> = {
      ...embeddingBase,
      ...(activation === undefined ? {} : { activation }),
      ...(preload === undefined ? {} : { preload }),
      ...(poster === undefined ? {} : { poster }),
      ...(pauseWhenOffscreen ? { pauseWhenOffscreen: true } : {}),
    }
    const renderer: NonNullable<AnyoPlayerOptions['renderer']> = {
      ...(this.optionsValue.renderer ?? {}),
      ...(backend === undefined ? {} : { backend }),
    }

    const options: AnyoPlayerOptions = {
      ...this.optionsValue,
      container,
    }
    if (this.sourceValue !== null) options.source = this.sourceValue
    if (Object.keys(renderer).length > 0) options.renderer = renderer
    if (Object.keys(embedding).length > 0) options.embedding = embedding
    if (ariaLabel !== undefined) options.ariaLabel = ariaLabel
    return options
  }

  private mountPlayer(generation: number): AnyoPlayer | null {
    if (generation !== this.generation || this.playerValue) return this.playerValue
    try {
      const container = this.ensureStructure()
      const player = this.createPlayer(this.composeOptions(container))
      if (generation !== this.generation) {
        void player.disposeAsync()
        return null
      }
      this.lastMountError = null
      this.playerValue = player
      this.bindPlayerEvents(player)
      return player
    } catch (cause) {
      const error = toPlayerError(cause, 'PLAYER_INVALID_STATE', 'Anyo Player custom element could not mount.')
      this.lastMountError = error
      this.reportError(error)
      return null
    }
  }

  private async ensurePlayer(): Promise<AnyoPlayer> {
    if (this.playerValue) return this.playerValue
    if (this.disposalPromise) await this.disposalPromise
    if (this.playerValue) return this.playerValue
    if (!this.isConnected) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'AnyoPlayerElement must be connected before its Player can be used.',
      )
    }
    const generation = ++this.generation
    const player = this.mountPlayer(generation)
    if (player) return player
    throw this.lastMountError ?? new AnyoPlayerError(
      'PLAYER_INVALID_STATE',
      'AnyoPlayerElement could not create its Player.',
    )
  }

  private bindPlayerEvents(player: AnyoPlayer): void {
    this.clearPlayerEvents()
    const forward = <TKey extends keyof AnyoPlayerEventMap>(
      playerEvent: TKey,
      elementEvent: AnyoPlayerElementEventName,
    ): void => {
      this.eventCleanups.push(player.on(playerEvent, payload => {
        this.dispatchEvent(customEvent(this, elementEvent, payload))
      }))
    }
    forward('ready', 'anyo-player-ready')
    forward('error', 'anyo-player-error')
    forward('statechange', 'anyo-player-statechange')
    forward('phasechange', 'anyo-player-phasechange')
    forward('worldreplaced', 'anyo-player-worldreplaced')
    forward('themechange', 'anyo-player-themechange')
  }

  private clearPlayerEvents(): void {
    for (const cleanup of this.eventCleanups.splice(0)) cleanup()
  }

  private beginDisposal(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise
    const player = this.playerValue
    if (!player) return Promise.resolve()

    ++this.generation
    this.playerValue = null
    this.clearPlayerEvents()
    const disposal = player.disposeAsync()
      .catch(cause => {
        this.reportError(toPlayerError(cause, 'PLAYER_DISPOSED', 'Anyo Player custom element disposal failed.'))
      })
      .then(() => {
        this.dispatchEvent(customEvent(this, 'anyo-player-disposed', undefined))
      })
      .finally(() => {
        if (this.disposalPromise === disposal) this.disposalPromise = null
      })
    this.disposalPromise = disposal
    return disposal
  }

  private validateAttribute(name: string, value: string | null): void {
    if (name === 'activation') attributeValue(name, value, ACTIVATION_VALUES)
    else if (name === 'preload') attributeValue(name, value, PRELOAD_VALUES)
    else if (name === 'backend') attributeValue(name, value, BACKEND_VALUES)
  }

  private upgradeProperty(name: 'source' | 'options' | 'src'): void {
    if (!hasOwn(this, name)) return
    const value = (this as unknown as Record<string, unknown>)[name]
    delete (this as unknown as Record<string, unknown>)[name]
    ;(this as unknown as Record<string, unknown>)[name] = value
  }

  private reportError(error: AnyoPlayerError): void {
    this.dispatchEvent(customEvent(this, 'anyo-player-error', error))
  }
}

export interface AnyoPlayerElement {
  addEventListener<TKey extends keyof AnyoPlayerElementEventMap>(
    type: TKey,
    listener: (this: AnyoPlayerElement, event: AnyoPlayerElementEventMap[TKey]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener<TKey extends keyof AnyoPlayerElementEventMap>(
    type: TKey,
    listener: (this: AnyoPlayerElement, event: AnyoPlayerElementEventMap[TKey]) => void,
    options?: boolean | EventListenerOptions,
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void
}

declare global {
  interface HTMLElementTagNameMap {
    'anyo-player': AnyoPlayerElement
  }
}

export function defineAnyoPlayerElement(
  tagName = ANYO_PLAYER_ELEMENT_TAG,
): CustomElementConstructor {
  const normalizedTag = tagName.trim().toLowerCase()
  if (!normalizedTag.includes('-')) {
    throw new TypeError('A custom-element tag name must contain a hyphen.')
  }
  const registry = globalThis.customElements
  if (!registry) {
    throw new AnyoPlayerError(
      'PLAYER_INVALID_STATE',
      'Custom elements are not available in this environment.',
    )
  }
  const existing = registry.get(normalizedTag)
  if (existing) {
    if (existing === AnyoPlayerElement || existing.prototype instanceof AnyoPlayerElement) return existing
    throw new TypeError(`Custom element "${normalizedTag}" is already defined by another constructor.`)
  }
  const constructor: CustomElementConstructor = normalizedTag === ANYO_PLAYER_ELEMENT_TAG
    ? AnyoPlayerElement
    : class extends AnyoPlayerElement {}
  registry.define(normalizedTag, constructor)
  return constructor
}
