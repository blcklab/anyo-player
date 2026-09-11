export class EventHub<TEventMap extends object> {
  private readonly listeners = new Map<keyof TEventMap, Set<(payload: never) => void>>()

  on<TKey extends keyof TEventMap>(event: TKey, listener: (payload: TEventMap[TKey]) => void): () => void {
    let bucket = this.listeners.get(event)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(event, bucket)
    }
    bucket.add(listener as (payload: never) => void)
    return () => {
      bucket?.delete(listener as (payload: never) => void)
      if (bucket?.size === 0) this.listeners.delete(event)
    }
  }

  emit<TKey extends keyof TEventMap>(event: TKey, payload: TEventMap[TKey]): void {
    const bucket = this.listeners.get(event)
    if (!bucket) return
    for (const listener of [...bucket]) listener(payload as never)
  }

  clear(): void {
    this.listeners.clear()
  }
}
