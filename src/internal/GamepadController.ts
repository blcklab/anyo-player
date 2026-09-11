import type {
  AnyoPlayerGamepadOptions,
  AnyoPlayerGamepadState,
  AnyoPlayerInputAction,
  AnyoPlayerInputBinding,
  AnyoPlayerInputBindingMap,
} from '../types.js'
import type { ExplorationInputTarget } from './DesktopInputController.js'

interface GamepadControllerCallbacks {
  onEnterRequest(index: number): boolean
  onExitRequest(): void
  onAction(action: 'interact' | 'pause'): void
  onActionValue(action: AnyoPlayerInputAction, value: number, pressed: boolean): void
  onGamepadsChange(gamepads: readonly AnyoPlayerGamepadState[], activeGamepad: number | null): void
  onWarning(message: string): void
}

interface GamepadNavigator {
  getGamepads?(): ArrayLike<Gamepad | null>
}

interface AnimationWindow {
  navigator: Navigator
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  requestAnimationFrame?(callback: FrameRequestCallback): number
  cancelAnimationFrame?(handle: number): void
}

const ACTIONS: readonly AnyoPlayerInputAction[] = [
  'move-forward', 'move-backward', 'move-left', 'move-right',
  'look-up', 'look-down', 'look-left', 'look-right',
  'run', 'jump', 'interact', 'pause',
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeDeadZone(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0.18
  return clamp(value, 0, 0.95)
}

function normalizeSensitivity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 7
  return clamp(value, 0, 100)
}

function sameGamepads(a: readonly AnyoPlayerGamepadState[], b: readonly AnyoPlayerGamepadState[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => {
    const other = b[index]
    return Boolean(other
      && value.index === other.index
      && value.id === other.id
      && value.mapping === other.mapping
      && value.connected === other.connected)
  })
}

function snapshotGamepad(gamepad: Gamepad): AnyoPlayerGamepadState {
  return {
    index: gamepad.index,
    id: gamepad.id,
    mapping: gamepad.mapping,
    connected: gamepad.connected,
    timestamp: gamepad.timestamp,
  }
}

export class GamepadController {
  private readonly window: AnimationWindow | null
  private readonly navigator: GamepadNavigator | null
  private bindings: AnyoPlayerInputBindingMap
  private target: ExplorationInputTarget | null = null
  private active = false
  private disposed = false
  private frameHandle: number | null = null
  private gamepadsValue: readonly AnyoPlayerGamepadState[] = []
  private activeGamepadValue: number | null = null
  private reportedActiveGamepadValue: number | null | undefined
  private previousActions = new Map<AnyoPlayerInputAction, number>()
  private lastTimestamp = 0
  private awaitNeutral = false
  private readonly enabledValue: boolean
  private readonly requestedIndex: number | 'auto'
  private readonly deadZone: number
  private lookSensitivity: number
  private invertY = false

  constructor(
    canvas: HTMLCanvasElement,
    options: boolean | AnyoPlayerGamepadOptions | undefined,
    bindings: AnyoPlayerInputBindingMap,
    private readonly callbacks: GamepadControllerCallbacks,
  ) {
    const normalized = typeof options === 'object' && options !== null ? options : {}
    this.enabledValue = options === true || (typeof options === 'object' && options !== null && options.enabled !== false)
    this.requestedIndex = normalized.index ?? 'auto'
    this.deadZone = normalizeDeadZone(normalized.deadZone)
    this.lookSensitivity = normalizeSensitivity(normalized.lookSensitivity)
    this.bindings = bindings
    this.window = (canvas.ownerDocument?.defaultView ?? null) as AnimationWindow | null
    this.navigator = (this.window?.navigator ?? (typeof navigator === 'undefined' ? null : navigator)) as GamepadNavigator | null
    if (this.enabledValue) this.install()
  }

  get enabled(): boolean { return this.enabledValue }
  get entered(): boolean { return this.active }
  get gamepads(): readonly AnyoPlayerGamepadState[] { return this.gamepadsValue.map(value => ({ ...value })) }
  get activeGamepad(): number | null { return this.activeGamepadValue }

  setLookSettings(scale: number, invertY: boolean): void {
    this.lookSensitivity = normalizeSensitivity(scale)
    this.invertY = Boolean(invertY)
  }

  configure(bindings: AnyoPlayerInputBindingMap): void {
    this.bindings = bindings
    this.previousActions.clear()
  }

  bind(target: ExplorationInputTarget): void {
    if (this.disposed || !this.enabledValue) return
    if (this.target && this.target !== target) this.deactivate()
    this.target = target
    this.target.setInputEnabled(false)
    this.target.clearInput()
    this.schedule()
  }

  unbind(): void {
    this.deactivate()
    this.target = null
    this.cancelSchedule()
  }

  activate(index: number): boolean {
    if (this.disposed || !this.enabledValue || !this.target) return false
    this.activeGamepadValue = index
    this.awaitNeutral = false
    this.active = true
    this.target.clearInput()
    this.target.setInputEnabled(true)
    return true
  }

  deactivate(): void {
    const wasActive = this.active
    this.active = false
    if (wasActive) this.awaitNeutral = true
    this.previousActions.clear()
    this.target?.setMoveAxes(0, 0)
    this.target?.setRun(false)
    this.target?.clearInput()
    this.target?.setInputEnabled(false)
    if (wasActive) this.activeGamepadValue = null
  }

