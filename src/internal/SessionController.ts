import type { World, WorldDocument } from '@blcklab/anyo'
import { AnyoPlayerError } from '../errors.js'
import type {
  AnyoPlayerInputMode,
  AnyoPlayerPauseReason,
  AnyoPlayerSessionCaptureOptions,
  AnyoPlayerSessionDataEntry,
  AnyoPlayerSessionOptions,
  AnyoPlayerSessionRestoreOptions,
  AnyoPlayerSessionSnapshot,
  AnyoPlayerSessionStorage,
} from '../types.js'

import { ANYO_PLAYER_SESSION_FORMAT, ANYO_PLAYER_SESSION_VERSION } from '../session.js'

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export interface SessionCaptureContext {
  world: World
  document: WorldDocument
  paused: boolean
  pauseReason: AnyoPlayerPauseReason | null
  inputMode: AnyoPlayerInputMode | null
}

export interface SessionRestoreContext {
  world: World
  document: WorldDocument
  onWarning: (message: string) => void
}

export interface SessionControllerEnvironment {
  storage?: AnyoPlayerSessionStorage
  now?: () => Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function assertSafeJson(value: unknown, context: string, seen = new WeakSet<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${context} must contain only finite numbers.`)
    return
  }
  if (typeof value !== 'object') throw new TypeError(`${context} must be JSON-compatible.`)
  if (seen.has(value)) throw new TypeError(`${context} must not contain circular references.`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeJson(entry, `${context}[${index}]`, seen))
  } else {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`${context} contains forbidden key "${key}".`)
      assertSafeJson(entry, `${context}.${key}`, seen)
    }
  }
  seen.delete(value)
}

function validateDataPath(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') throw new TypeError('Session data paths must not be empty.')
  const normalized = path.trim().replace(/\[(\d+)\]/g, '.$1')
  if (/\[[^\]]*\]/.test(normalized)) throw new TypeError(`Malformed session data path "${path}".`)
  const parts = normalized.split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length === 0) throw new TypeError('Session data paths must not be empty.')
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) throw new TypeError(`Unsafe session data path "${path}".`)
  }
  return parts.join('.')
}

function vector3(value: unknown, context: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${context} must be a three-number array.`)
  const result = value.map(Number)
  if (result.some(entry => !Number.isFinite(entry))) throw new TypeError(`${context} must contain finite numbers.`)
  return [result[0] as number, result[1] as number, result[2] as number]
}

function finiteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${context} must be a finite number.`)
  return value
}

function nullableString(value: unknown, context: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new TypeError(`${context} must be a string or null.`)
  return value
}

function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${context} must be a non-empty string.`)
  return value
}

function normalizeDataEntries(value: unknown): AnyoPlayerSessionDataEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('Session data must be an array.')
  const seen = new Set<string>()
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new TypeError(`Session data entry ${index} must be an object.`)
    const path = validateDataPath(String(entry.path ?? ''))
    if (seen.has(path)) throw new TypeError(`Session data path "${path}" is duplicated.`)
    seen.add(path)
    assertSafeJson(entry.value, `Session data entry ${index}`)
    return { path, value: structuredClone(entry.value) }
  })
}

function cloneMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new TypeError('Session metadata must be an object.')
  assertSafeJson(value, 'Session metadata')
  return structuredClone(value)
}

function resolveBrowserStorage(container: HTMLElement): AnyoPlayerSessionStorage | undefined {
  try {
    const view = container.ownerDocument?.defaultView
    const candidate = view && 'localStorage' in view
      ? (view as Window & { localStorage?: Storage }).localStorage
      : typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage
    return candidate
  } catch {
    return undefined
  }
}

function normalizedPaths(
  configured: readonly string[] | undefined,
  captured: readonly string[] | undefined,
): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const source of [configured ?? [], captured ?? []]) {
    for (const rawPath of source) {
      const path = validateDataPath(rawPath)
      if (seen.has(path)) continue
      seen.add(path)
      result.push(path)
    }
  }
  return result
}

