import type {
  AnyoPlayerCaptionOptions,
  AnyoPlayerCaptionState,
  AnyoPlayerCaptionTarget,
} from '../types.js'

const EMPTY_CAPTION: AnyoPlayerCaptionState = Object.freeze({
  visible: false,
  text: '',
  speaker: null,
  language: null,
  startedAt: null,
  expiresAt: null,
})

function clone(value: AnyoPlayerCaptionState): AnyoPlayerCaptionState { return { ...value } }

export class CaptionController {
  private readonly targets = new Set<AnyoPlayerCaptionTarget>()
  private value: AnyoPlayerCaptionState = clone(EMPTY_CAPTION)
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly now: () => Date,
    private readonly onChange: ((previous: AnyoPlayerCaptionState, caption: AnyoPlayerCaptionState) => void) | null = null,
  ) {}

  get state(): AnyoPlayerCaptionState { return clone(this.value) }

  register(target: AnyoPlayerCaptionTarget): () => void {
    if (!target || typeof target.showCaption !== 'function' || typeof target.clearCaption !== 'function') {
      throw new TypeError('Caption targets must provide showCaption(caption) and clearCaption().')
    }
    this.targets.add(target)
    if (this.value.visible) target.showCaption(this.state)
    else target.clearCaption()
    return () => this.targets.delete(target)
  }

  show(text: string, options: AnyoPlayerCaptionOptions = {}): AnyoPlayerCaptionState {
    const normalized = text.trim()
    if (!normalized) throw new TypeError('Caption text must not be empty.')
    const duration = options.durationMs
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0 || duration > 60 * 60 * 1000)) {
      throw new TypeError('caption.durationMs must be between 0 and 3600000 milliseconds.')
    }
    this.clearTimer()
    const started = this.now()
    const expires = duration && duration > 0 ? new Date(started.getTime() + duration) : null
    const previous = this.state
    this.value = {
      visible: true,
      text: normalized,
      speaker: options.speaker?.trim() || null,
      language: options.language?.trim() || null,
      startedAt: started.toISOString(),
      expiresAt: expires?.toISOString() ?? null,
    }
    const snapshot = this.state
    for (const target of this.targets) target.showCaption(snapshot)
    this.onChange?.(previous, snapshot)
    if (duration && duration > 0) this.timer = setTimeout(() => this.clear(), duration)
    return snapshot
  }

  clear(): AnyoPlayerCaptionState {
    this.clearTimer()
    const previous = this.state
    if (!previous.visible && previous.text === '') return previous
    this.value = clone(EMPTY_CAPTION)
    for (const target of this.targets) target.clearCaption()
    const snapshot = this.state
    this.onChange?.(previous, snapshot)
    return snapshot
  }

  dispose(): void {
    this.clear()
    this.targets.clear()
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
