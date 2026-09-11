import { migrateWorldDocument, type WorldDocument } from '@blcklab/anyo'
import { AnyoPlayerError, isAbortError } from '../errors.js'
import type {
  AnyoPlayerArchiveSource,
  AnyoPlayerBlobSource,
  AnyoPlayerCacheMode,
  AnyoPlayerDocumentSource,
  AnyoPlayerFileMapSource,
  AnyoPlayerJsonSource,
  AnyoPlayerLoadingOptions,
  AnyoPlayerSource,
  AnyoPlayerSourceInfo,
  AnyoPlayerUrlSource,
  AnyoPlayerVirtualFileSystem,
  AnyoPlayerWorldCache,
  AnyoPlayerWorldCacheEntry,
} from '../types.js'
import { resolveDocumentResourceUrls, resolveDocumentResourceUrlsWith } from './sourceUrls.js'

export interface ResolvedPlayerSource {
  document: WorldDocument
  documentUrl?: string
  info: AnyoPlayerSourceInfo
  cleanup?: () => void
}

export interface SourceResolverOptions {
  baseUrl?: string | URL
  fetch?: typeof globalThis.fetch
  loading?: false | AnyoPlayerLoadingOptions
}

interface NormalizedLoadingOptions {
  cache: AnyoPlayerWorldCache | null
  cacheMode: AnyoPlayerCacheMode
  migrate: boolean
  verifyIntegrity: boolean
  maxDocumentBytes: number
  archiveDecoder: AnyoPlayerLoadingOptions['archiveDecoder']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isWorldDocument(value: unknown): value is WorldDocument {
  return isRecord(value) && typeof value.version === 'string'
}

function isUrlSource(value: unknown): value is AnyoPlayerUrlSource {
  return isRecord(value) && 'url' in value && (typeof value.url === 'string' || value.url instanceof URL)
}

function isJsonSource(value: unknown): value is AnyoPlayerJsonSource {
  return isRecord(value) && typeof value.json === 'string'
}

function isDocumentSource(value: unknown): value is AnyoPlayerDocumentSource {
  return isRecord(value) && 'document' in value && isWorldDocument(value.document)
}

function isBlobSource(value: unknown): value is AnyoPlayerBlobSource {
  return isRecord(value) && value.blob instanceof Blob
}

function isFileMapSource(value: unknown): value is AnyoPlayerFileMapSource {
  return isRecord(value) && 'files' in value && (value.files instanceof Map || isRecord(value.files))
}

function isArchiveSource(value: unknown): value is AnyoPlayerArchiveSource {
  return isRecord(value) && 'archive' in value && (value.archive instanceof Blob || value.archive instanceof ArrayBuffer)
}

function cloneDocument(document: WorldDocument): WorldDocument { return structuredClone(document) }
function currentLocationHref(): string | undefined { return typeof globalThis.location?.href === 'string' ? globalThis.location.href : undefined }

function normalizeLoading(value: false | AnyoPlayerLoadingOptions | undefined): NormalizedLoadingOptions {
  if (value === false) return { cache: null, cacheMode: 'network-only', migrate: true, verifyIntegrity: true, maxDocumentBytes: 16 * 1024 * 1024, archiveDecoder: undefined }
  const maxDocumentBytes = value?.maxDocumentBytes ?? 16 * 1024 * 1024
  if (!Number.isFinite(maxDocumentBytes) || maxDocumentBytes < 1024 || maxDocumentBytes > 256 * 1024 * 1024) {
    throw new TypeError('loading.maxDocumentBytes must be between 1 KiB and 256 MiB.')
  }
  const cacheMode = value?.cacheMode ?? 'network-first'
  if (!['network-first', 'cache-first', 'offline-first', 'network-only'].includes(cacheMode)) throw new TypeError('loading.cacheMode is invalid.')
  return {
    cache: value?.cache === false || !value?.cache ? null : value.cache,
    cacheMode,
    migrate: value?.migrate !== false,
    verifyIntegrity: value?.verifyIntegrity !== false,
    maxDocumentBytes: Math.trunc(maxDocumentBytes),
    archiveDecoder: value?.archiveDecoder,
  }
}

function utf8Bytes(value: string): Uint8Array { return new TextEncoder().encode(value) }

function parseJson(json: string): WorldDocument {
  let value: unknown
  try { value = JSON.parse(json) } catch (error) {
    throw new AnyoPlayerError('PLAYER_JSON_PARSE_FAILED', 'The Anyo Player source contains invalid JSON.', { cause: error })
  }
  if (!isWorldDocument(value)) throw new AnyoPlayerError('PLAYER_INVALID_SOURCE', 'The parsed Anyo Player source must be a JSON object with a string version field.')
  return value
}

function normalizePath(value: string): string {
  const parts: string[] = []
  for (const part of value.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function directoryOf(path: string): string {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index + 1)
}

function isAbsoluteResource(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)
}

function toMap(files: AnyoPlayerVirtualFileSystem['files']): Map<string, Blob | ArrayBuffer | string> {
  const result = new Map<string, Blob | ArrayBuffer | string>()
  const entries = files instanceof Map ? files.entries() : Object.entries(files)
  for (const [key, value] of entries) result.set(normalizePath(key), value)
  return result
}

function selectEntry(files: ReadonlyMap<string, unknown>, requested?: string): string {
  if (requested) {
    const normalized = normalizePath(requested)
    if (!files.has(normalized)) throw new AnyoPlayerError('PLAYER_PACKAGE_ENTRY_MISSING', `World package entry "${normalized}" does not exist.`)
    return normalized
  }
  const preferred = ['world.anyo.json', 'world.json', 'anyo.json']
  for (const value of preferred) if (files.has(value)) return value
  const candidates = [...files.keys()].filter(value => value.endsWith('.anyo.json') || value.endsWith('.json')).sort()
  const first = candidates[0]
  if (!first) throw new AnyoPlayerError('PLAYER_PACKAGE_ENTRY_MISSING', 'World package contains no .anyo.json or .json entry.')
  return first
}

async function asBytes(value: Blob | ArrayBuffer | string, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw signal.reason
  if (typeof value === 'string') return utf8Bytes(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(await value.arrayBuffer())
}

function bytesToText(bytes: Uint8Array): string { return new TextDecoder().decode(bytes) }

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  if (typeof btoa === 'function') return btoa(binary)
  const BufferValue = (globalThis as { Buffer?: { from(value: Uint8Array): { toString(format: string): string } } }).Buffer
  if (BufferValue) return BufferValue.from(bytes).toString('base64')
  throw new TypeError('Base64 encoding is unavailable.')
}

function toDigestBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer
  if (buffer instanceof ArrayBuffer) {
    if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) return buffer
    return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  return Uint8Array.from(bytes).buffer
}