export class SessionController {
  readonly enabled: boolean
  readonly storageKey: string | null
  readonly worldKey: string | null
  readonly restoreOnLoad: boolean
  readonly saveOnPause: boolean
  readonly saveOnVisibilityHidden: boolean

  private readonly options: AnyoPlayerSessionOptions
  private readonly storage: AnyoPlayerSessionStorage | undefined
  private readonly now: () => Date

  constructor(
    container: HTMLElement,
    options: false | AnyoPlayerSessionOptions | undefined,
    environment: SessionControllerEnvironment = {},
  ) {
    this.enabled = options !== false
    this.options = options === false ? {} : options ?? {}
    this.storageKey = this.options.storageKey?.trim() || null
    this.worldKey = this.options.worldKey?.trim() || null
    this.restoreOnLoad = this.enabled && (this.options.restoreOnLoad ?? false)
    this.saveOnPause = this.enabled && (this.options.saveOnPause ?? false)
    this.saveOnVisibilityHidden = this.enabled && (this.options.saveOnVisibilityHidden ?? false)
    this.storage = environment.storage ?? this.options.storage ?? resolveBrowserStorage(container)
    this.now = environment.now ?? (() => new Date())
  }

  get storageAvailable(): boolean {
    return Boolean(this.storage)
  }

  capture(
    context: SessionCaptureContext,
    options: AnyoPlayerSessionCaptureOptions = {},
  ): AnyoPlayerSessionSnapshot {
    this.assertEnabled()
    const cameraPosition = vector3(context.world.renderer.camera.getPosition(), 'Camera position')
    const cameraRotation = context.world.renderer.camera.getRotation()
    const yaw = finiteNumber(cameraRotation[0], 'Camera yaw')
    const pitch = finiteNumber(cameraRotation[1], 'Camera pitch')
    const data: AnyoPlayerSessionDataEntry[] = []
    const paths = normalizedPaths(this.options.dataPaths, options.dataPaths)

    if (this.options.includeAllData || options.includeAllData) {
      const allData = context.world.getData()
      if (isRecord(allData)) {
        for (const key of Object.keys(allData).sort()) {
          const path = validateDataPath(key)
          if (!paths.includes(path)) paths.push(path)
        }
      }
    }

    for (const path of paths) {
      const value = context.world.getData(path)
      if (value === undefined) continue
      assertSafeJson(value, `Runtime data at ${path}`)
      data.push({ path, value: structuredClone(value) })
    }

    let xrRig: AnyoPlayerSessionSnapshot['xrRig']
    try {
      const rig = context.world.xr.getPlayerRigTransform()
      xrRig = {
        position: vector3(rig.position, 'XR rig position'),
        yaw: finiteNumber(rig.yaw, 'XR rig yaw'),
      }
    } catch {
      xrRig = undefined
    }

    const metadata = cloneMetadata(options.metadata)
    return {
      format: ANYO_PLAYER_SESSION_FORMAT,
      version: ANYO_PLAYER_SESSION_VERSION,
      createdAt: this.now().toISOString(),
      world: {
        ...(this.worldKey ? { key: this.worldKey } : {}),
        documentVersion: String(context.document.version),
        room: context.world.getCurrentRoom(),
      },
      camera: {
        position: cameraPosition,
        yaw,
        pitch,
      },
      ...(xrRig ? { xrRig } : {}),
      ...(data.length > 0 ? { data } : {}),
      player: {
        paused: context.paused,
        pauseReason: context.paused ? context.pauseReason : null,
        inputMode: context.inputMode,
      },
      ...(metadata ? { metadata } : {}),
    }
  }

  parse(value: unknown): AnyoPlayerSessionSnapshot {
    this.assertEnabled()
    if (!isRecord(value)) throw new TypeError('Anyo Player session snapshot must be an object.')
    if (value.format !== ANYO_PLAYER_SESSION_FORMAT) throw new TypeError('Unsupported Anyo Player session format.')
    if (value.version !== ANYO_PLAYER_SESSION_VERSION) throw new TypeError(`Unsupported Anyo Player session version "${String(value.version)}".`)
    if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
      throw new TypeError('Session createdAt must be a valid ISO date string.')
    }
    if (!isRecord(value.world)) throw new TypeError('Session world information is missing.')
    if (!isRecord(value.camera)) throw new TypeError('Session camera information is missing.')
    if (!isRecord(value.player)) throw new TypeError('Session player information is missing.')

