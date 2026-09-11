import { AnyoPlayerError } from '../errors.js'
import {
  ANYO_PLAYER_INPUT_BINDINGS_FORMAT,
  ANYO_PLAYER_INPUT_BINDINGS_VERSION,
} from '../inputBindings.js'
import type {
  AnyoPlayerInputAction,
  AnyoPlayerInputBinding,
  AnyoPlayerInputBindingMap,
  AnyoPlayerInputBindingsOptions,
  AnyoPlayerInputBindingsSnapshot,
  AnyoPlayerInputStorage,
} from '../types.js'

export const INPUT_ACTIONS: readonly AnyoPlayerInputAction[] = Object.freeze([
  'move-forward',
  'move-backward',
  'move-left',
  'move-right',
  'look-up',
  'look-down',
  'look-left',
  'look-right',
  'run',
  'jump',
  'interact',
  'pause',
])

const DEFAULT_STORAGE_KEY = '@blcklab/anyo-player/input-bindings'
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export interface InputBindingsControllerDependencies {
  storage?: AnyoPlayerInputStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cloneBinding(binding: AnyoPlayerInputBinding): AnyoPlayerInputBinding {
  return { ...binding }
}

export function cloneInputBindingMap(map: AnyoPlayerInputBindingMap): AnyoPlayerInputBindingMap {
  const result = {} as Record<AnyoPlayerInputAction, readonly AnyoPlayerInputBinding[]>
  for (const action of INPUT_ACTIONS) result[action] = map[action].map(cloneBinding)
  return result
}

function normalizeKeyboardBinding(value: Record<string, unknown>): AnyoPlayerInputBinding {
  const code = typeof value.code === 'string' ? value.code.trim() : ''
  if (!code) throw new TypeError('Keyboard input bindings require a non-empty KeyboardEvent.code.')
  return { device: 'keyboard', code }
}

function normalizeButtonBinding(value: Record<string, unknown>): AnyoPlayerInputBinding {
  const button = Number(value.button)
  if (!Number.isInteger(button) || button < 0 || button > 255) {
    throw new TypeError('Gamepad button bindings require an integer button between 0 and 255.')
  }
  return { device: 'gamepad-button', button }
}

function normalizeAxisBinding(value: Record<string, unknown>): AnyoPlayerInputBinding {
  const axis = Number(value.axis)
  const direction = Number(value.direction)
  const threshold = value.threshold === undefined ? undefined : Number(value.threshold)
  if (!Number.isInteger(axis) || axis < 0 || axis > 255) {
    throw new TypeError('Gamepad axis bindings require an integer axis between 0 and 255.')
  }
  if (direction !== -1 && direction !== 1) {
    throw new TypeError('Gamepad axis bindings require direction -1 or 1.')
  }
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold >= 1)) {
    throw new TypeError('Gamepad axis binding thresholds must be finite values from 0 up to, but not including, 1.')
  }
  return {
    device: 'gamepad-axis',
    axis,
    direction: direction as -1 | 1,
    ...(threshold === undefined ? {} : { threshold }),
  }
}

export function normalizeInputBinding(value: unknown): AnyoPlayerInputBinding {
  if (!isRecord(value)) throw new TypeError('Input bindings must be plain objects.')
  const device = value.device
  if (device === 'keyboard') return normalizeKeyboardBinding(value)
  if (device === 'gamepad-button') return normalizeButtonBinding(value)
  if (device === 'gamepad-axis') return normalizeAxisBinding(value)
  throw new TypeError(`Unsupported input binding device "${String(device)}".`)
}

function bindingKey(binding: AnyoPlayerInputBinding): string {
  if (binding.device === 'keyboard') return `keyboard:${binding.code}`
  if (binding.device === 'gamepad-button') return `gamepad-button:${binding.button}`
  return `gamepad-axis:${binding.axis}:${binding.direction}:${binding.threshold ?? ''}`
}

function normalizeBindingsForAction(value: unknown): readonly AnyoPlayerInputBinding[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('Each input action must contain an array of bindings.')
  const unique = new Map<string, AnyoPlayerInputBinding>()
  for (const item of value) {
    const binding = normalizeInputBinding(item)
    unique.set(bindingKey(binding), binding)
  }
  return [...unique.values()]
}

export function normalizeInputBindingMap(
  value: unknown,
  fallback?: AnyoPlayerInputBindingMap,
  merge = false,
): AnyoPlayerInputBindingMap {
  if (!isRecord(value)) throw new TypeError('Input binding maps must be plain objects.')
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) throw new TypeError(`Unsafe input binding action key "${key}".`)
    if (!INPUT_ACTIONS.includes(key as AnyoPlayerInputAction)) {
      throw new TypeError(`Unknown Anyo Player input action "${key}".`)
    }
  }
  const result = {} as Record<AnyoPlayerInputAction, readonly AnyoPlayerInputBinding[]>
  for (const action of INPUT_ACTIONS) {
    if (Object.prototype.hasOwnProperty.call(value, action)) {
      result[action] = normalizeBindingsForAction(value[action])
    } else if (merge && fallback) {
      result[action] = fallback[action].map(cloneBinding)
    } else {
      result[action] = []
    }
  }
  return result
}

