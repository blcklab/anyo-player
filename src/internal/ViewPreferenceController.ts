import type {
  AnyoPlayerViewPreferenceOptions,
  AnyoPlayerViewPreferenceSnapshot,
  AnyoPlayerViewStorage,
} from '../types.js'

export const ANYO_PLAYER_VIEW_PREFERENCE_FORMAT = '@blcklab/anyo-player/view-preference' as const
export const ANYO_PLAYER_VIEW_PREFERENCE_VERSION = 1 as const

export interface ViewPreferenceControllerDependencies {
  storage?: AnyoPlayerViewStorage
}

function finiteRange(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    throw new TypeError(`${name} must be between ${minimum} and ${maximum}.`)
  }
  return resolved
}

function safeStorage(container: HTMLElement): AnyoPlayerViewStorage | undefined {
  try {
    return container.ownerDocument?.defaultView?.localStorage ?? undefined
  } catch {
    return undefined
  }
}

function clone(snapshot: AnyoPlayerViewPreferenceSnapshot): AnyoPlayerViewPreferenceSnapshot {
  return { ...snapshot }
}

function normalizeSnapshot(
  value: unknown,
  minimumFieldOfView: number,
  maximumFieldOfView: number,
): AnyoPlayerViewPreferenceSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('View preference must be an object.')
  const record = value as Record<string, unknown>
  if (record.format !== ANYO_PLAYER_VIEW_PREFERENCE_FORMAT || record.version !== ANYO_PLAYER_VIEW_PREFERENCE_VERSION) {
    throw new TypeError('Unsupported Anyo Player view preference format or version.')
  }
  return {
    format: ANYO_PLAYER_VIEW_PREFERENCE_FORMAT,
    version: ANYO_PLAYER_VIEW_PREFERENCE_VERSION,
    fieldOfView: finiteRange(Number(record.fieldOfView), 60, minimumFieldOfView, maximumFieldOfView, 'view.fieldOfView'),
    pointerLookScale: finiteRange(Number(record.pointerLookScale), 1, 0.05, 8, 'view.pointerLookScale'),
    touchLookScale: finiteRange(Number(record.touchLookScale), 1, 0.05, 8, 'view.touchLookScale'),
    gamepadLookScale: finiteRange(Number(record.gamepadLookScale), 1, 0.05, 8, 'view.gamepadLookScale'),
    invertY: Boolean(record.invertY),
  }
}

export class ViewPreferenceController {
  readonly enabled: boolean
  readonly storageKey: string | null
  readonly restoreOnLoad: boolean
  readonly saveOnChange: boolean
  private readonly storage: AnyoPlayerViewStorage | undefined
  private readonly minimumFieldOfView: number
  private readonly maximumFieldOfView: number
  private defaultValue: AnyoPlayerViewPreferenceSnapshot
  private value: AnyoPlayerViewPreferenceSnapshot
  private restored = false

  constructor(
    container: HTMLElement,
    options: false | AnyoPlayerViewPreferenceOptions | undefined,
    dependencies: ViewPreferenceControllerDependencies = {},
  ) {
    this.enabled = options !== false
    const resolved = options === false ? {} : (options ?? {})
    this.minimumFieldOfView = finiteRange(resolved.minimumFieldOfView, 35, 20, 120, 'view.minimumFieldOfView')
    this.maximumFieldOfView = finiteRange(resolved.maximumFieldOfView, 100, this.minimumFieldOfView, 140, 'view.maximumFieldOfView')
    this.storage = resolved.storage ?? dependencies.storage ?? safeStorage(container)
    this.storageKey = this.enabled ? (resolved.storageKey?.trim() || '@blcklab/anyo-player:view') : null
    this.restoreOnLoad = this.enabled && resolved.restoreOnLoad === true
    this.saveOnChange = this.enabled && resolved.saveOnChange === true
    this.defaultValue = {
      format: ANYO_PLAYER_VIEW_PREFERENCE_FORMAT,
      version: ANYO_PLAYER_VIEW_PREFERENCE_VERSION,
      fieldOfView: finiteRange(resolved.fieldOfView, 60, this.minimumFieldOfView, this.maximumFieldOfView, 'view.fieldOfView'),
      pointerLookScale: finiteRange(resolved.pointerLookScale, 1, 0.05, 8, 'view.pointerLookScale'),
      touchLookScale: finiteRange(resolved.touchLookScale, 1, 0.05, 8, 'view.touchLookScale'),
      gamepadLookScale: finiteRange(resolved.gamepadLookScale, 1, 0.05, 8, 'view.gamepadLookScale'),
      invertY: resolved.invertY === true,
    }
    this.value = clone(this.defaultValue)
  }

