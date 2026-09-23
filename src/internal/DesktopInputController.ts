import type {
  AnyoPlayerDesktopKeyBindings,
  AnyoPlayerExitReason,
  AnyoPlayerInputAction,
} from '../types.js'

export interface ExplorationInputTarget {
  setInputEnabled(enabled: boolean): void
  setMoveAxes(right: number, forward: number): void
  setRun(running: boolean): void
  addLookDelta(deltaX: number, deltaY: number): void
  prefersPointerLock?(): boolean
  beginPointerLook?(button: number): boolean
  endPointerLook?(button: number): void
  acceptsPointerLook?(): boolean
  usesPointerLookButton?(button: number): boolean
  addZoomDelta?(deltaY: number): boolean
  requestJump?(): void
  clearInput(): void
  releasePointerLock(): void
}

export interface DesktopInputConfiguration {
  pointerLock: boolean
  keys: AnyoPlayerDesktopKeyBindings
  preventDefaultKeys: boolean
  interact: readonly string[]
  pause: readonly string[]
  enter: readonly string[]
  look: {
    up: readonly string[]
    down: readonly string[]
    left: readonly string[]
    right: readonly string[]
  }
  lookStep: number
  lookScale: number
  invertY: boolean
}

export interface DesktopInputCallbacks {
  onEnterRequest(source: 'pointer' | 'keyboard'): void
  onExitRequest(reason: AnyoPlayerExitReason): void
  onPointerLockChange(locked: boolean): void
  onPointerLockError(error: unknown): void
  onAction(action: 'interact' | 'pause'): void
  onActionValue(action: AnyoPlayerInputAction, value: number, pressed: boolean): void
}

export const DEFAULT_DESKTOP_KEYS: Readonly<AnyoPlayerDesktopKeyBindings> = {
  forward: Object.freeze(['KeyW', 'ArrowUp']),
  backward: Object.freeze(['KeyS', 'ArrowDown']),
  left: Object.freeze(['KeyA', 'ArrowLeft']),
  right: Object.freeze(['KeyD', 'ArrowRight']),
  run: Object.freeze(['ShiftLeft', 'ShiftRight']),
  jump: Object.freeze(['Space']),
}

function hasAny(keys: ReadonlySet<string>, bindings: readonly string[]): boolean {
  return bindings.some(code => keys.has(code))
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(
    value
      && (typeof value === 'object' || typeof value === 'function')
      && 'then' in value
      && typeof value.then === 'function',
  )
}