    const key = optionalString(value.world.key, 'Session world key')
    const documentVersion = optionalString(value.world.documentVersion, 'Session document version')
    if (!documentVersion) throw new TypeError('Session document version is required.')
    const room = nullableString(value.world.room, 'Session room')
    const position = vector3(value.camera.position, 'Session camera position')
    const yaw = finiteNumber(value.camera.yaw, 'Session camera yaw')
    const pitch = finiteNumber(value.camera.pitch, 'Session camera pitch')
    const paused = value.player.paused
    if (typeof paused !== 'boolean') throw new TypeError('Session paused state must be boolean.')
    const pauseReason = value.player.pauseReason === null
      ? null
      : value.player.pauseReason === 'user' || value.player.pauseReason === 'visibility'
        ? value.player.pauseReason
        : (() => { throw new TypeError('Session pause reason is invalid.') })()
    const inputMode = value.player.inputMode === null
      ? null
      : value.player.inputMode === 'desktop' || value.player.inputMode === 'touch' || value.player.inputMode === 'gamepad'
        ? value.player.inputMode
        : (() => { throw new TypeError('Session input mode is invalid.') })()

    let xrRig: AnyoPlayerSessionSnapshot['xrRig']
    if (value.xrRig !== undefined) {
      if (!isRecord(value.xrRig)) throw new TypeError('Session XR rig must be an object.')
      xrRig = {
        position: vector3(value.xrRig.position, 'Session XR rig position'),
        yaw: finiteNumber(value.xrRig.yaw, 'Session XR rig yaw'),
      }
    }

