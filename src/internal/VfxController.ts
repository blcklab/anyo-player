import type { AnyoPlayerVfxTarget } from '../types.js'

export class VfxController {
  private readonly targets = new Set<AnyoPlayerVfxTarget>()
  private disposed = false
  register(target: AnyoPlayerVfxTarget): () => void {
    if (this.disposed) throw new Error('Anyo Player VFX lifecycle has been disposed.')
    if (!target || typeof target !== 'object' || (typeof target.onPause !== 'function' && typeof target.onResume !== 'function')) throw new TypeError('VFX targets must implement onPause() or onResume().')
    this.targets.add(target)
    let active = true
    return () => { if (!active) return; active = false; this.targets.delete(target) }
  }
  pause(): void { if (this.disposed) return; for (const target of this.targets) target.onPause?.() }
  resume(): void { if (this.disposed) return; for (const target of this.targets) target.onResume?.() }
  dispose(): void { this.disposed = true; this.targets.clear() }
  get size(): number { return this.targets.size }
}