  get preference(): AnyoPlayerViewPreferenceSnapshot { return clone(this.value) }
  get storageAvailable(): boolean { return Boolean(this.storage && this.storageKey) }
  get restoredOnLoad(): boolean { return this.restored }

  set(
    preference: Partial<Omit<AnyoPlayerViewPreferenceSnapshot, 'format' | 'version'>>,
  ): AnyoPlayerViewPreferenceSnapshot {
    this.value = {
      format: ANYO_PLAYER_VIEW_PREFERENCE_FORMAT,
      version: ANYO_PLAYER_VIEW_PREFERENCE_VERSION,
      fieldOfView: finiteRange(preference.fieldOfView, this.value.fieldOfView, this.minimumFieldOfView, this.maximumFieldOfView, 'view.fieldOfView'),
      pointerLookScale: finiteRange(preference.pointerLookScale, this.value.pointerLookScale, 0.05, 8, 'view.pointerLookScale'),
      touchLookScale: finiteRange(preference.touchLookScale, this.value.touchLookScale, 0.05, 8, 'view.touchLookScale'),
      gamepadLookScale: finiteRange(preference.gamepadLookScale, this.value.gamepadLookScale, 0.05, 8, 'view.gamepadLookScale'),
      invertY: preference.invertY ?? this.value.invertY,
    }
    return this.preference
  }

  reset(): AnyoPlayerViewPreferenceSnapshot {
    this.value = clone(this.defaultValue)
    return this.preference
  }

  async restoreConfigured(): Promise<{ key: string; snapshot: AnyoPlayerViewPreferenceSnapshot } | null> {
    if (this.restored || !this.restoreOnLoad) return null
    this.restored = true
    return this.load()
  }

  async save(key?: string): Promise<{ key: string; snapshot: AnyoPlayerViewPreferenceSnapshot }> {
    const resolvedKey = this.resolveKey(key)
    const snapshot = this.preference
    await this.requireStorage().setItem(resolvedKey, JSON.stringify(snapshot))
    return { key: resolvedKey, snapshot }
  }

  async load(key?: string): Promise<{ key: string; snapshot: AnyoPlayerViewPreferenceSnapshot } | null> {
    const resolvedKey = this.resolveKey(key)
    const raw = await this.requireStorage().getItem(resolvedKey)
    if (raw === null) return null
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch (error) { throw new TypeError(`Stored view preference is invalid JSON: ${String(error)}`) }
    this.value = normalizeSnapshot(parsed, this.minimumFieldOfView, this.maximumFieldOfView)
    return { key: resolvedKey, snapshot: this.preference }
  }

  async clear(key?: string): Promise<string> {
    const resolvedKey = this.resolveKey(key)
    await this.requireStorage().removeItem(resolvedKey)
    return resolvedKey
  }

  private resolveKey(key?: string): string {
    const resolved = key?.trim() || this.storageKey
    if (!resolved) throw new TypeError('View preference storage requires a non-empty key.')
    return resolved
  }

  private requireStorage(): AnyoPlayerViewStorage {
    if (!this.storage) throw new TypeError('View preference storage is unavailable.')
    return this.storage
  }
}
