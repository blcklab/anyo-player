import type { AnyoPlayerTouchOptions } from '../types.js'
import type { ExplorationInputTarget } from './DesktopInputController.js'

export interface TouchInputCallbacks {
  onEnterRequest(): boolean
  onTap(clientX: number, clientY: number): void
}

export interface TouchInputConfiguration {
  enabled: boolean
  showControls: boolean
  moveLabel: string
  runLabel: string
  jumpLabel: string
  options: AnyoPlayerTouchOptions
}

interface ActivePointer {
  id: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  startedAt: number
  maxDistance: number
}

const DEFAULT_MOVE_RADIUS = 54
const DEFAULT_DEAD_ZONE = 0.08
const DEFAULT_MOVE_SENSITIVITY = 1
const DEFAULT_LOOK_SENSITIVITY = 1
const DEFAULT_TAP_THRESHOLD = 10
const DEFAULT_TAP_MAX_DURATION = 500

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback
}

function isTouchPointer(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}

function eventTime(event: PointerEvent): number {
  return Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : Date.now()
}

export function detectTouchCapability(container: HTMLElement): boolean {
  const view = container.ownerDocument?.defaultView
  const navigatorValue = view?.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator)
  if ((navigatorValue?.maxTouchPoints ?? 0) > 0) return true
  return Boolean(view && 'ontouchstart' in view)
}

export class TouchInputController {
  private readonly root: HTMLDivElement | null
  private readonly moveZone: HTMLDivElement | null
  private readonly moveThumb: HTMLDivElement | null
  private readonly runButton: HTMLButtonElement | null
  private readonly jumpButton: HTMLButtonElement | null
  private target: ExplorationInputTarget | null = null
  private movePointer: ActivePointer | null = null
  private lookPointer: ActivePointer | null = null
  private active = false
  private visible = false
  private running = false
  private disposed = false
  private suppressClickUntil = 0

