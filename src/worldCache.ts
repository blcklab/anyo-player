import type { AnyoPlayerWorldCache, AnyoPlayerWorldCacheEntry } from './types.js'

function cloneEntry(entry: AnyoPlayerWorldCacheEntry): AnyoPlayerWorldCacheEntry {
  return structuredClone(entry)
}

/** Small deterministic cache suitable for tests, previews, and host-managed offline policy. */
export class AnyoPlayerMemoryWorldCache implements AnyoPlayerWorldCache {
  private readonly values = new Map<string, AnyoPlayerWorldCacheEntry>()

  get(key: string): AnyoPlayerWorldCacheEntry | null {
    const entry = this.values.get(key)
    return entry ? cloneEntry(entry) : null
  }

  set(key: string, entry: AnyoPlayerWorldCacheEntry): void {
    this.values.set(key, cloneEntry(entry))
  }

  delete(key: string): void { this.values.delete(key) }
  clear(): void { this.values.clear() }
}

/**
 * Creates a JSON-document cache backed by the browser Cache Storage API.
 * It stores only world documents and metadata; referenced assets remain under
 * the host/service-worker caching policy.
 */
export function createAnyoPlayerCacheStorageWorldCache(
  cacheName = '@blcklab/anyo-player:worlds',
): AnyoPlayerWorldCache {
  const cachesValue = globalThis.caches
  if (!cachesValue) throw new TypeError('Cache Storage is unavailable in this environment.')
  const requestFor = (key: string): Request => new Request(`https://anyo-player.invalid/cache/${encodeURIComponent(key)}`)
  return {
    async get(key) {
      const cache = await cachesValue.open(cacheName)
      const response = await cache.match(requestFor(key))
      if (!response) return null
      return await response.json() as AnyoPlayerWorldCacheEntry
    },
    async set(key, entry) {
      const cache = await cachesValue.open(cacheName)
      await cache.put(requestFor(key), new Response(JSON.stringify(entry), { headers: { 'content-type': 'application/json' } }))
    },
    async delete(key) {
      const cache = await cachesValue.open(cacheName)
      await cache.delete(requestFor(key))
    },
    async clear() { await cachesValue.delete(cacheName) },
  }
}
