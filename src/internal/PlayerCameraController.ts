import {
  CollisionWorld,
  FirstPersonController,
  type CameraProjection,
  type ExplorationRuntimeController,
  type FirstPersonControllerOptions,
  type PluginRuntimeContext,
  type Vec3,
  type WorldPlugin,
} from '@blcklab/anyo'
import type {
  AnyoPlayerCameraFrameOptions,
  AnyoPlayerCameraMode,
  AnyoPlayerCameraModeOptions,
  AnyoPlayerFallRecoveryOptions,
  AnyoPlayerFallRecoveryStatus,
  AnyoPlayerTeleportOptions,
} from '../types.js'

interface CameraControllerCallbacks {
  onModeChange?: (previous: AnyoPlayerCameraMode, mode: AnyoPlayerCameraMode) => void
  onRecoveryChange?: (status: AnyoPlayerFallRecoveryStatus) => void
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))
const copy = (value: readonly [number, number, number]): Vec3 => [value[0], value[1], value[2]]

interface FramedVolume {
  center: Vec3
  radius: number
  width: number
  height: number
  depth: number
  minimumY: number
  maximumY: number
}

function centerAndRadius(options: AnyoPlayerCameraFrameOptions): FramedVolume {
  if (options.bounds) {
    const { min, max } = options.bounds
    const width = Math.max(.1, max[0] - min[0])
    const height = Math.max(.1, max[1] - min[1])
    const depth = Math.max(.1, max[2] - min[2])
    const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const radius = Math.max(1, Math.hypot(width, height, depth) / 2)
    return { center, radius, width, height, depth, minimumY: min[1], maximumY: max[1] }
  }
  const radius = Math.max(1, options.radius ?? 10)
  const center = copy(options.target ?? [0, 0, 0])
  return { center, radius, width: radius * 2, height: radius * 2, depth: radius * 2, minimumY: center[1] - radius, maximumY: center[1] + radius }
}

function forwardFromRotation(yaw: number, pitch: number): Vec3 {
  const cosine = Math.cos(pitch)
  return [-Math.sin(yaw) * cosine, Math.sin(pitch), -Math.cos(yaw) * cosine]
}

function rotationToTarget(position: Vec3, target: Vec3): readonly [number, number] {
  const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2]
  const length = Math.hypot(dx, dy, dz) || 1
  const x = dx / length, y = dy / length, z = dz / length
  return [Math.atan2(-x, -z), Math.asin(clamp(y, -1, 1))]
}

export class PlayerCameraController implements ExplorationRuntimeController {
  readonly plugin: WorldPlugin
  private context: PluginRuntimeContext | null = null
  private firstPerson: FirstPersonController | null = null
  private collisions: CollisionWorld | null = null
  private unbind: (() => void) | null = null
  private modeValue: AnyoPlayerCameraMode = 'explore'
  private enabledValue = true
  private inputEnabledValue = false
  private explorePose: { position: Vec3; rotation: readonly [number, number] } | null = null
  private spawnPose: { position: Vec3; rotation: readonly [number, number] } | null = null
  private target: Vec3 = [0, 0, 0]
  private orbitDistance = 20
  private orbitYaw = .7
  private orbitPitch = -.45
  private topHeight = 40
  private topVerticalSize = 40
  private savedProjection: CameraProjection | null = null
  private freeSpeed = 12
  private dragging = false
  private activePointerId: number | null = null
  private inspectionFocused = false
  private canvas: HTMLCanvasElement | null = null
  private originalTabIndex: number | null = null
  private lastPointer: readonly [number, number] = [0, 0]
  private readonly pressed = new Set<string>()
  private cleanups: Array<() => void> = []
  private lastGroundedPose: { position: Vec3; rotation: readonly [number, number] } | null = null
  private groundedSeconds = 0
  private recoveryAttempts = 0
  private recoveryDisabled = false
  private lastRecoveryAt = -Infinity

