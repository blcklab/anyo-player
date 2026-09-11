import { AnyoPlayerError } from '../errors.js'
import type {
  AnyoPlayerAudioOptions,
  AnyoPlayerAudioState,
  AnyoPlayerAudioTarget,
} from '../types.js'

export interface AudioControllerCallbacks {
  onChange(previousMuted: boolean, state: AnyoPlayerAudioState, source: 'runtime' | 'pause' | 'resume' | 'target'): void
  onUnlocked(state: AnyoPlayerAudioState): void
  onError(error: AnyoPlayerError): void
}

export class AudioController {
  private readonly enabledValue: boolean
  private readonly unlockOnEnterValue: boolean
  private readonly muteOnPauseValue: boolean
  private readonly callbacks: AudioControllerCallbacks
  private readonly targets = new Set<AnyoPlayerAudioTarget>()
  private mutedValue: boolean
  private unlockedValue = false
  private blockedValue = false
  private pauseMuted = false
  private disposed = false

  constructor(options: false | AnyoPlayerAudioOptions | undefined, callbacks: AudioControllerCallbacks) {
    this.enabledValue = options !== false
    this.unlockOnEnterValue = options !== false && (options?.unlockOnEnter ?? true)
    this.muteOnPauseValue = options !== false && (options?.muteOnPause ?? false)
    this.mutedValue = options !== false && (options?.muted ?? false)
    this.callbacks = callbacks
    if (options !== false) {
      for (const target of options?.targets ?? []) {
        this.assertTarget(target)
        this.targets.add(target)
        void this.initializeTarget(target)
      }
    }
  }

  get enabled(): boolean { return this.enabledValue }
  get unlockOnEnter(): boolean { return this.unlockOnEnterValue }
  get muteOnPause(): boolean { return this.muteOnPauseValue }
  get state(): AnyoPlayerAudioState {
    return {
      enabled: this.enabledValue,
      muted: this.mutedValue,
      unlocked: this.unlockedValue,
      blocked: this.blockedValue,
      targetCount: this.targets.size,
    }
  }

  register(target: AnyoPlayerAudioTarget): () => void {
    this.assertEnabled()
    this.assertTarget(target)
    this.targets.add(target)
    void this.initializeTarget(target)
    this.callbacks.onChange(this.mutedValue, this.state, 'target')
    let active = true
    return () => {
      if (!active) return
      active = false
      this.targets.delete(target)
      this.callbacks.onChange(this.mutedValue, this.state, 'target')
    }
  }

  markBlocked(): void {
    if (!this.enabledValue || this.disposed || this.blockedValue) return
    this.blockedValue = true
    this.callbacks.onChange(this.mutedValue, this.state, 'target')
  }

  async unlock(): Promise<AnyoPlayerAudioState> {
    this.assertEnabled()
    try {
      for (const target of this.targets) await target.unlock?.()
      this.unlockedValue = true
      this.blockedValue = false
      for (const target of this.targets) await this.applyMutedToTarget(target, this.effectiveMuted())
      const state = this.state
      this.callbacks.onUnlocked(state)
      this.callbacks.onChange(this.mutedValue, state, 'runtime')
      return state
    } catch (cause) {
      const error = new AnyoPlayerError(
        'PLAYER_AUDIO_UNLOCK_FAILED',
        'Anyo Player could not unlock audio from the current user gesture.',
        { cause },
      )
      this.callbacks.onError(error)
      throw error
    }
  }

  async setMuted(muted: boolean, source: 'runtime' | 'pause' | 'resume' = 'runtime'): Promise<AnyoPlayerAudioState> {
    this.assertEnabled()
    const previousMuted = this.mutedValue
    this.mutedValue = Boolean(muted)
    try {
      for (const target of this.targets) await this.applyMutedToTarget(target, this.effectiveMuted())
    } catch (cause) {
      this.mutedValue = previousMuted
      const error = new AnyoPlayerError(
        'PLAYER_AUDIO_CONTROL_FAILED',
        'Anyo Player could not update the audio mute state.',
        { cause },
      )
      this.callbacks.onError(error)
      throw error
    }
    const state = this.state
    this.callbacks.onChange(previousMuted, state, source)
    return state
  }

  async pause(): Promise<void> {
    if (!this.enabledValue || this.pauseMuted) return
    this.pauseMuted = this.muteOnPauseValue
    try {
      for (const target of this.targets) {
        await target.onPause?.()
        if (this.muteOnPauseValue) await this.applyMutedToTarget(target, true)
      }
      this.callbacks.onChange(this.mutedValue, this.state, 'pause')
    } catch (cause) {
      this.callbacks.onError(new AnyoPlayerError(
        'PLAYER_AUDIO_CONTROL_FAILED',
        'Anyo Player could not pause registered audio targets.',
        { cause },
      ))
    }
  }

  async resume(): Promise<void> {
    if (!this.enabledValue) return
    const restoreMute = this.pauseMuted
    this.pauseMuted = false
    try {
      for (const target of this.targets) {
        await target.onResume?.()
        if (restoreMute) await this.applyMutedToTarget(target, this.mutedValue)
      }
      this.callbacks.onChange(this.mutedValue, this.state, 'resume')
    } catch (cause) {
      this.callbacks.onError(new AnyoPlayerError(
        'PLAYER_AUDIO_CONTROL_FAILED',
        'Anyo Player could not resume registered audio targets.',
        { cause },
      ))
    }
  }

  dispose(): void {
    this.disposed = true
    this.targets.clear()
  }

  private effectiveMuted(): boolean {
    return this.mutedValue || this.pauseMuted
  }

  private async applyMutedToTarget(target: AnyoPlayerAudioTarget, muted: boolean): Promise<void> {
    await target.setMuted?.(muted)
  }

  private async initializeTarget(target: AnyoPlayerAudioTarget): Promise<void> {
    try {
      await this.applyMutedToTarget(target, this.effectiveMuted())
    } catch (cause) {
      this.callbacks.onError(new AnyoPlayerError(
        'PLAYER_AUDIO_CONTROL_FAILED',
        'Anyo Player could not initialize the registered audio target.',
        { cause },
      ))
    }
  }

  private assertTarget(target: AnyoPlayerAudioTarget): void {
    if (
      !target
      || typeof target !== 'object'
      || (
        typeof target.unlock !== 'function'
        && typeof target.setMuted !== 'function'
        && typeof target.onPause !== 'function'
        && typeof target.onResume !== 'function'
      )
    ) {
      throw new TypeError('Audio targets must implement at least one supported audio lifecycle method.')
    }
  }

  private assertEnabled(): void {
    if (this.disposed) throw new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player audio has been disposed.')
    if (!this.enabledValue) {
      throw new AnyoPlayerError('PLAYER_AUDIO_DISABLED', 'Audio controls are disabled for this Anyo Player.')
    }
  }
}