async function verifyIntegrity(bytes: Uint8Array, integrity: string | undefined, required: boolean): Promise<AnyoPlayerSourceInfo['integrity']> {
  if (!integrity) return 'not-requested'
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    if (required) throw new AnyoPlayerError('PLAYER_INTEGRITY_UNAVAILABLE', 'SHA-256 integrity verification is unavailable in this environment.')
    return 'unavailable'
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', toDigestBuffer(bytes)))
  const expected = integrity.trim()
  const actualBase64 = `sha256-${encodeBase64(digest)}`
  const actualHex = [...digest].map(value => value.toString(16).padStart(2, '0')).join('')
  const matches = expected === actualBase64 || expected.toLowerCase() === `sha256:${actualHex}` || expected.toLowerCase() === actualHex
  if (!matches) throw new AnyoPlayerError('PLAYER_INTEGRITY_FAILED', 'The Anyo world source failed SHA-256 integrity verification.')
  return 'verified'
}

export class SourceResolver {
  private readonly baseUrl: string | undefined
  private readonly fetchImplementation: typeof globalThis.fetch | undefined
  private readonly loading: NormalizedLoadingOptions

  constructor(options: SourceResolverOptions = {}) {
    const fallbackBase = currentLocationHref()
    if (options.baseUrl !== undefined) {
      try { this.baseUrl = new URL(String(options.baseUrl), fallbackBase).href } catch (error) {
        throw new AnyoPlayerError('PLAYER_INVALID_SOURCE', `Invalid Anyo Player baseUrl "${String(options.baseUrl)}".`, { cause: error })
      }
    } else this.baseUrl = fallbackBase
    const fetchImplementation = options.fetch ?? globalThis.fetch
    this.fetchImplementation = fetchImplementation ? ((input, init) => Reflect.apply(fetchImplementation, globalThis, [input, init])) : undefined
    this.loading = normalizeLoading(options.loading)
  }

  async resolve(source: AnyoPlayerSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    if (signal.aborted) throw this.abortedError(signal.reason)
    if (source instanceof URL) return this.fetchUrl({ url: source }, signal)
    if (source instanceof Blob) return this.resolveBlob({ blob: source, name: 'world.anyo.json' }, signal)
    if (typeof source === 'string') {
      const trimmed = source.trimStart()
      if (trimmed.startsWith('{')) return this.finish(parseJson(source), { kind: 'json', bytes: utf8Bytes(source).byteLength }, undefined, undefined, 'not-requested')
      return this.fetchUrl({ url: source }, signal)
    }
    if (isWorldDocument(source)) return this.finish(cloneDocument(source), { kind: 'document', bytes: null }, undefined, undefined, 'not-requested')
    if (isDocumentSource(source)) return this.finish(cloneDocument(source.document), { kind: 'document', bytes: null }, undefined, undefined, 'not-requested')
    if (isJsonSource(source)) return this.resolveJson(source, signal)
    if (isUrlSource(source)) return this.fetchUrl(source, signal)
    if (isBlobSource(source)) return this.resolveBlob(source, signal)
    if (isFileMapSource(source)) return this.resolveFileMap(source, signal)
    if (isArchiveSource(source)) return this.resolveArchive(source, signal)
    throw new AnyoPlayerError('PLAYER_INVALID_SOURCE', 'Unsupported Anyo Player source. Use a WorldDocument, JSON, URL, Blob/File, virtual file map, or archive source.')
  }