  constructor(
    private readonly firstPersonOptions: FirstPersonControllerOptions,
    private readonly recoveryOptions: false | AnyoPlayerFallRecoveryOptions,
    private readonly callbacks: CameraControllerCallbacks = {},
  ) {
    this.plugin = {
      name: 'anyo:player-camera',
      setup: context => this.setup(context),
      update: delta => this.update(delta),
      applyChanges: (changes, context) => {
        if (changes.some(change => change.type === 'collider-state')) this.setColliders(context.compiled.colliders)
      },
      teardown: () => this.teardown(),
      dispose: () => this.teardown(),
    }
  }

  get mode(): AnyoPlayerCameraMode { return this.modeValue }
  get enabled(): boolean { return this.enabledValue }
  get inputEnabled(): boolean { return this.inputEnabledValue }

  setEnabled(enabled: boolean): void {
    this.enabledValue = Boolean(enabled)
    this.syncFirstPersonState()
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabledValue = Boolean(enabled)
    this.syncFirstPersonState()
  }

  clearInput(): void {
    this.firstPerson?.clearInput()
    this.pressed.clear()
    this.dragging = false
    this.releaseActivePointer()
  }

  releasePointerLock(): void { this.firstPerson?.releasePointerLock() }

  setMoveAxes(right: number, forward: number): void {
    if (this.modeValue === 'explore') this.firstPerson?.setMoveAxes(right, forward)
  }

  setRun(running: boolean): void {
    if (this.modeValue === 'explore') this.firstPerson?.setRun(running)
  }

  addLookDelta(deltaX: number, deltaY: number): void {
    if (this.modeValue === 'explore') this.firstPerson?.addLookDelta(deltaX, deltaY)
    else if (this.modeValue === 'free') this.rotateFree(deltaX, deltaY)
  }

  requestJump(): void {}

  setFieldOfView(fieldOfView: number): void {
    if (!Number.isFinite(fieldOfView)) throw new TypeError('Anyo Player field of view must be finite.')
    const context = this.requireContext()
    const projection = context.renderer.camera.getProjection?.()
    if (projection?.type === 'orthographic') return
    context.renderer.camera.setProjection?.({
      type: 'perspective',
      fieldOfView: Math.max(20, Math.min(140, fieldOfView)),
      ...(projection?.near === undefined ? {} : { near: projection.near }),
      ...(projection?.far === undefined ? {} : { far: projection.far }),
    })
  }

  setMode(mode: AnyoPlayerCameraMode, options: AnyoPlayerCameraModeOptions = {}): void {
    const context = this.requireContext()
    if (mode === this.modeValue && Object.keys(options).length === 0) return
    const previous = this.modeValue
    if (previous === 'explore') this.explorePose = {
      position: copy(context.renderer.camera.getPosition()),
      rotation: [...context.renderer.camera.getRotation()] as [number, number],
    }
    if (previous === 'top' && mode !== 'top') this.restoreSavedProjection()
    if (mode === 'top' && previous !== 'top') this.savedProjection = context.renderer.camera.getProjection?.() ?? null
    this.modeValue = mode
    this.clearInput()
    this.releasePointerLock()
    this.inspectionFocused = mode !== 'explore'
    this.applyModeOptions(options)
    this.syncFirstPersonState()
    if (mode === 'explore') {
      const pose = options.restoreExplorePose === false ? null : this.explorePose
      if (pose) this.teleport({ ...pose, resetMotion: true })
    } else if (options.bounds || options.target) {
      this.frame(options)
    } else if (mode === 'orbit' || mode === 'top') {
      this.frame({ target: this.target, radius: Math.max(5, this.orbitDistance / 2) })
    }
    if (mode !== 'explore') this.focusInspectionCanvas()
    this.callbacks.onModeChange?.(previous, mode)
  }