  pollNow(timestamp = Date.now()): void {
    if (this.disposed || !this.enabledValue || !this.navigator?.getGamepads) return
    let raw: ArrayLike<Gamepad | null>
    try {
      raw = this.navigator.getGamepads()
    } catch (error) {
      this.callbacks.onWarning(`Anyo Player could not read connected gamepads: ${String(error)}`)
      return
    }
    const connected: Gamepad[] = []
    for (let index = 0; index < raw.length; index += 1) {
      const gamepad = raw[index]
      if (gamepad?.connected) connected.push(gamepad)
    }
    const snapshots = connected.map(snapshotGamepad)
    const selected = this.selectGamepad(connected)
    const topologyChanged = !sameGamepads(this.gamepadsValue, snapshots)
    this.gamepadsValue = snapshots

    if (!selected) {
      if (this.active) {
        this.deactivate()
        this.callbacks.onExitRequest()
      }
      this.emitGamepadsChange(topologyChanged)
      return
    }

    const values = new Map<AnyoPlayerInputAction, number>()
    for (const action of ACTIONS) values.set(action, this.actionValue(selected, this.bindings[action]))
    const activity = ACTIONS.some(action => (values.get(action) ?? 0) > 0.08)
    if (this.awaitNeutral) {
      if (activity) return
      this.awaitNeutral = false
    }
    let enteredThisPoll = false
    if (!this.active && activity) {
      if (!this.callbacks.onEnterRequest(selected.index)) return
      enteredThisPoll = true
    }
    if (!this.active || !this.target) return

    if (this.activeGamepadValue !== selected.index) {
      this.activeGamepadValue = selected.index
      this.callbacks.onGamepadsChange(this.gamepads, selected.index)
    }

    const forward = (values.get('move-forward') ?? 0) - (values.get('move-backward') ?? 0)
    const right = (values.get('move-right') ?? 0) - (values.get('move-left') ?? 0)
    this.target.setMoveAxes(clamp(right, -1, 1), clamp(forward, -1, 1))
    this.target.setRun((values.get('run') ?? 0) >= 0.5)

    const elapsed = this.lastTimestamp > 0 ? clamp((timestamp - this.lastTimestamp) / 16.6667, 0.25, 4) : 1
    this.lastTimestamp = timestamp
    const lookX = (values.get('look-right') ?? 0) - (values.get('look-left') ?? 0)
    const lookY = (values.get('look-down') ?? 0) - (values.get('look-up') ?? 0)
    if (Math.abs(lookX) > 0 || Math.abs(lookY) > 0) {
      this.target.addLookDelta(
        lookX * this.lookSensitivity * elapsed,
        lookY * this.lookSensitivity * elapsed * (this.invertY ? -1 : 1),
      )
    }

    this.emitGamepadsChange(topologyChanged)

    for (const action of ACTIONS) {
      const value = values.get(action) ?? 0
      const previous = this.previousActions.get(action) ?? 0
      const pressed = value >= 0.5
      const wasPressed = previous >= 0.5
      if (value !== previous) this.callbacks.onActionValue(action, value, pressed)
      if (!enteredThisPoll && pressed && !wasPressed) {
        if (action === 'jump') this.target.requestJump?.()
        else if (action === 'interact' || action === 'pause') this.callbacks.onAction(action)
      }
      this.previousActions.set(action, value)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unbind()
    this.uninstall()
    this.gamepadsValue = []
    this.activeGamepadValue = null
    this.reportedActiveGamepadValue = undefined
  }


  private emitGamepadsChange(topologyChanged: boolean): void {
    const activeGamepad = this.active ? this.activeGamepadValue : null
    if (!topologyChanged && activeGamepad === this.reportedActiveGamepadValue) return
    this.reportedActiveGamepadValue = activeGamepad
    this.callbacks.onGamepadsChange(this.gamepads, activeGamepad)
  }

  private actionValue(gamepad: Gamepad, bindings: readonly AnyoPlayerInputBinding[]): number {
    let value = 0
    for (const binding of bindings) {
      if (binding.device === 'keyboard') continue
      if (binding.device === 'gamepad-button') {
        const button = gamepad.buttons[binding.button]
        value = Math.max(value, button?.pressed ? Math.max(1, button.value) : button?.value ?? 0)
        continue
      }
      const raw = Number(gamepad.axes[binding.axis] ?? 0) * binding.direction
      const threshold = binding.threshold ?? this.deadZone
      if (raw <= threshold) continue
      value = Math.max(value, clamp((raw - threshold) / (1 - threshold), 0, 1))
    }
    return value
  }

  private selectGamepad(gamepads: readonly Gamepad[]): Gamepad | null {
    if (typeof this.requestedIndex === 'number') {
      return gamepads.find(gamepad => gamepad.index === this.requestedIndex) ?? null
    }
    if (this.activeGamepadValue !== null) {
      const active = gamepads.find(gamepad => gamepad.index === this.activeGamepadValue)
      if (active) return active
    }
    return gamepads[0] ?? null
  }

  private install(): void {
    this.window?.addEventListener('gamepadconnected', this.handleConnection)
    this.window?.addEventListener('gamepaddisconnected', this.handleConnection)
  }

  private uninstall(): void {
    this.window?.removeEventListener('gamepadconnected', this.handleConnection)
    this.window?.removeEventListener('gamepaddisconnected', this.handleConnection)
  }

  private readonly handleConnection = (): void => {
    this.pollNow()
  }

  private schedule(): void {
    if (this.frameHandle !== null || !this.window?.requestAnimationFrame || this.disposed || !this.target) return
    const frame = (timestamp: number): void => {
      this.frameHandle = null
      this.pollNow(timestamp)
      if (!this.disposed && this.target) this.frameHandle = this.window?.requestAnimationFrame?.(frame) ?? null
    }
    this.frameHandle = this.window.requestAnimationFrame(frame)
  }

  private cancelSchedule(): void {
    if (this.frameHandle === null) return
    this.window?.cancelAnimationFrame?.(this.frameHandle)
    this.frameHandle = null
  }
}
