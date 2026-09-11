import type { AnyoPlayerMapTarget } from '../types.js'

export class MapController {
  private readonly targets = new Set<AnyoPlayerMapTarget>()
  private readonly attributionSubscriptions = new Map<AnyoPlayerMapTarget, () => void>()
  private disposed = false

  constructor(private readonly onAttribution: (text: string | null) => void) {}

  register(target: AnyoPlayerMapTarget): () => void {
    if (this.disposed) throw new Error('Anyo Player Map lifecycle has been disposed.')
    if (!target || typeof target !== 'object' || (
      typeof target.onPause !== 'function'
      && typeof target.onResume !== 'function'
      && typeof target.getAttribution !== 'function'
      && typeof target.onAttributionChange !== 'function'
    )) throw new TypeError('Map targets must implement lifecycle or attribution methods.')

    this.targets.add(target)
    if (typeof target.onAttributionChange === 'function') {
      const unsubscribe = target.onAttributionChange(() => this.sync())
      if (typeof unsubscribe === 'function') this.attributionSubscriptions.set(target, unsubscribe)
    }
    this.sync()

    let active = true
    return () => {
      if (!active) return
      active = false
      this.attributionSubscriptions.get(target)?.()
      this.attributionSubscriptions.delete(target)
      this.targets.delete(target)
      this.sync()
    }
  }

  setAttribution(text: string | null): void {
    if (this.disposed) return
    this.onAttribution(text)
  }

  pause(): void {
    if (this.disposed) return
    for (const target of this.targets) target.onPause?.()
  }

  resume(): void {
    if (this.disposed) return
    for (const target of this.targets) target.onResume?.()
  }

  dispose(): void {
    this.disposed = true
    for (const unsubscribe of this.attributionSubscriptions.values()) unsubscribe()
    this.attributionSubscriptions.clear()
    this.targets.clear()
    this.onAttribution(null)
  }

  get size() { return this.targets.size }

  private sync() {
    const text = [...this.targets]
      .map(target => target.getAttribution?.())
      .find((value): value is string => typeof value === 'string' && Boolean(value.trim())) ?? null
    this.onAttribution(text)
  }
}