  private readonly moveRadius: number
  private readonly deadZone: number
  private readonly moveSensitivity: number
  private lookSensitivity: number
  private invertY = false
  private readonly preventDefault: boolean
  private readonly tapThreshold: number
  private readonly tapMaxDuration: number

  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly configuration: TouchInputConfiguration,
    private readonly callbacks: TouchInputCallbacks,
  ) {
    const options = configuration.options
    this.moveRadius = finitePositive(options.moveRadius, DEFAULT_MOVE_RADIUS)
    this.deadZone = clamp(finiteNonNegative(options.deadZone, DEFAULT_DEAD_ZONE), 0, 0.95)
    this.moveSensitivity = finitePositive(options.moveSensitivity, DEFAULT_MOVE_SENSITIVITY)
    this.lookSensitivity = finitePositive(options.lookSensitivity, DEFAULT_LOOK_SENSITIVITY)
    this.preventDefault = options.preventDefault ?? true
    this.tapThreshold = finiteNonNegative(options.tapThreshold, DEFAULT_TAP_THRESHOLD)
    this.tapMaxDuration = finitePositive(options.tapMaxDuration, DEFAULT_TAP_MAX_DURATION)

    if (configuration.enabled && configuration.showControls) {
      const document = container.ownerDocument
      this.root = document.createElement('div')
      this.root.classList.add('anyo-player__touch')
      this.root.setAttribute('data-anyo-player-touch', '')
      this.root.setAttribute('aria-label', 'Touch exploration controls')

      this.moveZone = document.createElement('div')
      this.moveZone.classList.add('anyo-player__touch-move')
      this.moveZone.setAttribute('data-anyo-player-touch-move', '')
      this.moveZone.setAttribute('role', 'application')
      this.moveZone.setAttribute('aria-label', configuration.moveLabel)
      this.moveZone.style.setProperty('--anyo-player-touch-radius', `${this.moveRadius}px`)

      const moveBase = document.createElement('div')
      moveBase.classList.add('anyo-player__touch-base')
      this.moveThumb = document.createElement('div')
      this.moveThumb.classList.add('anyo-player__touch-thumb')
      moveBase.appendChild(this.moveThumb)
      this.moveZone.appendChild(moveBase)
      this.root.appendChild(this.moveZone)

      if (options.runButton ?? true) {
        this.runButton = document.createElement('button')
        this.runButton.type = 'button'
        this.runButton.classList.add('anyo-player__touch-run')
        this.runButton.setAttribute('data-anyo-player-touch-run', '')
        this.runButton.setAttribute('aria-pressed', 'false')
        this.runButton.textContent = configuration.runLabel
        this.root.appendChild(this.runButton)
      } else {
        this.runButton = null
      }

      if (options.jumpButton ?? true) {
        this.jumpButton = document.createElement('button')
        this.jumpButton.type = 'button'
        this.jumpButton.classList.add('anyo-player__touch-jump')
        this.jumpButton.setAttribute('data-anyo-player-touch-jump', '')
        this.jumpButton.textContent = configuration.jumpLabel
        this.root.appendChild(this.jumpButton)
      } else {
        this.jumpButton = null
      }

      this.container.appendChild(this.root)
      this.installControlListeners()
      this.setVisible(false)
    } else {
      this.root = null
      this.moveZone = null
      this.moveThumb = null
      this.runButton = null
      this.jumpButton = null
    }

    if (configuration.enabled) this.installCanvasListeners()
  }

  get enabled(): boolean { return this.configuration.enabled }
  get entered(): boolean { return this.active }

  setLookSettings(scale: number, invertY: boolean): void {
    this.lookSensitivity = finitePositive(scale, DEFAULT_LOOK_SENSITIVITY)
    this.invertY = Boolean(invertY)
  }

  bind(target: ExplorationInputTarget): void {
    if (this.disposed || !this.configuration.enabled) return
    if (this.target && this.target !== target) this.deactivate()
    this.target = target
    this.target.setInputEnabled(false)
    this.target.clearInput()
  }

  unbind(): void {
    this.deactivate()
    this.target = null
  }

  activate(): boolean {
    if (this.disposed || !this.configuration.enabled || !this.target) return false
    if (this.active) return true
    this.active = true
    this.target.clearInput()
    this.target.setInputEnabled(true)
    return true
  }

  deactivate(): void {
    this.active = false
    this.movePointer = null
    this.lookPointer = null
    this.running = false
    this.target?.setMoveAxes(0, 0)
    this.target?.setRun(false)
    this.target?.clearInput()
    this.target?.setInputEnabled(false)
    this.resetMoveVisual()
    this.updateRunVisual()
  }

  setVisible(visible: boolean): void {
    this.visible = visible && this.configuration.enabled
    if (!this.root) return
    this.root.hidden = !this.visible
    this.root.setAttribute('aria-hidden', this.visible ? 'false' : 'true')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.deactivate()
    this.uninstallCanvasListeners()
    this.uninstallControlListeners()
    this.target = null
    if (this.root?.parentNode) this.root.parentNode.removeChild(this.root)
  }

  private installCanvasListeners(): void {
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown, { capture: true })
    this.canvas.addEventListener('pointermove', this.handleCanvasPointerMove, { capture: true })
    this.canvas.addEventListener('pointerup', this.handleCanvasPointerEnd, { capture: true })
    this.canvas.addEventListener('pointercancel', this.handleCanvasPointerEnd, { capture: true })
    this.canvas.addEventListener('click', this.handleCanvasClick, { capture: true })
  }

  private uninstallCanvasListeners(): void {
    this.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown, { capture: true })
    this.canvas.removeEventListener('pointermove', this.handleCanvasPointerMove, { capture: true })
    this.canvas.removeEventListener('pointerup', this.handleCanvasPointerEnd, { capture: true })
    this.canvas.removeEventListener('pointercancel', this.handleCanvasPointerEnd, { capture: true })
    this.canvas.removeEventListener('click', this.handleCanvasClick, { capture: true })
  }

  private installControlListeners(): void {
    this.moveZone?.addEventListener('pointerdown', this.handleMovePointerDown)
    this.moveZone?.addEventListener('pointermove', this.handleMovePointerMove)
    this.moveZone?.addEventListener('pointerup', this.handleMovePointerEnd)
    this.moveZone?.addEventListener('pointercancel', this.handleMovePointerEnd)
    this.moveZone?.addEventListener('lostpointercapture', this.handleMovePointerEnd)
    this.runButton?.addEventListener('pointerdown', this.handleRunStart)
    this.jumpButton?.addEventListener('pointerdown', this.handleJump)
    this.runButton?.addEventListener('pointerup', this.handleRunEnd)
    this.runButton?.addEventListener('pointercancel', this.handleRunEnd)
    this.runButton?.addEventListener('lostpointercapture', this.handleRunEnd)
  }

  private uninstallControlListeners(): void {
    this.moveZone?.removeEventListener('pointerdown', this.handleMovePointerDown)
    this.moveZone?.removeEventListener('pointermove', this.handleMovePointerMove)
    this.moveZone?.removeEventListener('pointerup', this.handleMovePointerEnd)
    this.moveZone?.removeEventListener('pointercancel', this.handleMovePointerEnd)
    this.moveZone?.removeEventListener('lostpointercapture', this.handleMovePointerEnd)
    this.runButton?.removeEventListener('pointerdown', this.handleRunStart)
    this.jumpButton?.removeEventListener('pointerdown', this.handleJump)
    this.runButton?.removeEventListener('pointerup', this.handleRunEnd)
    this.runButton?.removeEventListener('pointercancel', this.handleRunEnd)
    this.runButton?.removeEventListener('lostpointercapture', this.handleRunEnd)
  }

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    if (Date.now() > this.suppressClickUntil) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    if (!isTouchPointer(event) || this.lookPointer) return
    if (!this.ensureActive()) return
    this.consume(event)
    this.capture(event.currentTarget, event.pointerId)
    this.lookPointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: eventTime(event),
      maxDistance: 0,
    }
  }

  private readonly handleCanvasPointerMove = (event: PointerEvent): void => {
    const pointer = this.lookPointer
    if (!pointer || event.pointerId !== pointer.id || !this.active) return
    this.consume(event)
    const deltaX = event.clientX - pointer.lastX
    const deltaY = event.clientY - pointer.lastY
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY
    pointer.maxDistance = Math.max(
      pointer.maxDistance,
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY),
    )
    if (Number.isFinite(deltaX) && Number.isFinite(deltaY)) {
      this.target?.addLookDelta(deltaX * this.lookSensitivity, deltaY * this.lookSensitivity * (this.invertY ? -1 : 1))
    }
  }

  private readonly handleCanvasPointerEnd = (event: PointerEvent): void => {
    const pointer = this.lookPointer
    if (!pointer || event.pointerId !== pointer.id) return
    this.consume(event)
    this.lookPointer = null
    this.suppressClickUntil = Date.now() + 700
    const duration = eventTime(event) - pointer.startedAt
    if (pointer.maxDistance <= this.tapThreshold && duration <= this.tapMaxDuration) {
      this.callbacks.onTap(event.clientX, event.clientY)
    }
  }

  private readonly handleMovePointerDown = (event: PointerEvent): void => {
    if (!isTouchPointer(event) || this.movePointer) return
    if (!this.ensureActive()) return
    this.consume(event)
    this.capture(event.currentTarget, event.pointerId)
    this.movePointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: eventTime(event),
      maxDistance: 0,
    }
    this.updateMove(event.clientX, event.clientY)
  }

  private readonly handleMovePointerMove = (event: PointerEvent): void => {
    const pointer = this.movePointer
    if (!pointer || event.pointerId !== pointer.id || !this.active) return
    this.consume(event)
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY
    this.updateMove(event.clientX, event.clientY)
  }

  private readonly handleMovePointerEnd = (event: PointerEvent): void => {
    if (!this.movePointer || event.pointerId !== this.movePointer.id) return
    this.consume(event)
    this.movePointer = null
    this.target?.setMoveAxes(0, 0)
    this.resetMoveVisual()
  }


  private readonly handleJump = (event: PointerEvent): void => {
    if (!isTouchPointer(event) || !this.ensureActive()) return
    this.consume(event)
    this.target?.requestJump?.()
  }

  private readonly handleRunStart = (event: PointerEvent): void => {
    if (!isTouchPointer(event) || !this.ensureActive()) return
    this.consume(event)
    this.capture(event.currentTarget, event.pointerId)
    this.running = true
    this.target?.setRun(true)
    this.updateRunVisual()
  }

  private readonly handleRunEnd = (event: PointerEvent): void => {
    if (!this.running) return
    this.consume(event)
    this.running = false
    this.target?.setRun(false)
    this.updateRunVisual()
  }

  private ensureActive(): boolean {
    if (this.active) return true
    return this.callbacks.onEnterRequest() && this.active
  }

  private updateMove(clientX: number, clientY: number): void {
    const pointer = this.movePointer
    if (!pointer || !this.target) return
    const rawX = clientX - pointer.startX
    const rawY = clientY - pointer.startY
    const distance = Math.hypot(rawX, rawY)
    const scale = distance > this.moveRadius ? this.moveRadius / distance : 1
    const visualX = rawX * scale
    const visualY = rawY * scale
    const normalizedX = visualX / this.moveRadius
    const normalizedY = visualY / this.moveRadius
    const magnitude = Math.hypot(normalizedX, normalizedY)
    let right = 0
    let forward = 0
    if (magnitude > this.deadZone) {
      const adjustedMagnitude = clamp((magnitude - this.deadZone) / (1 - this.deadZone), 0, 1)
      const inverseMagnitude = magnitude > 0 ? 1 / magnitude : 0
      right = clamp(normalizedX * inverseMagnitude * adjustedMagnitude * this.moveSensitivity, -1, 1)
      forward = clamp(-normalizedY * inverseMagnitude * adjustedMagnitude * this.moveSensitivity, -1, 1)
    }
    this.target.setMoveAxes(right, forward)
    this.moveThumb?.style.setProperty('transform', `translate(${visualX}px, ${visualY}px)`)
  }

  private resetMoveVisual(): void {
    this.moveThumb?.style.setProperty('transform', 'translate(0px, 0px)')
  }

  private updateRunVisual(): void {
    this.runButton?.setAttribute('aria-pressed', this.running ? 'true' : 'false')
  }

  private consume(event: Event): void {
    if (this.preventDefault) event.preventDefault()
    event.stopPropagation()
  }

  private capture(target: EventTarget | null, pointerId: number): void {
    const candidate = target as (EventTarget & { setPointerCapture?: (id: number) => void }) | null
    try {
      candidate?.setPointerCapture?.(pointerId)
    } catch {
      // Pointer capture can fail when a browser has already cancelled the pointer.
    }
  }
}