  private async resolveJson(source: AnyoPlayerJsonSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    const bytes = utf8Bytes(source.json)
    this.assertSize(bytes.byteLength)
    const integrity = await verifyIntegrity(bytes, source.integrity, this.loading.verifyIntegrity)
    const documentUrl = source.baseUrl ? new URL(String(source.baseUrl), this.baseUrl).href : undefined
    return this.finish(parseJson(source.json), { kind: 'json', bytes: bytes.byteLength }, documentUrl, undefined, integrity)
  }

  private async resolveBlob(source: AnyoPlayerBlobSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    const bytes = await asBytes(source.blob, signal)
    this.assertSize(bytes.byteLength)
    const integrity = await verifyIntegrity(bytes, source.integrity, this.loading.verifyIntegrity)
    const documentUrl = source.baseUrl ? new URL(String(source.baseUrl), this.baseUrl).href : undefined
    return this.finish(parseJson(bytesToText(bytes)), { kind: 'blob', bytes: bytes.byteLength }, documentUrl, undefined, integrity)
  }

  private async resolveArchive(source: AnyoPlayerArchiveSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    const decoder = source.decoder ?? this.loading.archiveDecoder
    if (!decoder) throw new AnyoPlayerError('PLAYER_ARCHIVE_DECODER_REQUIRED', 'Archive loading requires a trusted host-provided decoder.')
    const bytes = await asBytes(source.archive, signal)
    this.assertSize(bytes.byteLength)
    const integrity = await verifyIntegrity(bytes, source.integrity, this.loading.verifyIntegrity)
    const decoded = await decoder(source.archive, signal)
    const resolved = await this.resolveFileMap({ ...decoded, ...(source.entry ? { entry: source.entry } : {}) }, signal)
    return { ...resolved, info: { ...resolved.info, kind: 'archive', bytes: bytes.byteLength, integrity } }
  }

  private async resolveFileMap(source: AnyoPlayerFileMapSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    const files = toMap(source.files)
    const entry = selectEntry(files, source.entry)
    const entryValue = files.get(entry)
    if (entryValue === undefined) throw new AnyoPlayerError('PLAYER_PACKAGE_ENTRY_MISSING', `World package entry "${entry}" is missing.`)
    const bytes = await asBytes(entryValue, signal)
    this.assertSize(bytes.byteLength)
    const integrity = await verifyIntegrity(bytes, source.integrity, this.loading.verifyIntegrity)
    const createdUrls: string[] = []
    const entryDirectory = directoryOf(entry)
    const baseUrl = source.baseUrl ? new URL(String(source.baseUrl), this.baseUrl).href : undefined
    const resolver = (value: string): string => {
      if (isAbsoluteResource(value)) return value
      const path = normalizePath(`${entryDirectory}${value}`)
      const asset = files.get(path)
      if (asset === undefined) {
        if (baseUrl) { try { return new URL(value, baseUrl).href } catch { return value } }
        return value
      }
      if (!globalThis.URL?.createObjectURL) return value
      const blob = asset instanceof Blob ? asset : new Blob([asset])
      const url = URL.createObjectURL(blob)
      createdUrls.push(url)
      return url
    }
    const cleanup = () => { for (const url of createdUrls.splice(0)) URL.revokeObjectURL?.(url) }
    const parsed = parseJson(bytesToText(bytes))
    const migrated = this.migrate(parsed)
    const document = resolveDocumentResourceUrlsWith(migrated.document, resolver)
    return {
      document,
      info: {
        kind: 'file-map', url: null, bytes: bytes.byteLength, cache: 'none', integrity,
        migratedFrom: migrated.from, documentVersion: document.version,
      },
      cleanup,
    }
  }