  frame(options: AnyoPlayerCameraFrameOptions = {}): void {
    const context = this.requireContext()
    const framed = centerAndRadius(options)
    this.target = framed.center
    if (this.modeValue === 'top') {
      const canvas = context.renderer.canvas
      const aspect = Math.max(.1, (canvas.clientWidth || canvas.width || 1) / Math.max(1, canvas.clientHeight || canvas.height || 1))
      const padding = Math.max(1, options.padding ?? 1.14)
      this.topVerticalSize = Math.max(6, Math.max(framed.depth, framed.width / aspect) * padding)
      this.topHeight = Math.max(options.distance ?? this.topVerticalSize * .65, framed.height + 16, 24)
      const cameraY = framed.maximumY + this.topHeight
      context.renderer.camera.setProjection?.({
        type: 'orthographic',
        verticalSize: this.topVerticalSize,
        near: .05,
        far: Math.max(1_000, this.topHeight + framed.height + 500),
      })
      context.renderer.camera.setPosition([this.target[0], cameraY, this.target[2] + .001])
      context.renderer.camera.setRotation(options.northUp === false ? this.orbitYaw : 0, -Math.PI / 2 + .00001)
      return
    }
    if (this.modeValue === 'orbit') {
      this.orbitDistance = Math.max(options.distance ?? framed.radius * 2.2, 4)
      this.applyOrbitCamera()
      return
    }
    if (this.modeValue === 'free') {
      const distance = Math.max(options.distance ?? framed.radius * 2.2, 4)
      const forward = forwardFromRotation(this.orbitYaw, this.orbitPitch)
      const position: Vec3 = [this.target[0] - forward[0] * distance, this.target[1] - forward[1] * distance, this.target[2] - forward[2] * distance]
      const rotation = rotationToTarget(position, this.target)
      context.renderer.camera.setPosition(position)
      context.renderer.camera.setRotation(rotation[0], rotation[1])
    }
  }

  teleport(options: AnyoPlayerTeleportOptions): void {
    const context = this.requireContext()
    const position = copy(options.position)
    if (!position.every(Number.isFinite)) throw new TypeError('Anyo Player teleport position must contain finite numbers.')
    if (options.resetMotion !== false) this.recreateFirstPerson()
    context.renderer.camera.setPosition(position)
    if (options.rotation) context.renderer.camera.setRotation(options.rotation[0], options.rotation[1])
    if (options.clearInput !== false) this.clearInput()
    this.recoveryDisabled = false
    this.recoveryAttempts = 0
    this.groundedSeconds = 0
  }

  private setup(context: PluginRuntimeContext): void {
    this.teardown()
    this.context = context
    this.collisions = new CollisionWorld(context.compiled.colliders)
    this.spawnPose = { position: copy(context.renderer.camera.getPosition()), rotation: [...context.renderer.camera.getRotation()] as [number, number] }
    this.savedProjection = context.renderer.camera.getProjection?.() ?? null
    this.lastGroundedPose = this.resolveSupportedPose(this.spawnPose.position, this.spawnPose.rotation)
    this.recreateFirstPerson()
    this.unbind = context.world.exploration.bind(this)
    this.installInspectionInput(context.renderer.canvas)
  }

  private teardown(): void {
    this.unbind?.(); this.unbind = null
    this.firstPerson?.dispose(); this.firstPerson = null
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    if (this.canvas && this.originalTabIndex !== null) this.canvas.tabIndex = this.originalTabIndex
    this.canvas = null
    this.originalTabIndex = null
    this.context = null
    this.collisions = null
    this.pressed.clear()
    this.dragging = false
    this.activePointerId = null
    this.inspectionFocused = false
    this.savedProjection = null
  }

  private recreateFirstPerson(): void {
    if (!this.context) return
    this.firstPerson?.dispose()
    this.firstPerson = new FirstPersonController(this.context, this.firstPersonOptions)
    this.syncFirstPersonState()
  }

  private syncFirstPersonState(): void {
    this.firstPerson?.setEnabled(this.enabledValue && this.modeValue === 'explore')
    this.firstPerson?.setInputEnabled(this.inputEnabledValue && this.modeValue === 'explore')
  }

  private update(deltaSeconds: number): void {
    if (!this.context || !this.enabledValue) return
    if (this.modeValue === 'explore') {
      this.firstPerson?.update(deltaSeconds)
      this.updateFallRecovery(deltaSeconds)
    } else if (this.modeValue === 'free' && this.inspectionFocused) this.updateFree(deltaSeconds)
  }

  private setColliders(colliders: PluginRuntimeContext['compiled']['colliders']): void {
    this.collisions?.setColliders(colliders)
    this.firstPerson?.setColliders(colliders)
  }

