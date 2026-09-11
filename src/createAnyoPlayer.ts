import { AnyoPlayerCore } from './internal/AnyoPlayerCore.js'
import type { AnyoPlayer, AnyoPlayerOptions } from './types.js'

export function createAnyoPlayer(options: AnyoPlayerOptions): AnyoPlayer {
  return new AnyoPlayerCore(options)
}