  private async fetchUrl(source: AnyoPlayerUrlSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    if (!this.fetchImplementation) throw new AnyoPlayerError('PLAYER_FETCH_UNAVAILABLE', 'Loading an Anyo world URL requires fetch support.')
    let url: URL
    try { url = new URL(String(source.url), this.baseUrl) } catch (error) {
      throw new AnyoPlayerError('PLAYER_INVALID_SOURCE', `Cannot resolve Anyo world URL "${String(source.url)}" without a valid base URL.`, { cause: error })
    }
    const cacheKey = source.cacheKey?.trim() || url.href
    const cache = this.loading.cache
    if (cache && ['cache-first', 'offline-first'].includes(this.loading.cacheMode)) {
      const cached = await cache.get(cacheKey)
      if (cached) return this.fromCache(cached, url.href, source.integrity, 'hit')
      if (this.loading.cacheMode === 'offline-first') {
        // Offline-first still attempts the network after a miss; failure is reported clearly below.
      }
    }

    try {
      const response = await this.fetchImplementation(url, { ...source.request, signal })
      if (!response.ok) throw new AnyoPlayerError('PLAYER_FETCH_FAILED', `Failed to fetch Anyo world "${url.href}": ${response.status} ${response.statusText}.`)
      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      this.assertSize(bytes.byteLength)
      const integrity = await verifyIntegrity(bytes, source.integrity, this.loading.verifyIntegrity)
      const parsed = parseJson(bytesToText(bytes))
      const migrated = this.migrate(parsed)
      if (cache && this.loading.cacheMode !== 'network-only') {
        const entry: AnyoPlayerWorldCacheEntry = { key: cacheKey, storedAt: new Date().toISOString(), document: migrated.document, documentUrl: url.href, ...(source.integrity ? { integrity: source.integrity } : {}) }
        await cache.set(cacheKey, entry)
      }
      return {
        document: resolveDocumentResourceUrls(migrated.document, url.href),
        documentUrl: url.href,
        info: { kind: 'url', url: url.href, bytes: bytes.byteLength, cache: cache ? 'stored' : 'none', integrity, migratedFrom: migrated.from, documentVersion: migrated.document.version },
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw this.abortedError(signal.reason ?? error)
      if (cache && this.loading.cacheMode !== 'network-only') {
        const cached = await cache.get(cacheKey)
        if (cached) return this.fromCache(cached, url.href, source.integrity, 'fallback')
      }
      if (error instanceof AnyoPlayerError) throw error
      throw new AnyoPlayerError('PLAYER_FETCH_FAILED', `Failed to fetch Anyo world "${url.href}".`, { cause: error })
    }
  }

  private async fromCache(entry: AnyoPlayerWorldCacheEntry, fallbackUrl: string, requestedIntegrity: string | undefined, cacheState: 'hit' | 'fallback'): Promise<ResolvedPlayerSource> {
    if (requestedIntegrity && entry.integrity && requestedIntegrity !== entry.integrity) throw new AnyoPlayerError('PLAYER_INTEGRITY_FAILED', 'Cached world integrity metadata does not match the requested source.')
    const migrated = this.migrate(cloneDocument(entry.document))
    const documentUrl = entry.documentUrl ?? fallbackUrl
    return {
      document: resolveDocumentResourceUrls(migrated.document, documentUrl),
      documentUrl,
      info: { kind: 'cache', url: documentUrl, bytes: null, cache: cacheState, integrity: requestedIntegrity ? 'verified' : 'not-requested', migratedFrom: migrated.from, documentVersion: migrated.document.version },
    }
  }

  private finish(
    input: WorldDocument,
    partial: Pick<AnyoPlayerSourceInfo, 'kind' | 'bytes'>,
    documentUrl?: string,
    cleanup?: () => void,
    integrity: AnyoPlayerSourceInfo['integrity'] = 'not-requested',
  ): ResolvedPlayerSource {
    const migrated = this.migrate(input)
    return {
      document: documentUrl ? resolveDocumentResourceUrls(migrated.document, documentUrl) : migrated.document,
      ...(documentUrl ? { documentUrl } : {}),
      info: { kind: partial.kind, url: documentUrl ?? null, bytes: partial.bytes, cache: 'none', integrity, migratedFrom: migrated.from, documentVersion: migrated.document.version },
      ...(cleanup ? { cleanup } : {}),
    }
  }

  private migrate(document: WorldDocument): { document: WorldDocument; from: string | null } {
    if (!this.loading.migrate) return { document: cloneDocument(document), from: null }
    const result = migrateWorldDocument(document)
    return { document: result.document, from: result.document.version === document.version ? null : document.version }
  }

  private assertSize(bytes: number): void {
    if (bytes > this.loading.maxDocumentBytes) throw new AnyoPlayerError('PLAYER_SOURCE_TOO_LARGE', `Anyo world document exceeds the configured ${this.loading.maxDocumentBytes}-byte limit.`)
  }

  private abortedError(cause: unknown): AnyoPlayerError { return new AnyoPlayerError('PLAYER_FETCH_ABORTED', 'Anyo world loading was aborted.', { cause }) }
}