  private restoreSavedProjection(): void {
    if (!this.context?.renderer.camera.setProjection) return
    const projection = this.savedProjection ?? { type: 'perspective' as const, fieldOfView: 70, near: .05, far: 2_000 }
    this.context.renderer.camera.setProjection(projection)
  }

  private applyModeOptions(options: AnyoPlayerCameraModeOptions): void {
    if (options.target) this.target = copy(options.target)
    if (Number.isFinite(options.distance)) this.orbitDistance = Math.max(1, options.distance!)
    if (Number.isFinite(options.yaw)) this.orbitYaw = options.yaw!
    if (Number.isFinite(options.pitch)) this.orbitPitch = clamp(options.pitch!, -Math.PI / 2 + .02, Math.PI / 2 - .02)
    if (Number.isFinite(options.speed)) this.freeSpeed = Math.max(.1, options.speed!)
  }

  private applyOrbitCamera(): void {
    if (!this.context) return
    const forward = forwardFromRotation(this.orbitYaw, this.orbitPitch)
    const position: Vec3 = [this.target[0] - forward[0] * this.orbitDistance, this.target[1] - forward[1] * this.orbitDistance, this.target[2] - forward[2] * this.orbitDistance]
    this.context.renderer.camera.setPosition(position)
    this.context.renderer.camera.setRotation(this.orbitYaw, this.orbitPitch)
  }

  private rotateFree(deltaX: number, deltaY: number): void {
    if (!this.context) return
    const rotation = this.context.renderer.camera.getRotation()
    this.context.renderer.camera.setRotation(rotation[0] - deltaX * .004, clamp(rotation[1] - deltaY * .004, -Math.PI / 2 + .02, Math.PI / 2 - .02))
  }