    const data = normalizeDataEntries(value.data)
    const metadata = cloneMetadata(value.metadata)
    return {
      format: ANYO_PLAYER_SESSION_FORMAT,
      version: ANYO_PLAYER_SESSION_VERSION,
      createdAt: value.createdAt,
      world: {
        ...(key ? { key } : {}),
        documentVersion,
        room,
      },
      camera: { position, yaw, pitch },
      ...(xrRig ? { xrRig } : {}),
      ...(data.length > 0 ? { data } : {}),
      player: { paused, pauseReason, inputMode },
      ...(metadata ? { metadata } : {}),
    }
  }

  async restoreWorld(
    context: SessionRestoreContext,
    snapshotInput: unknown,
    options: AnyoPlayerSessionRestoreOptions = {},
  ): Promise<AnyoPlayerSessionSnapshot> {
    this.assertEnabled()
    const snapshot = this.parse(snapshotInput)
    const strictWorldKey = options.strictWorldKey ?? this.options.strictWorldKey ?? true
    const strictDocumentVersion = options.strictDocumentVersion
      ?? this.options.strictDocumentVersion
      ?? false
    const strictRoom = options.strictRoom ?? this.options.strictRoom ?? false
    const restoreRuntimeData = options.restoreRuntimeData ?? true
    const restoreXR = options.restoreXR ?? true

    if (
      strictWorldKey
      && this.worldKey
      && this.worldKey !== snapshot.world.key
    ) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_WORLD_MISMATCH',
        `Session world key "${snapshot.world.key ?? '(missing)'}" does not match "${this.worldKey}".`,
      )
    }
    if (
      strictDocumentVersion
      && String(context.document.version) !== snapshot.world.documentVersion
    ) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_WORLD_MISMATCH',
        `Session document version "${snapshot.world.documentVersion}" does not match "${String(context.document.version)}".`,
      )
    }

    const roomExists = snapshot.world.room
      ? context.world.compiled?.roomById.has(snapshot.world.room) ?? false
      : true
    if (snapshot.world.room && !roomExists && strictRoom) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_WORLD_MISMATCH',
        `Session room "${snapshot.world.room}" does not exist in the current world.`,
      )
    }

    const previousData = (snapshot.data ?? []).map(entry => ({
      path: entry.path,
      value: context.world.getData(entry.path),
    }))

    if (restoreRuntimeData) {
      let applied = 0
      try {
        for (const entry of snapshot.data ?? []) {
          await context.world.setData(entry.path, entry.value)
          applied += 1
        }
        if ((snapshot.data?.length ?? 0) > 0) {
          await context.world.whenReady()
          await context.world.whenIdle()
        }
      } catch (error) {
        for (const entry of previousData.slice(0, applied).reverse()) {
          try {
            await context.world.setData(entry.path, entry.value)
          } catch (rollbackError) {
            context.onWarning(`Session runtime-data rollback failed at "${entry.path}": ${String(rollbackError)}`)
          }
        }
        throw error
      }
    }

    context.world.renderer.camera.setPosition(snapshot.camera.position)
    context.world.renderer.camera.setRotation(snapshot.camera.yaw, snapshot.camera.pitch)

    if (snapshot.world.room && roomExists) context.world.setCurrentRoom(snapshot.world.room)
    else if (snapshot.world.room && !roomExists) {
      context.onWarning(`Session room "${snapshot.world.room}" does not exist in the current world; the current room was preserved.`)
    } else context.world.setCurrentRoom(null)

    if (restoreXR && snapshot.xrRig) {
      try {
        context.world.xr.setPlayerRigTransform(snapshot.xrRig)
      } catch (error) {
        context.onWarning(`Anyo Player could not restore the XR player rig: ${String(error)}`)
      }
    }
    return snapshot
  }

  async save(key: string | undefined, snapshot: AnyoPlayerSessionSnapshot): Promise<string> {
    this.assertEnabled()
    const storage = this.requireStorage()
    const resolvedKey = this.resolveKey(key)
    try {
      await storage.setItem(resolvedKey, JSON.stringify(snapshot))
      return resolvedKey
    } catch (cause) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_SAVE_FAILED',
        `Anyo Player could not save session "${resolvedKey}".`,
        { cause },
      )
    }
  }

  async load(key?: string): Promise<{ key: string; snapshot: AnyoPlayerSessionSnapshot } | null> {
    this.assertEnabled()
    const storage = this.requireStorage()
    const resolvedKey = this.resolveKey(key)
    let serialized: string | null
    try {
      serialized = await storage.getItem(resolvedKey)
    } catch (cause) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_LOAD_FAILED',
        `Anyo Player could not load session "${resolvedKey}".`,
        { cause },
      )
    }
    if (serialized === null) return null
    try {
      return { key: resolvedKey, snapshot: this.parse(JSON.parse(serialized)) }
    } catch (cause) {
      if (cause instanceof AnyoPlayerError) throw cause
      throw new AnyoPlayerError(
        'PLAYER_SESSION_INVALID',
        `Stored Anyo Player session "${resolvedKey}" is invalid.`,
        { cause },
      )
    }
  }

  async clear(key?: string): Promise<string> {
    this.assertEnabled()
    const storage = this.requireStorage()
    const resolvedKey = this.resolveKey(key)
    try {
      await storage.removeItem(resolvedKey)
      return resolvedKey
    } catch (cause) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_SAVE_FAILED',
        `Anyo Player could not clear session "${resolvedKey}".`,
        { cause },
      )
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new AnyoPlayerError('PLAYER_SESSION_DISABLED', 'Session support is disabled for this Anyo Player.')
  }

  private requireStorage(): AnyoPlayerSessionStorage {
    if (!this.storage) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_STORAGE_UNAVAILABLE',
        'No session storage adapter is available. Provide session.storage or a browser localStorage environment.',
      )
    }
    return this.storage
  }

  private resolveKey(key: string | undefined): string {
    const resolved = key?.trim() || this.storageKey
    if (!resolved) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_STORAGE_UNAVAILABLE',
        'A session storage key is required. Pass a key or configure session.storageKey.',
      )
    }
    return resolved
  }
}