export class DesktopInputController {
  private readonly document: Document | null
  private readonly window: Window | null
  private readonly keys = new Set<string>()
  private target: ExplorationInputTarget | null = null
  private configuration: DesktopInputConfiguration = {
    pointerLock: true,
    keys: DEFAULT_DESKTOP_KEYS,
    preventDefaultKeys: true,
    interact: Object.freeze(['KeyE']),
    pause: Object.freeze([]),
    enter: Object.freeze(['Enter', 'Space']),
    look: { up: Object.freeze([]), down: Object.freeze([]), left: Object.freeze([]), right: Object.freeze([]) },
    lookStep: 8,
    lookScale: 1,
    invertY: false,
  }
  private active = false
  private pointerLockPending = false
  private pointerLockValue = false
  private disposed = false
  private readonly actionValues = new Map<AnyoPlayerInputAction, number>()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: DesktopInputCallbacks,
  ) {
    this.document = canvas.ownerDocument ?? (typeof document === 'undefined' ? null : document)
    this.window = this.document?.defaultView ?? (typeof window === 'undefined' ? null : window)
    this.install()
  }

  get entered(): boolean { return this.active }
  get pointerLocked(): boolean { return this.pointerLockValue }

  configure(configuration: DesktopInputConfiguration): void {
    this.configuration = configuration
    this.keys.clear()
    this.syncMovement()
  }

  bind(target: ExplorationInputTarget): void {
    if (this.disposed) return
    if (this.target && this.target !== target) this.deactivate(false)
    this.target = target
    this.target.setInputEnabled(false)
    this.target.clearInput()
  }

  unbind(reason: AnyoPlayerExitReason = 'runtime-error'): void {
    if (this.active) this.callbacks.onExitRequest(reason)
    this.deactivate(true)
    this.target = null
  }

  activate(): boolean {
    if (this.disposed || !this.target) return false
    if (this.active) return this.shouldUsePointerLock()

    this.active = true
    this.keys.clear()
    this.target.clearInput()
    this.target.setInputEnabled(true)
    this.canvas.focus?.({ preventScroll: true })

    const usePointerLock = this.shouldUsePointerLock()
    if (usePointerLock) this.requestPointerLock()
    return usePointerLock
  }

  deactivate(releasePointerLock = true): void {
    this.active = false
    this.pointerLockPending = false
    this.keys.clear()
    this.syncMovement()
    this.clearActionValues()
    this.target?.clearInput()
    this.target?.setInputEnabled(false)
    if (releasePointerLock) this.target?.releasePointerLock()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.deactivate(true)
    this.target = null
    this.uninstall()
  }

  private install(): void {
    this.canvas.addEventListener('click', this.handleCanvasClick, { capture: true })
    this.canvas.addEventListener('keydown', this.handleKeyDown)
    this.canvas.addEventListener('keyup', this.handleKeyUp)
    this.canvas.addEventListener('blur', this.handleCanvasBlur)
    this.canvas.addEventListener('mousemove', this.handleCanvasMouseMove)
    this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown)
    this.document?.addEventListener('mouseup', this.handleDocumentMouseUp)
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    this.document?.addEventListener('mousemove', this.handleDocumentMouseMove)
    this.document?.addEventListener('pointerlockchange', this.handlePointerLockChange)
    this.document?.addEventListener('pointerlockerror', this.handlePointerLockError)
    this.window?.addEventListener('blur', this.handleWindowBlur)
  }

  private uninstall(): void {
    this.canvas.removeEventListener('click', this.handleCanvasClick, { capture: true })
    this.canvas.removeEventListener('keydown', this.handleKeyDown)
    this.canvas.removeEventListener('keyup', this.handleKeyUp)
    this.canvas.removeEventListener('blur', this.handleCanvasBlur)
    this.canvas.removeEventListener('mousemove', this.handleCanvasMouseMove)
    this.canvas.removeEventListener('mousedown', this.handleCanvasMouseDown)
    this.document?.removeEventListener('mouseup', this.handleDocumentMouseUp)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    this.document?.removeEventListener('mousemove', this.handleDocumentMouseMove)
    this.document?.removeEventListener('pointerlockchange', this.handlePointerLockChange)
    this.document?.removeEventListener('pointerlockerror', this.handlePointerLockError)
    this.window?.removeEventListener('blur', this.handleWindowBlur)
  }

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    if (this.disposed || !this.target) return
    if (this.active) {
      if (this.shouldUsePointerLock() && !this.pointerLockValue && !this.pointerLockPending) this.requestPointerLock()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    this.callbacks.onEnterRequest('pointer')
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.target) return
    const inactiveAction = this.actionForCode(event.code)
    if (!this.active && this.configuration.enter.includes(event.code)) {
      if (this.configuration.preventDefaultKeys) event.preventDefault()
      if (!event.repeat) this.callbacks.onEnterRequest('keyboard')
      return
    }
    if (!this.active && inactiveAction === 'pause') {
      if (this.configuration.preventDefaultKeys) event.preventDefault()
      if (!event.repeat) {
        this.emitActionValue('pause', 1)
        this.callbacks.onAction('pause')
      }
      return
    }
    if (!this.active) return
    if (event.code === 'Escape') {
      if (this.configuration.preventDefaultKeys) event.preventDefault()
      this.callbacks.onExitRequest('escape')
      return
    }
    const action = this.actionForCode(event.code)
    if (action) {
      if (this.configuration.preventDefaultKeys) event.preventDefault()
      if (!event.repeat) this.emitActionValue(action, 1)
      if (action === 'interact' || action === 'pause') {
        if (!event.repeat) this.callbacks.onAction(action)
      } else if (action === 'jump') {
        if (!event.repeat) this.target.requestJump?.()
      } else {
        this.applyDigitalLook(action)
      }
    }
    if (!this.isMovementCode(event.code)) return
    if (this.configuration.preventDefaultKeys) event.preventDefault()
    this.keys.add(event.code)
    this.syncMovement()
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = this.actionForCode(event.code)
    if (action) {
      if (this.configuration.preventDefaultKeys) event.preventDefault()
      this.emitActionValue(action, 0)
    }
    if (!this.isMovementCode(event.code)) return
    if (this.configuration.preventDefaultKeys) event.preventDefault()
    this.keys.delete(event.code)
    this.syncMovement()
  }

  private readonly handleCanvasBlur = (): void => {
    this.clearInput()
    if (!this.active || this.pointerLockValue) return
    this.callbacks.onExitRequest('blur')
  }

  private readonly handleWindowBlur = (): void => {
    this.clearInput()
    if (this.active) this.callbacks.onExitRequest('window-blur')
  }

  private readonly handleCanvasMouseDown = (event: MouseEvent): void => {
    if (!this.active || !this.target?.beginPointerLook?.(event.button)) return
    event.preventDefault()
  }

  private readonly handleDocumentMouseUp = (event: MouseEvent): void => {
    this.target?.endPointerLook?.(event.button)
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (this.active && this.target?.usesPointerLookButton?.(2)) event.preventDefault()
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    const deltaY = this.normalizeWheelDelta(event)
    if (!this.active || deltaY === 0 || !this.target?.addZoomDelta?.(deltaY)) return
    event.preventDefault()
  }

  private readonly handleCanvasMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.shouldUsePointerLock() || this.target?.acceptsPointerLook?.() === false) return
    this.addLook(event.movementX, event.movementY)
  }

  private readonly handleDocumentMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.target?.acceptsPointerLook?.() === false) return
    if (this.shouldUsePointerLock()) {
      if (!this.pointerLockValue) return
      this.addLook(event.movementX, event.movementY)
      return
    }
    if (event.target !== this.canvas) this.addLook(event.movementX, event.movementY)
  }

  private normalizeWheelDelta(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return 0
    const modeScale = event.deltaMode === 1
      ? 40
      : event.deltaMode === 2
        ? Math.max(this.canvas.clientHeight || 0, 480)
        : 1
    return Math.max(-240, Math.min(240, event.deltaY * modeScale))
  }

  private readonly handlePointerLockChange = (): void => {
    const locked = this.document?.pointerLockElement === this.canvas
    const changed = locked !== this.pointerLockValue
    this.pointerLockValue = locked
    if (locked) this.pointerLockPending = false
    if (changed) this.callbacks.onPointerLockChange(locked)
    if (!locked && changed && this.active && this.shouldUsePointerLock()) this.callbacks.onExitRequest('pointer-lock-exit')
  }

  private readonly handlePointerLockError = (event: Event): void => {
    if (!this.pointerLockPending) return
    this.pointerLockPending = false
    this.callbacks.onPointerLockError(event)
    if (this.active) this.callbacks.onExitRequest('pointer-lock-error')
  }


  private shouldUsePointerLock(): boolean {
    return this.configuration.pointerLock && (this.target?.prefersPointerLock?.() ?? true)
  }

  private requestPointerLock(): void {
    const request = this.canvas.requestPointerLock
    if (typeof request !== 'function') {
      const error = new Error('Pointer Lock API is unavailable for the player canvas.')
      this.callbacks.onPointerLockError(error)
      this.callbacks.onExitRequest('pointer-lock-error')
      return
    }

    this.pointerLockPending = true
    try {
      const result = request.call(this.canvas)
      if (isPromiseLike(result)) {
        void Promise.resolve(result).then(() => {
          if (this.disposed || !this.pointerLockPending) return
          this.pointerLockPending = false
          const locked = this.document?.pointerLockElement === this.canvas
          if (!locked) {
            const error = new Error('Pointer lock request completed without locking the player canvas.')
            this.callbacks.onPointerLockError(error)
            if (this.active) this.callbacks.onExitRequest('pointer-lock-error')
          }
        }, error => {
          if (this.disposed || !this.pointerLockPending) return
          this.pointerLockPending = false
          this.callbacks.onPointerLockError(error)
          if (this.active) this.callbacks.onExitRequest('pointer-lock-error')
        })
      }
    } catch (error) {
      this.pointerLockPending = false
      this.callbacks.onPointerLockError(error)
      if (this.active) this.callbacks.onExitRequest('pointer-lock-error')
    }
  }

  private clearInput(): void {
    this.keys.clear()
    this.syncMovement()
    this.clearActionValues()
    this.target?.clearInput()
  }

  private syncMovement(): void {
    const bindings = this.configuration.keys
    const forwardValue = this.active && hasAny(this.keys, bindings.forward) ? 1 : 0
    const backwardValue = this.active && hasAny(this.keys, bindings.backward) ? 1 : 0
    const leftValue = this.active && hasAny(this.keys, bindings.left) ? 1 : 0
    const rightValue = this.active && hasAny(this.keys, bindings.right) ? 1 : 0
    const runValue = this.active && hasAny(this.keys, bindings.run) ? 1 : 0

    this.emitActionValue('move-forward', forwardValue)
    this.emitActionValue('move-backward', backwardValue)
    this.emitActionValue('move-left', leftValue)
    this.emitActionValue('move-right', rightValue)
    this.emitActionValue('run', runValue)

    if (!this.target || !this.active) {
      this.target?.setMoveAxes(0, 0)
      this.target?.setRun(false)
      return
    }

    this.target.setMoveAxes(rightValue - leftValue, forwardValue - backwardValue)
    this.target.setRun(runValue === 1)
  }

  private emitActionValue(action: AnyoPlayerInputAction, value: number): void {
    const previous = this.actionValues.get(action) ?? 0
    if (previous === value) return
    this.actionValues.set(action, value)
    this.callbacks.onActionValue(action, value, value >= 0.5)
  }

  private isMovementCode(code: string): boolean {
    const bindings = this.configuration.keys
    return bindings.forward.includes(code)
      || bindings.backward.includes(code)
      || bindings.left.includes(code)
      || bindings.right.includes(code)
      || bindings.run.includes(code)
  }

  private actionForCode(code: string): 'jump' | 'interact' | 'pause' | 'look-up' | 'look-down' | 'look-left' | 'look-right' | null {
    if (this.configuration.keys.jump.includes(code)) return 'jump'
    if (this.configuration.interact.includes(code)) return 'interact'
    if (this.configuration.pause.includes(code)) return 'pause'
    if (this.configuration.look.up.includes(code)) return 'look-up'
    if (this.configuration.look.down.includes(code)) return 'look-down'
    if (this.configuration.look.left.includes(code)) return 'look-left'
    if (this.configuration.look.right.includes(code)) return 'look-right'
    return null
  }

  private applyDigitalLook(action: 'look-up' | 'look-down' | 'look-left' | 'look-right'): void {
    const step = Number.isFinite(this.configuration.lookStep)
      ? Math.max(0, Math.min(100, this.configuration.lookStep))
      : 8
    if (action === 'look-up') this.addLook(0, -step)
    else if (action === 'look-down') this.addLook(0, step)
    else if (action === 'look-left') this.addLook(-step, 0)
    else this.addLook(step, 0)
  }

  private clearActionValues(): void {
    for (const [action, value] of this.actionValues) {
      if (value !== 0) this.emitActionValue(action, 0)
    }
  }

  private addLook(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return
    const scale = Number.isFinite(this.configuration.lookScale)
      ? Math.max(0.05, Math.min(8, this.configuration.lookScale))
      : 1
    this.target?.addLookDelta(deltaX * scale, deltaY * scale * (this.configuration.invertY ? -1 : 1))
  }
}