function resolveBrowserStorage(container: HTMLElement): AnyoPlayerInputStorage | null {
  try {
    const storage = container.ownerDocument?.defaultView?.localStorage
    if (!storage) return null
    return storage
  } catch {
    return null
  }
}

export class InputBindingsController {
  private bindingsValue: AnyoPlayerInputBindingMap
  private readonly defaultBindings: AnyoPlayerInputBindingMap
  private readonly storage: AnyoPlayerInputStorage | null
  readonly storageKey: string | null
  readonly restoreOnLoad: boolean
  readonly saveOnChange: boolean

  constructor(
    container: HTMLElement,
    defaults: AnyoPlayerInputBindingMap,
    options: false | AnyoPlayerInputBindingsOptions | undefined,
    dependencies: InputBindingsControllerDependencies = {},
  ) {
    this.defaultBindings = cloneInputBindingMap(defaults)
    this.bindingsValue = options === false
      ? cloneInputBindingMap(defaults)
      : normalizeInputBindingMap(options?.bindings ?? {}, defaults, true)
    this.storage = options === false
      ? null
      : dependencies.storage ?? options?.storage ?? resolveBrowserStorage(container)
    const storageKey = options === false ? '' : options?.storageKey?.trim() ?? DEFAULT_STORAGE_KEY
    this.storageKey = storageKey || null
    this.restoreOnLoad = options !== false && options?.restoreOnLoad === true
    this.saveOnChange = options !== false && options?.saveOnChange === true
  }

  get bindings(): AnyoPlayerInputBindingMap {
    return cloneInputBindingMap(this.bindingsValue)
  }

  get storageAvailable(): boolean {
    return Boolean(this.storage && this.storageKey)
  }

  setBindings(value: Partial<AnyoPlayerInputBindingMap>, merge = true): AnyoPlayerInputBindingMap {
    try {
      this.bindingsValue = normalizeInputBindingMap(value, this.bindingsValue, merge)
      return this.bindings
    } catch (cause) {
      throw new AnyoPlayerError(
        'PLAYER_INPUT_BINDINGS_INVALID',
        cause instanceof Error ? cause.message : 'The supplied input bindings are invalid.',
        { cause },
      )
    }
  }

  reset(): AnyoPlayerInputBindingMap {
    this.bindingsValue = cloneInputBindingMap(this.defaultBindings)
    return this.bindings
  }

  createSnapshot(): AnyoPlayerInputBindingsSnapshot {
    return {
      format: ANYO_PLAYER_INPUT_BINDINGS_FORMAT,
      version: ANYO_PLAYER_INPUT_BINDINGS_VERSION,
      bindings: this.bindings,
    }
  }

  async save(key?: string): Promise<{ key: string; snapshot: AnyoPlayerInputBindingsSnapshot }> {
    const resolved = this.resolveStorage(key)
    const snapshot = this.createSnapshot()
    await resolved.storage.setItem(resolved.key, JSON.stringify(snapshot))
    return { key: resolved.key, snapshot }
  }

  async load(key?: string): Promise<{ key: string; snapshot: AnyoPlayerInputBindingsSnapshot } | null> {
    const resolved = this.resolveStorage(key)
    const raw = await resolved.storage.getItem(resolved.key)
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (cause) {
      throw new AnyoPlayerError(
        'PLAYER_INPUT_BINDINGS_INVALID',
        'Saved Anyo Player input bindings contain invalid JSON.',
        { cause },
      )
    }
    const snapshot = this.normalizeSnapshot(parsed)
    this.bindingsValue = cloneInputBindingMap(snapshot.bindings)
    return { key: resolved.key, snapshot }
  }

  async clear(key?: string): Promise<string> {
    const resolved = this.resolveStorage(key)
    await resolved.storage.removeItem(resolved.key)
    return resolved.key
  }

  private normalizeSnapshot(value: unknown): AnyoPlayerInputBindingsSnapshot {
    if (!isRecord(value)) throw new AnyoPlayerError('PLAYER_INPUT_BINDINGS_INVALID', 'Saved input bindings must be an object.')
    if (value.format !== ANYO_PLAYER_INPUT_BINDINGS_FORMAT || value.version !== ANYO_PLAYER_INPUT_BINDINGS_VERSION) {
      throw new AnyoPlayerError('PLAYER_INPUT_BINDINGS_INVALID', 'Unsupported Anyo Player input-binding snapshot format or version.')
    }
    return {
      format: ANYO_PLAYER_INPUT_BINDINGS_FORMAT,
      version: ANYO_PLAYER_INPUT_BINDINGS_VERSION,
      bindings: normalizeInputBindingMap(value.bindings),
    }
  }

  private resolveStorage(key?: string): { storage: AnyoPlayerInputStorage; key: string } {
    const resolvedKey = key?.trim() || this.storageKey
    if (!this.storage || !resolvedKey) {
      throw new AnyoPlayerError(
        'PLAYER_INPUT_BINDINGS_STORAGE_UNAVAILABLE',
        'No input-binding storage adapter or storage key is available.',
      )
    }
    return { storage: this.storage, key: resolvedKey }
  }
}
