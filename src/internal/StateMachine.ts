import { AnyoPlayerError } from '../errors.js'
import type { AnyoPlayerState } from '../types.js'

const ALLOWED_TRANSITIONS: Readonly<Record<AnyoPlayerState, ReadonlySet<AnyoPlayerState>>> = {
  idle: new Set(['loading', 'error', 'disposing']),
  loading: new Set(['ready', 'error', 'disposing']),
  ready: new Set(['entering', 'paused', 'replacing', 'vr-entering', 'error', 'disposing']),
  entering: new Set(['running', 'ready', 'paused', 'replacing', 'vr-entering', 'error', 'disposing']),
  running: new Set(['ready', 'paused', 'replacing', 'vr-entering', 'error', 'disposing']),
  paused: new Set(['ready', 'replacing', 'error', 'disposing']),
  replacing: new Set(['ready', 'paused', 'error', 'disposing']),
  'vr-entering': new Set(['vr-active', 'ready', 'error', 'disposing']),
  'vr-active': new Set(['vr-exiting', 'ready', 'error', 'disposing']),
  'vr-exiting': new Set(['vr-active', 'ready', 'error', 'disposing']),
  error: new Set(['loading', 'disposing']),
  disposing: new Set(['disposed']),
  disposed: new Set(),
}

export class StateMachine {
  private current: AnyoPlayerState = 'idle'

  get state(): AnyoPlayerState {
    return this.current
  }

  transition(next: AnyoPlayerState): { previous: AnyoPlayerState; state: AnyoPlayerState } | null {
    if (this.current === next) return null
    if (!ALLOWED_TRANSITIONS[this.current].has(next)) {
      throw new AnyoPlayerError(
        this.current === 'disposed' || this.current === 'disposing'
          ? 'PLAYER_DISPOSED'
          : 'PLAYER_INVALID_STATE',
        `Cannot transition Anyo Player from "${this.current}" to "${next}".`,
      )
    }
    const previous = this.current
    this.current = next
    return { previous, state: next }
  }
}