  private updateFree(deltaSeconds: number): void {
    if (!this.context) return
    const camera = this.context.renderer.camera
    const forward = camera.getForward(), right = camera.getRight()
    const forwardAxis = Number(this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) - Number(this.pressed.has('KeyS') || this.pressed.has('ArrowDown'))
    const rightAxis = Number(this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) - Number(this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'))
    const verticalAxis = Number(this.pressed.has('KeyE') || this.pressed.has('Space')) - Number(this.pressed.has('KeyQ') || this.pressed.has('ShiftLeft'))
    const length = Math.hypot(forwardAxis, rightAxis, verticalAxis) || 1
    const speed = this.freeSpeed * deltaSeconds / length
    const position = camera.getPosition()
    camera.setPosition([
      position[0] + (forward[0] * forwardAxis + right[0] * rightAxis) * speed,
      position[1] + (forward[1] * forwardAxis + right[1] * rightAxis + verticalAxis) * speed,
      position[2] + (forward[2] * forwardAxis + right[2] * rightAxis) * speed,
    ])
  }

  private installInspectionInput(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.originalTabIndex = canvas.tabIndex
    if (canvas.tabIndex < 0) canvas.tabIndex = 0

    const onPointerDown = (event: PointerEvent): void => {
      if (this.modeValue === 'explore') return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.inspectionFocused = true
      this.focusInspectionCanvas()
      this.dragging = true
      this.activePointerId = event.pointerId
      this.lastPointer = [event.clientX, event.clientY]
      this.capturePointer(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging || this.modeValue === 'explore') return
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const dx = event.clientX - this.lastPointer[0], dy = event.clientY - this.lastPointer[1]
      this.lastPointer = [event.clientX, event.clientY]
      if (this.modeValue === 'orbit') {
        this.orbitYaw -= dx * .006
        this.orbitPitch = clamp(this.orbitPitch - dy * .006, -Math.PI / 2 + .03, Math.PI / 2 - .03)
        this.applyOrbitCamera()
      } else if (this.modeValue === 'top' && this.context) {
        const camera = this.context.renderer.camera
        const viewportHeight = Math.max(1, this.canvas?.clientHeight || this.canvas?.height || 1)
        const scale = this.topVerticalSize / viewportHeight
        this.target = [this.target[0] - dx * scale, this.target[1], this.target[2] - dy * scale]
        const current = camera.getPosition()
        camera.setPosition([this.target[0], current[1], this.target[2] + .001])
      } else if (this.modeValue === 'free') this.rotateFree(dx, dy)
    }
    const onPointerUp = (event: PointerEvent): void => {
      if (!this.dragging || this.modeValue === 'explore') return
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.dragging = false
      this.releaseActivePointer()
    }
    const onLostPointerCapture = (event: PointerEvent): void => {
      if (this.activePointerId === event.pointerId) {
        this.activePointerId = null
        this.dragging = false
      }
    }
    const onWheel = (event: WheelEvent): void => {
      if (this.modeValue === 'explore') return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.inspectionFocused = true
      this.focusInspectionCanvas()
      const factor = Math.exp(event.deltaY * .001)
      if (this.modeValue === 'orbit') { this.orbitDistance = clamp(this.orbitDistance * factor, 1, 10_000); this.applyOrbitCamera() }
      else if (this.modeValue === 'top' && this.context) {
        this.topVerticalSize = clamp(this.topVerticalSize * factor, 2, 50_000)
        if (this.context.renderer.camera.setProjection) {
          const current = this.context.renderer.camera.getProjection?.()
          this.context.renderer.camera.setProjection({
            type: 'orthographic',
            verticalSize: this.topVerticalSize,
            near: current?.near ?? .05,
            far: current?.far ?? 2_000,
          })
        } else {
          this.topHeight = clamp(this.topHeight * factor, 3, 20_000)
          this.context.renderer.camera.setPosition([this.target[0], this.target[1] + this.topHeight, this.target[2] + .001])
        }
      } else if (this.modeValue === 'free') {
        this.freeSpeed = clamp(this.freeSpeed * factor, .5, 500)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (this.modeValue !== 'free' || !this.inspectionFocused) return
      this.pressed.add(event.code)
      if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent): void => { this.pressed.delete(event.code) }
    const onBlur = (): void => {
      this.pressed.clear()
      this.dragging = false
      this.releaseActivePointer()
      this.inspectionFocused = false
    }
    const onFocus = (): void => { if (this.modeValue !== 'explore') this.inspectionFocused = true }

    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', onPointerUp, true)
    canvas.addEventListener('pointercancel', onPointerUp, true)
    canvas.addEventListener('lostpointercapture', onLostPointerCapture, true)
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: false })
    canvas.addEventListener('keydown', onKeyDown, true)
    canvas.addEventListener('keyup', onKeyUp, true)
    canvas.addEventListener('blur', onBlur, true)
    canvas.addEventListener('focus', onFocus, true)
    this.cleanups.push(
      () => canvas.removeEventListener('pointerdown', onPointerDown, true),
      () => canvas.removeEventListener('pointermove', onPointerMove, true),
      () => canvas.removeEventListener('pointerup', onPointerUp, true),
      () => canvas.removeEventListener('pointercancel', onPointerUp, true),
      () => canvas.removeEventListener('lostpointercapture', onLostPointerCapture, true),
      () => canvas.removeEventListener('wheel', onWheel, true),
      () => canvas.removeEventListener('keydown', onKeyDown, true),
      () => canvas.removeEventListener('keyup', onKeyUp, true),
      () => canvas.removeEventListener('blur', onBlur, true),
      () => canvas.removeEventListener('focus', onFocus, true),
    )
  }

  private focusInspectionCanvas(): void {
    if (!this.canvas) return
    try { this.canvas.focus({ preventScroll: true }) }
    catch { try { this.canvas.focus() } catch {} }
  }

  private capturePointer(pointerId: number): void {
    if (!this.canvas?.setPointerCapture) return
    try { this.canvas.setPointerCapture(pointerId) }
    catch { /* Browsers may reject capture when the pointer is no longer active. Dragging still works inside the canvas. */ }
  }

  private releaseActivePointer(): void {
    if (!this.canvas || this.activePointerId === null) return
    const pointerId = this.activePointerId
    this.activePointerId = null
    if (!this.canvas.releasePointerCapture) return
    try {
      if (!this.canvas.hasPointerCapture || this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId)
    } catch { /* Pointer capture can already be gone after cancellation or DOM replacement. */ }
  }

