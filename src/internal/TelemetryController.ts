import { AnyoPlayerError } from '../errors.js'
import type {
  AnyoPlayerAnalyticsOptions,
  AnyoPlayerAnalyticsSink,
  AnyoPlayerLoadingPhase,
  AnyoPlayerState,
  AnyoPlayerTelemetryCategory,
  AnyoPlayerTelemetryEvent,
} from '../types.js'

interface TelemetryCallbacks {
  onEvent(event: AnyoPlayerTelemetryEvent): void
  onError(error: AnyoPlayerError, event: AnyoPlayerTelemetryEvent): void
}

interface TrackContext {
  state: AnyoPlayerState
  phase: AnyoPlayerLoadingPhase
}

const DEFAULT_BUFFER_SIZE = 100

function finiteInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) throw new TypeError('Analytics bufferSize must be a finite number.')
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function normalizeDetails(value: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (!value) return undefined
  const seen = new WeakSet<object>()
  const visit = (input: unknown, depth: number): unknown => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number') return Number.isFinite(input) ? input : String(input)
    if (typeof input === 'bigint') return input.toString()
    if (typeof input === 'undefined' || typeof input === 'function' || typeof input === 'symbol') return undefined
    if (depth >= 6) return '[max-depth]'
    if (typeof input !== 'object') return String(input)
    if (seen.has(input)) return '[circular]'
    seen.add(input)
    if (Array.isArray(input)) return input.map(item => visit(item, depth + 1)).filter(item => item !== undefined)
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue
      const normalized = visit(item, depth + 1)
      if (normalized !== undefined) output[key] = normalized
    }
    return output
  }
  return Object.freeze(visit(value, 0) as Record<string, unknown>)
}

export class TelemetryController {
  private readonly enabledValue: boolean
  private readonly categories: ReadonlySet<AnyoPlayerTelemetryCategory> | null
  private readonly bufferSize: number
  private readonly callbacks: TelemetryCallbacks
  private readonly now: () => Date
  private readonly sinks = new Set<AnyoPlayerAnalyticsSink>()
  private readonly historyValue: AnyoPlayerTelemetryEvent[] = []
  private sequence = 0

  constructor(
    options: false | AnyoPlayerAnalyticsOptions | undefined,
    callbacks: TelemetryCallbacks,
    now: () => Date = () => new Date(),
  ) {
    this.enabledValue = options !== false && options?.enabled !== false
    this.callbacks = callbacks
    this.now = now
    this.bufferSize = finiteInteger(options === false ? undefined : options?.bufferSize, DEFAULT_BUFFER_SIZE, 0, 1000)
    this.categories = options !== false && options?.categories?.length
      ? new Set(options.categories)
      : null
    if (options !== false && options?.sink) {
      const initial = Array.isArray(options.sink) ? options.sink : [options.sink]
      for (const sink of initial) this.register(sink)
    }
  }

  get enabled(): boolean { return this.enabledValue }
  get history(): readonly AnyoPlayerTelemetryEvent[] { return this.historyValue.map(event => structuredClone(event)) }

  register(sink: AnyoPlayerAnalyticsSink): () => void {
    if (typeof sink !== 'function') throw new TypeError('Analytics sink must be a function.')
    this.sinks.add(sink)
    return () => this.sinks.delete(sink)
  }

  clear(): void { this.historyValue.length = 0 }

  track(
    name: string,
    category: AnyoPlayerTelemetryCategory,
    context: TrackContext,
    details?: Record<string, unknown>,
  ): AnyoPlayerTelemetryEvent | null {
    if (!this.enabledValue || (this.categories && !this.categories.has(category))) return null
    const normalizedName = name.trim()
    if (!normalizedName) throw new TypeError('Telemetry event name must not be empty.')
    const normalizedDetails = normalizeDetails(details)
    const event: AnyoPlayerTelemetryEvent = Object.freeze({
      format: '@blcklab/anyo-player/telemetry',
      version: 1,
      sequence: ++this.sequence,
      name: normalizedName,
      category,
      timestamp: this.now().toISOString(),
      state: context.state,
      phase: context.phase,
      ...(normalizedDetails === undefined ? {} : { details: normalizedDetails }),
    })
    if (this.bufferSize > 0) {
      this.historyValue.push(event)
      if (this.historyValue.length > this.bufferSize) this.historyValue.splice(0, this.historyValue.length - this.bufferSize)
    }
    this.callbacks.onEvent(structuredClone(event))
    for (const sink of [...this.sinks]) {
      try {
        void Promise.resolve(sink(structuredClone(event))).catch(cause => {
          this.callbacks.onError(new AnyoPlayerError(
            'PLAYER_ANALYTICS_SINK_FAILED',
            `An Anyo Player analytics sink rejected the "${event.name}" event.`,
            { cause },
          ), event)
        })
      } catch (cause) {
        this.callbacks.onError(new AnyoPlayerError(
          'PLAYER_ANALYTICS_SINK_FAILED',
          `An Anyo Player analytics sink threw while handling the "${event.name}" event.`,
          { cause },
        ), event)
      }
    }
    return structuredClone(event)
  }
}
