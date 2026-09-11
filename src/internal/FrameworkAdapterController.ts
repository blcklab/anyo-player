import { createAnyoPlayer } from '../createAnyoPlayer.js'
import { AnyoPlayerError, toPlayerError } from '../errors.js'
import type {
  AnyoPlayer,
  AnyoPlayerEventMap,
  AnyoPlayerOptions,
  AnyoPlayerSource,
} from '../types.js'

export type AnyoPlayerAdapterOptions = Omit<
  AnyoPlayerOptions,
  'container' | 'canvas' | 'source'
>

export type AnyoPlayerFactory = (options: AnyoPlayerOptions) => AnyoPlayer

export interface FrameworkAdapterCallbacks {
  playerchange?: (player: AnyoPlayer | null) => void
  ready?: (event: AnyoPlayerEventMap['ready']) => void
  error?: (error: AnyoPlayerError) => void
  statechange?: (event: AnyoPlayerEventMap['statechange']) => void
  phasechange?: (event: AnyoPlayerEventMap['phasechange']) => void
  worldreplaced?: (event: AnyoPlayerEventMap['worldreplaced']) => void
  themechange?: (event: AnyoPlayerEventMap['themechange']) => void
  disposed?: () => void
}

function hasSource(source: AnyoPlayerSource | null | undefined): source is AnyoPlayerSource {
  return source !== null && source !== undefined
}

/**
 * Shared lifecycle authority for framework adapters.
 *
 * The controller deliberately owns no rendering or input behavior. It only
 * constructs the framework-neutral Player, forwards a small event surface,
 * serializes source replacement, and awaits teardown between generations.
 */
export class FrameworkAdapterController {
  private readonly factory: AnyoPlayerFactory
  private callbacks: FrameworkAdapterCallbacks
  private playerValue: AnyoPlayer | null = null
  private generation = 0
  private sourceRevision = 0
  private sourceValue: AnyoPlayerSource | null = null
  private disposalPromise: Promise<void> | null = null
  private sourceQueue: Promise<void> = Promise.resolve()
  private eventCleanups: Array<() => void> = []

  constructor(
    callbacks: FrameworkAdapterCallbacks = {},
    factory: AnyoPlayerFactory = createAnyoPlayer,
  ) {
    this.callbacks = callbacks
    this.factory = factory
  }

  get player(): AnyoPlayer | null {
    return this.playerValue
  }

  get source(): AnyoPlayerSource | null {
    return this.sourceValue
  }

  setCallbacks(callbacks: FrameworkAdapterCallbacks): void {
    this.callbacks = callbacks
  }

  async mount(
    container: HTMLElement,
    source: AnyoPlayerSource | null | undefined,
    options: AnyoPlayerAdapterOptions = {},
  ): Promise<AnyoPlayer | null> {
    this.sourceValue = source ?? null
    if (this.playerValue) return this.playerValue

    const generation = ++this.generation
    if (this.disposalPromise) await this.disposalPromise
    if (generation !== this.generation) return null

    let player: AnyoPlayer
    try {
      player = this.factory({
        ...options,
        container,
        ...(hasSource(this.sourceValue) ? { source: this.sourceValue } : {}),
      })
    } catch (cause) {
      const error = toPlayerError(
        cause,
        'PLAYER_INVALID_STATE',
        'The framework adapter could not create Anyo Player.',
      )
      this.callbacks.error?.(error)
      throw error
    }

    if (generation !== this.generation) {
      await player.disposeAsync()
      return null
    }

    this.playerValue = player
    this.bindPlayerEvents(player)
    this.callbacks.playerchange?.(player)
    return player
  }

  async requirePlayer(): Promise<AnyoPlayer> {
    if (this.playerValue) return this.playerValue
    if (this.disposalPromise) await this.disposalPromise
    if (this.playerValue) return this.playerValue
    throw new AnyoPlayerError(
      'PLAYER_INVALID_STATE',
      'The framework adapter is not mounted.',
    )
  }

  setSource(source: AnyoPlayerSource | null | undefined): Promise<void> {
    this.sourceValue = source ?? null
    const revision = ++this.sourceRevision
    const player = this.playerValue
    if (!player || !hasSource(this.sourceValue)) return Promise.resolve()
    const nextSource = this.sourceValue

    const operation = this.sourceQueue
      .catch(() => undefined)
      .then(async () => {
        if (
          revision !== this.sourceRevision ||
          player !== this.playerValue ||
          this.generation <= 0
        ) return
        try {
          await player.replaceWorld(nextSource)
        } catch (cause) {
          if (revision !== this.sourceRevision || player !== this.playerValue) return
          const error = toPlayerError(
            cause,
            'PLAYER_WORLD_REPLACE_FAILED',
            'The framework adapter could not replace the active Anyo world.',
          )
          this.callbacks.error?.(error)
          throw error
        }
      })

    this.sourceQueue = operation
    return operation
  }

  async load(source?: AnyoPlayerSource): Promise<void> {
    if (source !== undefined) this.sourceValue = source
    const player = await this.requirePlayer()
    await player.load(source)
  }

  async activate(): Promise<void> {
    const player = await this.requirePlayer()
    await player.activate()
  }

  async replaceWorld(source: AnyoPlayerSource): Promise<void> {
    this.sourceValue = source
    const player = await this.requirePlayer()
    await player.replaceWorld(source)
  }

  disposeAsync(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise

    ++this.generation
    ++this.sourceRevision
    const player = this.playerValue
    this.playerValue = null
    this.clearPlayerEvents()
    this.callbacks.playerchange?.(null)

    if (!player) return Promise.resolve()

    const disposal = player.disposeAsync()
      .catch(cause => {
        const error = toPlayerError(
          cause,
          'PLAYER_DISPOSED',
          'The framework adapter could not dispose Anyo Player cleanly.',
        )
        this.callbacks.error?.(error)
      })
      .then(() => {
        this.callbacks.disposed?.()
      })
      .finally(() => {
        if (this.disposalPromise === disposal) this.disposalPromise = null
      })

    this.disposalPromise = disposal
    return disposal
  }

  private bindPlayerEvents(player: AnyoPlayer): void {
    this.clearPlayerEvents()
    const forward = <TKey extends keyof Pick<
      AnyoPlayerEventMap,
      'ready' | 'error' | 'statechange' | 'phasechange' | 'worldreplaced' | 'themechange'
    >>(event: TKey): void => {
      this.eventCleanups.push(player.on(event, payload => {
        const callback = this.callbacks[event] as ((value: typeof payload) => void) | undefined
        callback?.(payload)
      }))
    }

    forward('ready')
    forward('error')
    forward('statechange')
    forward('phasechange')
    forward('worldreplaced')
    forward('themechange')
  }

  private clearPlayerEvents(): void {
    for (const cleanup of this.eventCleanups.splice(0)) cleanup()
  }
}