  private updateFallRecovery(deltaSeconds: number): void {
    if (!this.context || !this.collisions || this.recoveryOptions === false || this.recoveryDisabled) return
    const options = this.recoveryOptions
    const camera = this.context.renderer.camera
    const position = camera.getPosition()
    const rotation = camera.getRotation()
    const supported = this.resolveSupportedPose(position, rotation)
    if (supported && Math.abs(supported.position[1] - position[1]) <= Math.max(.12, options.supportTolerance ?? .18)) {
      this.groundedSeconds += deltaSeconds
      if (this.groundedSeconds >= .25) this.lastGroundedPose = supported
      if (this.groundedSeconds >= Math.max(1, options.resetAttemptsAfterSeconds ?? 4)) this.recoveryAttempts = 0
    } else this.groundedSeconds = 0

    const minimumY = options.minimumY ?? -12
    if (position[1] >= minimumY) return
    const now = Date.now()
    const cooldown = Math.max(250, options.cooldownMs ?? 1_200)
    if (now - this.lastRecoveryAt < cooldown) return
    const maximum = Math.max(1, Math.floor(options.maxAttempts ?? 3))
    if (this.recoveryAttempts >= maximum) {
      this.recoveryDisabled = true
      this.callbacks.onRecoveryChange?.({ state: 'failed', attempt: this.recoveryAttempts, maxAttempts: maximum, position: copy(position), message: 'Automatic fall recovery stopped after the maximum number of attempts.' })
      return
    }
    this.lastRecoveryAt = now
    this.recoveryAttempts += 1
    const candidate = this.findRecoveryPose()
    if (!candidate) {
      this.recoveryDisabled = true
      this.callbacks.onRecoveryChange?.({ state: 'failed', attempt: this.recoveryAttempts, maxAttempts: maximum, position: copy(position), message: 'No collision-safe recovery surface was found.' })
      return
    }
    const attempt = this.recoveryAttempts
    this.callbacks.onRecoveryChange?.({ state: 'recovering', attempt, maxAttempts: maximum, position: copy(position), message: 'Recovering from a fall.' })
    this.teleport({ ...candidate, resetMotion: true })
    this.recoveryAttempts = attempt
    this.callbacks.onRecoveryChange?.({ state: 'recovered', attempt, maxAttempts: maximum, position: copy(candidate.position), message: 'Recovered to verified walkable ground.' })
  }

  private resolveSupportedPose(position: Vec3, rotation: readonly [number, number]): { position: Vec3; rotation: readonly [number, number] } | null {
    if (!this.context || !this.collisions) return null
    const document = this.context.document.exploration ?? {}
    const eyeHeight = document.eyeHeight ?? 1.65
    const height = document.height ?? 1.75
    const radius = document.radius ?? .3
    const support = this.collisions.findSupportAt(position, position[1] + Math.max(1, document.stepHeight ?? .32))
    if (support === null) return null
    const candidate: Vec3 = [position[0], support + eyeHeight, position[2]]
    if (!this.collisions.canOccupy(candidate, { height, eyeHeight, radius, stepHeight: document.stepHeight ?? .32 })) return null
    return { position: candidate, rotation }
  }

  private findRecoveryPose(): { position: Vec3; rotation: readonly [number, number] } | null {
    const seeds = [this.lastGroundedPose, this.spawnPose].filter((value): value is { position: Vec3; rotation: readonly [number, number] } => Boolean(value))
    for (const seed of seeds) {
      for (const radius of [0, .75, 1.5, 3, 6]) {
        const count = radius === 0 ? 1 : 12
        for (let index = 0; index < count; index += 1) {
          const angle = count === 1 ? 0 : index / count * Math.PI * 2
          const position: Vec3 = [seed.position[0] + Math.cos(angle) * radius, seed.position[1] + 4, seed.position[2] + Math.sin(angle) * radius]
          const supported = this.resolveSupportedPose(position, seed.rotation)
          if (supported) return supported
        }
      }
    }
    return null
  }

  private requireContext(): PluginRuntimeContext {
    if (!this.context) throw new Error('Anyo Player camera controls require a loaded world.')
    return this.context
  }
}
