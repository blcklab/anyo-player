import {
  CollisionWorld,
  type CameraProjection,
  type ExplorationRuntimeController,
  type FirstPersonControllerOptions,
  type PluginRuntimeContext,
  type Vec3,
  type WorldPlugin,
} from '@blcklab/anyo'
import type {
  AnyoPlayerCameraFrameOptions,
  AnyoPlayerCharacterAnchorOptions,
  AnyoPlayerThirdPersonCameraOptions,
  AnyoPlayerThirdPersonCharacterVisibilityOptions,
  AnyoPlayerThirdPersonDynamicFieldOfViewOptions,
  AnyoPlayerThirdPersonOrbitOptions,
  AnyoPlayerThirdPersonShoulderSide,
  AnyoPlayerThirdPersonSmoothingOptions,
  AnyoPlayerCameraMode,
  AnyoPlayerCameraModeOptions,
  AnyoPlayerFallRecoveryOptions,
  AnyoPlayerFallRecoveryStatus,
  AnyoPlayerTeleportOptions,
} from '../types.js'
import { PlayerBody } from './PlayerBody.js'
import { cameraArmFraction, setViewRotation } from './PlayerView.js'

interface CameraControllerCallbacks {
  onModeChange?: (previous: AnyoPlayerCameraMode, mode: AnyoPlayerCameraMode) => void
  onRecoveryChange?: (status: AnyoPlayerFallRecoveryStatus) => void
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))
const copy = (value: readonly [number, number, number]): Vec3 => [value[0], value[1], value[2]]
const damp = (current: number, target: number, response: number, deltaSeconds: number): number => {
  if (deltaSeconds <= 0 || current === target) return current
  const alpha = 1 - Math.exp(-response * deltaSeconds)
  return current + (target - current) * alpha
}

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
  private body: PlayerBody | null = null
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
  private characterAnchor: {
    entityId: string
    offset: Vec3
    followYaw: boolean
    yawOffset: number
    scale: Vec3 | null
    facing: 'camera' | 'movement'
  } | null = null
  private thirdPersonCamera: {
    distance: number
    targetHeight: number
    shoulderOffset: number
    shoulderMagnitude: number
    shoulderSide: AnyoPlayerThirdPersonShoulderSide
    collision: boolean
    characterVisibility: {
      hiddenDistance: number
      fadeStartDistance: number
    } | null
    dynamicFieldOfView: {
      baseFieldOfView: number
      currentFieldOfView: number
      maxBoost: number
      response: number
      startSpeed: number | null
    } | null
    smoothing: {
      enabled: boolean
      horizontalTargetResponse: number
      verticalTargetResponse: number
      zoomResponse: number
      collisionRecoveryResponse: number
      shoulderResponse: number
    }
    orbit: {
      button: 0 | 1 | 2
      freeLookButton: 0 | 1 | 2 | false
      sensitivityX: number
      sensitivityY: number
      minPitch: number
      maxPitch: number
      minDistance: number
      maxDistance: number
      zoomSensitivity: number
      invertX: boolean
      invertY: boolean
      yaw: number
      pitch: number
      movementYaw: number
    } | null
  } | null = null
  private thirdPersonCameraState: {
    target: Vec3
    zoomDistance: number
    armFraction: number
    shoulderOffset: number
  } | null = null
  private readonly thirdPersonPointerButtons = new Set<number>()
  private replacingWorld = false
  private suspendedWorld: PluginRuntimeContext['world'] | null = null
  private suspendedPose: { position: Vec3; rotation: readonly [number, number] } | null = null
  private suspendedAnchor: PlayerCameraController['characterAnchor'] = null
  private suspendedView: PlayerCameraController['thirdPersonCamera'] = null
  private static readonly characterAnchorSource = 'anyo:player-character-anchor'

  constructor(
    private readonly bodyOptions: FirstPersonControllerOptions,
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
      teardown: () => {
        this.suspendedWorld = this.replacingWorld ? null : this.context?.world ?? null
        this.suspendedPose = this.currentBodyPose()
        this.suspendedAnchor = this.characterAnchor
        this.suspendedView = this.thirdPersonCamera
        this.teardown()
      },
      dispose: () => {
        this.teardown()
        this.suspendedWorld = null; this.suspendedPose = null
        this.suspendedAnchor = null; this.suspendedView = null
      },
    }
  }

  setWorldReplacement(active: boolean): void { this.replacingWorld = active }

  get mode(): AnyoPlayerCameraMode { return this.modeValue }
  get enabled(): boolean { return this.enabledValue }
  get inputEnabled(): boolean { return this.inputEnabledValue }
  get characterAnchorEntity(): string | null { return this.characterAnchor?.entityId ?? null }
  get thirdPersonCameraEnabled(): boolean { return this.thirdPersonCamera !== null }

  setCharacterAnchor(options: false | AnyoPlayerCharacterAnchorOptions): void {
    const context = this.requireContext()
    if (options === false) {
      this.setThirdPersonCamera(false)
      this.clearCharacterAnchor()
      return
    }

    const requested = options.character?.trim() || context.document.exploration?.character?.trim()
    if (!requested) throw new TypeError('Character anchor requires an entity id. Pass { character } or set world exploration.character.')
    const entity = context.compiled.entityById.get(requested) ?? context.compiled.entityByAuthoringId.get(requested)
    if (!entity) throw new TypeError(`Character anchor entity "${requested}" was not found in the loaded world.`)

    const offset = options.offset ?? [0, 0, 0]
    if (offset.some(value => !Number.isFinite(value))) throw new TypeError('Character anchor offset must contain finite numbers.')
    const yawOffset = options.yawOffset ?? 0
    if (!Number.isFinite(yawOffset)) throw new TypeError('Character anchor yawOffset must be finite.')
    let scale: Vec3 | null = null
    if (options.scale !== undefined) {
      scale = typeof options.scale === 'number'
        ? [options.scale, options.scale, options.scale]
        : copy(options.scale)
      if (scale.some(value => !Number.isFinite(value) || value <= 0)) {
        throw new TypeError('Character anchor scale must contain positive finite numbers.')
      }
    }

    if (this.characterAnchor && this.characterAnchor.entityId !== entity.id) {
      context.transforms.clear(this.characterAnchor.entityId, PlayerCameraController.characterAnchorSource)
    }
    this.characterAnchor = {
      entityId: entity.id,
      offset: copy(offset),
      followYaw: options.followYaw !== false,
      yawOffset,
      scale,
      facing: options.facing ?? 'camera',
    }
    this.writeCharacterAnchor()
  }

  clearCharacterAnchor(): void {
    if (this.thirdPersonCamera && this.context) this.setThirdPersonCamera(false)
    if (!this.context || !this.characterAnchor) {
      this.characterAnchor = null
      return
    }
    this.context.transforms.clear(this.characterAnchor.entityId, PlayerCameraController.characterAnchorSource)
    this.characterAnchor = null
  }

  setThirdPersonCamera(options: false | AnyoPlayerThirdPersonCameraOptions): void {
    this.requireContext()

    if (options === false) {
      const previousOrbit = this.thirdPersonCamera?.orbit
      this.restoreThirdPersonFieldOfView()
      if (previousOrbit) this.body?.setLookAngles(previousOrbit.movementYaw, previousOrbit.pitch)
      this.body?.setMovementYawOverride(null)
      this.thirdPersonPointerButtons.clear()
      this.thirdPersonCamera = null
      this.thirdPersonCameraState = null
      this.applyExploreCamera()
      return
    }

    if (this.modeValue !== 'explore') throw new TypeError('Third-person follow camera is only available in explore mode.')
    if (!this.characterAnchor) throw new TypeError('Third-person follow camera requires a character anchor first.')

    const targetHeight = options.targetHeight ?? 1.35
    if (!Number.isFinite(targetHeight)) throw new TypeError('Third-person camera targetHeight must be finite.')

    const previousView = this.thirdPersonCamera
    this.restoreThirdPersonFieldOfView()
    const shoulder = this.normalizeThirdPersonShoulder(options, previousView)

    const orbit = options.orbit ? this.normalizeThirdPersonOrbit(options.orbit) : null
    const priorOrbit = previousView?.orbit
    const pose = this.currentBodyPose()
    if (orbit) {
      orbit.yaw = priorOrbit?.yaw ?? pose.rotation[0]
      orbit.pitch = clamp(priorOrbit?.pitch ?? pose.rotation[1], orbit.minPitch, orbit.maxPitch)
      orbit.movementYaw = priorOrbit?.movementYaw ?? priorOrbit?.yaw ?? pose.rotation[0]
    }
    let distance = options.distance ?? this.thirdPersonCamera?.distance ?? 4
    if (!Number.isFinite(distance) || distance <= 0) throw new TypeError('Third-person camera distance must be a positive finite number.')
    if (orbit) distance = clamp(distance, orbit.minDistance, orbit.maxDistance)

    const smoothing = this.normalizeThirdPersonSmoothing(options.smoothing)
    const characterVisibility = this.normalizeThirdPersonCharacterVisibility(options.characterVisibility)
    const dynamicFieldOfView = this.normalizeThirdPersonDynamicFieldOfView(options.dynamicFieldOfView)
    this.thirdPersonCamera = {
      distance,
      targetHeight,
      shoulderOffset: shoulder.offset,
      shoulderMagnitude: shoulder.magnitude,
      shoulderSide: shoulder.side,
      collision: options.collision !== false,
      characterVisibility,
      dynamicFieldOfView,
      smoothing,
      orbit,
    }
    this.thirdPersonCameraState = null
    this.thirdPersonPointerButtons.clear()
    this.body?.setMovementYawOverride(orbit?.movementYaw ?? null)
    if (orbit) this.releasePointerLock()
    this.writeCharacterAnchor()
    this.applyThirdPersonCamera(0, true)
  }

  setThirdPersonShoulder(side: AnyoPlayerThirdPersonShoulderSide, offset?: number): void {
    const view = this.thirdPersonCamera
    if (!view) throw new TypeError('Third-person shoulder controls require an enabled third-person camera.')
    if (!['left', 'center', 'right'].includes(side)) throw new TypeError('Third-person shoulder side must be "left", "center", or "right".')
    if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
      throw new TypeError('Third-person shoulder offset must be a non-negative finite number.')
    }
    if (offset !== undefined) view.shoulderMagnitude = offset
    else if (view.shoulderMagnitude <= 0 && side !== 'center') view.shoulderMagnitude = .45
    view.shoulderSide = side
    view.shoulderOffset = side === 'center' ? 0 : (side === 'right' ? 1 : -1) * view.shoulderMagnitude
    this.applyThirdPersonCamera()
  }

  swapThirdPersonShoulder(): AnyoPlayerThirdPersonShoulderSide {
    const view = this.thirdPersonCamera
    if (!view) throw new TypeError('Third-person shoulder controls require an enabled third-person camera.')
    const side: AnyoPlayerThirdPersonShoulderSide = view.shoulderSide === 'right' ? 'left' : 'right'
    this.setThirdPersonShoulder(side)
    return side
  }

  prefersPointerLock(): boolean { return !this.thirdPersonCamera?.orbit }

  usesPointerLookButton(button: number): boolean {
    const orbit = this.thirdPersonCamera?.orbit
    return Boolean(orbit && (orbit.button === button || orbit.freeLookButton === button))
  }

  beginPointerLook(button: number): boolean {
    const orbit = this.thirdPersonCamera?.orbit
    if (!orbit || !this.usesPointerLookButton(button)) return false
    this.thirdPersonPointerButtons.add(button)
    if (orbit.button === button) {
      // RMB-style authoritative orbit claims the camera's current heading as the movement basis.
      orbit.movementYaw = orbit.yaw
      this.body?.setMovementYawOverride(orbit.movementYaw)
      this.writeCharacterAnchor()
    }
    return true
  }

  endPointerLook(button: number): void {
    this.thirdPersonPointerButtons.delete(button)
  }

  acceptsPointerLook(): boolean {
    return this.thirdPersonCamera?.orbit ? this.currentThirdPersonPointerLookMode() !== null : true
  }

  private currentThirdPersonPointerLookMode(): 'orbit' | 'free-look' | null {
    const orbit = this.thirdPersonCamera?.orbit
    if (!orbit) return null
    // Authoritative orbit wins when both configured buttons are held, matching classic MMORPG mouse chords.
    if (this.thirdPersonPointerButtons.has(orbit.button)) return 'orbit'
    if (orbit.freeLookButton !== false && this.thirdPersonPointerButtons.has(orbit.freeLookButton)) return 'free-look'
    return null
  }

  addZoomDelta(deltaY: number): boolean {
    const view = this.thirdPersonCamera
    const orbit = view?.orbit
    if (!view || !orbit || !Number.isFinite(deltaY)) return false
    view.distance = clamp(view.distance * Math.exp(deltaY * orbit.zoomSensitivity), orbit.minDistance, orbit.maxDistance)
    this.applyThirdPersonCamera()
    return true
  }

  private normalizeThirdPersonOrbit(options: true | AnyoPlayerThirdPersonOrbitOptions): NonNullable<NonNullable<PlayerCameraController['thirdPersonCamera']>['orbit']> {
    const value = options === true ? {} : options
    const button = value.button ?? 2
    const freeLookButton = value.freeLookButton === undefined
      ? (button === 0 ? false : 0)
      : value.freeLookButton
    const sensitivity = value.sensitivity ?? 1
    const sensitivityX = value.sensitivityX ?? sensitivity
    const sensitivityY = value.sensitivityY ?? sensitivity
    const minPitch = value.minPitch ?? -1.2
    const maxPitch = value.maxPitch ?? 1.2
    const minDistance = value.minDistance ?? 1.25
    const maxDistance = value.maxDistance ?? 12
    const zoomSensitivity = value.zoomSensitivity ?? .0015
    if (![0, 1, 2].includes(button)) throw new TypeError('Third-person orbit button must be 0, 1, or 2.')
    if (freeLookButton !== false && ![0, 1, 2].includes(freeLookButton)) throw new TypeError('Third-person free-look button must be 0, 1, 2, or false.')
    if (freeLookButton !== false && freeLookButton === button) throw new TypeError('Third-person free-look button must differ from the authoritative orbit button.')
    if (!Number.isFinite(sensitivity) || sensitivity <= 0) throw new TypeError('Third-person orbit sensitivity must be a positive finite number.')
    if (!Number.isFinite(sensitivityX) || sensitivityX <= 0) throw new TypeError('Third-person orbit sensitivityX must be a positive finite number.')
    if (!Number.isFinite(sensitivityY) || sensitivityY <= 0) throw new TypeError('Third-person orbit sensitivityY must be a positive finite number.')
    if (!Number.isFinite(minPitch) || !Number.isFinite(maxPitch) || minPitch >= maxPitch) throw new TypeError('Third-person orbit pitch limits must be finite and minPitch must be less than maxPitch.')
    if (!Number.isFinite(minDistance) || !Number.isFinite(maxDistance) || minDistance <= 0 || minDistance >= maxDistance) throw new TypeError('Third-person orbit distance limits must be positive and minDistance must be less than maxDistance.')
    if (!Number.isFinite(zoomSensitivity) || zoomSensitivity <= 0) throw new TypeError('Third-person orbit zoomSensitivity must be a positive finite number.')
    return {
      button,
      freeLookButton,
      sensitivityX,
      sensitivityY,
      minPitch,
      maxPitch,
      minDistance,
      maxDistance,
      zoomSensitivity,
      invertX: value.invertX === true,
      invertY: value.invertY === true,
      yaw: 0,
      pitch: 0,
      movementYaw: 0,
    }
  }

  private normalizeThirdPersonSmoothing(options: boolean | AnyoPlayerThirdPersonSmoothingOptions | undefined): NonNullable<PlayerCameraController['thirdPersonCamera']>['smoothing'] {
    if (options === false) {
      return {
        enabled: false,
        horizontalTargetResponse: 18,
        verticalTargetResponse: 10,
        zoomResponse: 16,
        collisionRecoveryResponse: 8,
        shoulderResponse: 14,
      }
    }
    const value = options === true || options === undefined ? {} : options
    const horizontalTargetResponse = value.horizontalTargetResponse ?? 18
    const verticalTargetResponse = value.verticalTargetResponse ?? 10
    const zoomResponse = value.zoomResponse ?? 16
    const collisionRecoveryResponse = value.collisionRecoveryResponse ?? 8
    const shoulderResponse = value.shoulderResponse ?? 14
    for (const [name, response] of [
      ['horizontalTargetResponse', horizontalTargetResponse],
      ['verticalTargetResponse', verticalTargetResponse],
      ['zoomResponse', zoomResponse],
      ['collisionRecoveryResponse', collisionRecoveryResponse],
      ['shoulderResponse', shoulderResponse],
    ] as const) {
      if (!Number.isFinite(response) || response <= 0) {
        throw new TypeError(`Third-person camera ${name} must be a positive finite number.`)
      }
    }
    return { enabled: true, horizontalTargetResponse, verticalTargetResponse, zoomResponse, collisionRecoveryResponse, shoulderResponse }
  }

  private normalizeThirdPersonShoulder(
    options: AnyoPlayerThirdPersonCameraOptions,
    previous: PlayerCameraController['thirdPersonCamera'],
  ): { offset: number; magnitude: number; side: AnyoPlayerThirdPersonShoulderSide } {
    const requestedOffset = options.shoulderOffset
    if (requestedOffset !== undefined && !Number.isFinite(requestedOffset)) {
      throw new TypeError('Third-person camera shoulderOffset must be finite.')
    }
    const requestedSide = options.shoulderSide
    if (requestedSide !== undefined && !['left', 'center', 'right'].includes(requestedSide)) {
      throw new TypeError('Third-person camera shoulderSide must be "left", "center", or "right".')
    }

    if (requestedSide !== undefined) {
      const magnitude = Math.abs(requestedOffset ?? previous?.shoulderMagnitude ?? .45)
      const offset = requestedSide === 'center' ? 0 : (requestedSide === 'right' ? 1 : -1) * magnitude
      return { offset, magnitude, side: requestedSide }
    }

    const offset = requestedOffset ?? previous?.shoulderOffset ?? 0
    const magnitude = Math.abs(offset) || previous?.shoulderMagnitude || 0
    const side: AnyoPlayerThirdPersonShoulderSide = offset > 0 ? 'right' : offset < 0 ? 'left' : 'center'
    return { offset, magnitude, side }
  }

  private normalizeThirdPersonCharacterVisibility(
    options: boolean | AnyoPlayerThirdPersonCharacterVisibilityOptions | undefined,
  ): NonNullable<PlayerCameraController['thirdPersonCamera']>['characterVisibility'] {
    if (options === false) return null
    const value = options === true || options === undefined ? {} : options
    const hiddenDistance = value.hiddenDistance ?? .5
    const fadeStartDistance = value.fadeStartDistance ?? 1.35
    if (!Number.isFinite(hiddenDistance) || hiddenDistance < 0) {
      throw new TypeError('Third-person character visibility hiddenDistance must be a non-negative finite number.')
    }
    if (!Number.isFinite(fadeStartDistance) || fadeStartDistance <= hiddenDistance) {
      throw new TypeError('Third-person character visibility fadeStartDistance must be finite and greater than hiddenDistance.')
    }
    return { hiddenDistance, fadeStartDistance }
  }

  private normalizeThirdPersonDynamicFieldOfView(
    options: boolean | AnyoPlayerThirdPersonDynamicFieldOfViewOptions | undefined,
  ): NonNullable<PlayerCameraController['thirdPersonCamera']>['dynamicFieldOfView'] {
    if (!options) return null
    const value = options === true ? {} : options
    const projection = this.context?.renderer.camera.getProjection?.()
    const baseFieldOfView = projection?.type === 'perspective' && Number.isFinite(projection.fieldOfView)
      ? projection.fieldOfView!
      : 70
    const maxBoost = value.maxBoost ?? 5
    const response = value.response ?? 7
    const startSpeed = value.startSpeed ?? null
    if (!Number.isFinite(baseFieldOfView)) throw new TypeError('Third-person dynamic FOV base field of view must be finite.')
    if (!Number.isFinite(maxBoost) || maxBoost < 0) throw new TypeError('Third-person dynamic FOV maxBoost must be a non-negative finite number.')
    if (!Number.isFinite(response) || response <= 0) throw new TypeError('Third-person dynamic FOV response must be a positive finite number.')
    if (startSpeed !== null && (!Number.isFinite(startSpeed) || startSpeed < 0)) {
      throw new TypeError('Third-person dynamic FOV startSpeed must be a non-negative finite number.')
    }
    return { baseFieldOfView, currentFieldOfView: baseFieldOfView, maxBoost, response, startSpeed }
  }

  setEnabled(enabled: boolean): void {
    this.enabledValue = Boolean(enabled)
    this.syncBodyState()
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabledValue = Boolean(enabled)
    this.syncBodyState()
  }

  clearInput(): void {
    this.body?.clearInput()
    this.pressed.clear()
    this.dragging = false
    this.thirdPersonPointerButtons.clear()
    this.releaseActivePointer()
  }

  releasePointerLock(): void {
    const canvas = this.context?.renderer.canvas
    if (typeof document !== 'undefined' && document.pointerLockElement === canvas) void document.exitPointerLock?.()
  }

  setMoveAxes(right: number, forward: number): void {
    if (this.modeValue === 'explore') this.body?.setMoveAxes(right, forward)
  }

  setRun(running: boolean): void {
    if (this.modeValue === 'explore') this.body?.setRun(running)
  }

  addLookDelta(deltaX: number, deltaY: number): void {
    if (this.modeValue === 'explore') {
      const orbit = this.thirdPersonCamera?.orbit
      if (orbit && this.body) {
        const horizontal = orbit.invertX ? -deltaX : deltaX
        const vertical = orbit.invertY ? -deltaY : deltaY
        orbit.yaw -= horizontal * this.body.lookSensitivity * orbit.sensitivityX
        orbit.pitch = clamp(orbit.pitch - vertical * this.body.lookSensitivity * orbit.sensitivityY, orbit.minPitch, orbit.maxPitch)
        if (this.currentThirdPersonPointerLookMode() !== 'free-look') {
          orbit.movementYaw = orbit.yaw
          this.body.setMovementYawOverride(orbit.movementYaw)
        }
        this.writeCharacterAnchor()
        this.applyThirdPersonCamera()
      } else this.body?.addLookDelta(deltaX, deltaY)
    } else if (this.modeValue === 'free') this.rotateFree(deltaX, deltaY)
  }

  requestJump(): void { if (this.modeValue === 'explore') this.body?.requestJump() }

  setFieldOfView(fieldOfView: number): void {
    if (!Number.isFinite(fieldOfView)) throw new TypeError('Anyo Player field of view must be finite.')
    const context = this.requireContext()
    const projection = context.renderer.camera.getProjection?.()
    if (projection?.type === 'orthographic') return
    const clamped = Math.max(20, Math.min(140, fieldOfView))
    const dynamic = this.thirdPersonCamera?.dynamicFieldOfView
    if (dynamic) {
      dynamic.baseFieldOfView = clamped
      dynamic.currentFieldOfView = clamped
    }
    context.renderer.camera.setProjection?.({
      type: 'perspective',
      fieldOfView: clamped,
      ...(projection?.near === undefined ? {} : { near: projection.near }),
      ...(projection?.far === undefined ? {} : { far: projection.far }),
    })
  }

  setMode(mode: AnyoPlayerCameraMode, options: AnyoPlayerCameraModeOptions = {}): void {
    const context = this.requireContext()
    if (mode === this.modeValue && Object.keys(options).length === 0) return
    const previous = this.modeValue
    if (previous === 'explore') {
      if (mode !== 'explore') this.restoreThirdPersonFieldOfView()
      const pose = this.currentBodyPose()
      this.explorePose = {
        position: copy(pose.position),
        rotation: [...pose.rotation] as [number, number],
      }
      if (this.thirdPersonCamera) {
        this.thirdPersonCameraState = null
        context.renderer.camera.setPosition(copy(pose.position))
        setViewRotation(context.renderer.camera, pose.rotation[0], pose.rotation[1])
      }
    }
    if (previous === 'top' && mode !== 'top') this.restoreSavedProjection()
    if (mode === 'top' && previous !== 'top') this.savedProjection = context.renderer.camera.getProjection?.() ?? null
    this.modeValue = mode
    this.clearInput()
    this.releasePointerLock()
    this.inspectionFocused = mode !== 'explore'
    this.applyModeOptions(options)
    this.syncBodyState()
    if (mode === 'explore') {
      const pose = options.restoreExplorePose === false ? null : this.explorePose
      if (pose) this.teleport({ ...pose, resetMotion: true })
      else if (options.restoreExplorePose === false) this.teleport({ position: context.renderer.camera.getPosition(), rotation: context.renderer.camera.getRotation() })
    } else if (options.bounds || options.target) {
      this.frame(options)
    } else if (mode === 'orbit' || mode === 'top') {
      this.frame({ target: this.target, radius: Math.max(5, this.orbitDistance / 2) })
    }
    if (mode === 'explore') this.applyExploreCamera(0, true)
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
      setViewRotation(context.renderer.camera, options.northUp === false ? this.orbitYaw : 0, -Math.PI / 2 + .00001)
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
      setViewRotation(context.renderer.camera, rotation[0], rotation[1])
    }
  }

  teleport(options: AnyoPlayerTeleportOptions): void {
    const context = this.requireContext()
    const position = copy(options.position)
    if (!position.every(Number.isFinite)) throw new TypeError('Anyo Player teleport position must contain finite numbers.')
    this.body?.teleport(position, options.rotation, options.resetMotion !== false)
    if (options.clearInput !== false) this.clearInput()
    this.recoveryDisabled = false
    this.recoveryAttempts = 0
    this.groundedSeconds = 0
    this.writeCharacterAnchor()
    this.thirdPersonCameraState = null
    this.applyExploreCamera(0, true)
  }

  private setup(context: PluginRuntimeContext): void {
    const retained = this.suspendedWorld === context.world ? {
      pose: this.suspendedPose, anchor: this.suspendedAnchor, view: this.suspendedView,
    } : null
    this.suspendedWorld = null; this.suspendedPose = null
    this.suspendedAnchor = null; this.suspendedView = null
    this.teardown()
    this.context = context
    this.collisions = new CollisionWorld(context.compiled.colliders)
    this.spawnPose = { position: copy(context.renderer.camera.getPosition()), rotation: [...context.renderer.camera.getRotation()] as [number, number] }
    this.savedProjection = context.renderer.camera.getProjection?.() ?? null
    this.lastGroundedPose = this.resolveSupportedPose(this.spawnPose.position, this.spawnPose.rotation)
    this.createBody()
    // Anyo applies spawn/active-camera pose AFTER plugin setup, then emits world:load.
    this.cleanups.push(context.world.on('world:load', () => {
      const spawn = context.document.exploration?.spawn
      const room = spawn?.room ? context.compiled.roomById.get(spawn.room) : null
      const position = spawn?.position
      const spawnPosition = position && room
        ? [(room.bounds.min[0] + room.bounds.max[0]) / 2 + position[0], room.bounds.min[1] + position[1], (room.bounds.min[2] + room.bounds.max[2]) / 2 + position[2]] as Vec3
        : position
      this.body?.teleport(retained?.pose?.position ?? spawnPosition ?? context.renderer.camera.getPosition(), retained?.pose?.rotation ?? (spawnPosition ? [0, 0] : context.renderer.camera.getRotation()))
      if (retained?.anchor && context.compiled.entityById.has(retained.anchor.entityId)) {
        this.characterAnchor = retained.anchor
        this.thirdPersonCamera = retained.view
        this.thirdPersonCameraState = null
        this.writeCharacterAnchor()
      }
      this.spawnPose = this.currentBodyPose()
      this.lastGroundedPose = this.resolveSupportedPose(this.spawnPose.position, this.spawnPose.rotation)
      this.applyExploreCamera(0, true)
    }))
    this.unbind = context.world.exploration.bind(this)
    this.installInspectionInput(context.renderer.canvas)
  }

  private teardown(): void {
    this.clearCharacterAnchor()
    this.unbind?.(); this.unbind = null
    this.body?.dispose(); this.body = null
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
    this.thirdPersonCamera = null
    this.thirdPersonCameraState = null
    this.thirdPersonPointerButtons.clear()
  }

  private createBody(): void {
    if (!this.context) return
    this.body?.dispose()
    this.body = new PlayerBody(this.context, this.bodyOptions)
    this.syncBodyState()
  }

  private syncBodyState(): void {
    this.body?.setEnabled(this.enabledValue && this.modeValue === 'explore')
    this.body?.setInputEnabled(this.inputEnabledValue && this.modeValue === 'explore')
  }

  private update(deltaSeconds: number): void {
    if (!this.context || !this.enabledValue || this.context.world.xr.state === 'active') return
    if (this.modeValue === 'explore') {
      this.body?.setMovementYawOverride(this.thirdPersonCamera?.orbit?.movementYaw ?? null)
      this.body?.update(deltaSeconds)
      this.updateFallRecovery(deltaSeconds)
      this.writeCharacterAnchor()
      this.applyExploreCamera(deltaSeconds)
    } else if (this.modeValue === 'free' && this.inspectionFocused) this.updateFree(deltaSeconds)
  }

  private currentBodyPose(): { position: Vec3; rotation: readonly [number, number] } {
    return this.body?.pose ?? { position: [0, 0, 0], rotation: [0, 0] }
  }

  get locomotion() {
    return this.body?.locomotion ?? null
  }

  /** A snapshot of body and actual adapter camera coordinates, in world metres. */
  get viewState() {
    const pose = this.currentBodyPose()
    const feet = this.body?.feet ?? [0, 0, 0] as Vec3
    const camera = this.context?.renderer.camera.getPosition() ?? pose.position
    const target: Vec3 = this.thirdPersonCamera
      ? copy(this.thirdPersonCameraState?.target ?? [feet[0], feet[1] + this.thirdPersonCamera.targetHeight, feet[2]])
      : copy(pose.position)
    const viewRotation = this.thirdPersonCamera?.orbit
      ? [this.thirdPersonCamera.orbit.yaw, this.thirdPersonCamera.orbit.pitch] as const
      : pose.rotation
    const actualDistance = Math.hypot(camera[0] - target[0], camera[1] - target[1], camera[2] - target[2])
    const shoulderOffset = this.thirdPersonCameraState?.shoulderOffset ?? this.thirdPersonCamera?.shoulderOffset ?? 0
    const shoulderSide: AnyoPlayerThirdPersonShoulderSide = shoulderOffset > 1e-6 ? 'right' : shoulderOffset < -1e-6 ? 'left' : 'center'
    const projection = this.context?.renderer.camera.getProjection?.()
    return {
      feet: copy(feet), eye: copy(pose.position), camera: copy(camera), target,
      yaw: viewRotation[0], pitch: viewRotation[1], facingYaw: this.body?.facingYaw ?? 0,
      grounded: this.body?.grounded ?? false,
      requestedDistance: this.thirdPersonCamera?.distance ?? 0,
      actualDistance,
      shoulderOffset,
      shoulderSide,
      characterVisibility: this.resolveCharacterVisibility(actualDistance),
      fieldOfView: projection?.type === 'perspective' && Number.isFinite(projection.fieldOfView)
        ? projection.fieldOfView!
        : null,
    }
  }

  private applyExploreCamera(deltaSeconds = 0, snapThirdPerson = false): void {
    if (!this.context || this.modeValue !== 'explore') return
    if (this.thirdPersonCamera) { this.applyThirdPersonCamera(deltaSeconds, snapThirdPerson); return }
    const pose = this.currentBodyPose()
    this.context.renderer.camera.setPosition(pose.position)
    setViewRotation(this.context.renderer.camera, pose.rotation[0], pose.rotation[1])
  }

  private applyThirdPersonCamera(deltaSeconds = 0, snap = false): void {
    if (!this.context || !this.thirdPersonCamera || this.modeValue !== 'explore') return
    const camera = this.context.renderer.camera
    const feet = this.body!.feet
    const pose = this.currentBodyPose()
    const view = this.thirdPersonCamera
    const yaw = view.orbit?.yaw ?? pose.rotation[0]
    const pitch = view.orbit?.pitch ?? pose.rotation[1]
    const rawTarget: Vec3 = [feet[0], feet[1] + view.targetHeight, feet[2]]
    const smoothing = view.smoothing
    let state = this.thirdPersonCameraState
    if (!state || snap || !smoothing.enabled) {
      state = { target: copy(rawTarget), zoomDistance: view.distance, armFraction: 1, shoulderOffset: view.shoulderOffset }
      this.thirdPersonCameraState = state
    } else if (deltaSeconds > 0) {
      state.target = [
        damp(state.target[0], rawTarget[0], smoothing.horizontalTargetResponse, deltaSeconds),
        damp(state.target[1], rawTarget[1], smoothing.verticalTargetResponse, deltaSeconds),
        damp(state.target[2], rawTarget[2], smoothing.horizontalTargetResponse, deltaSeconds),
      ]
      state.zoomDistance = damp(state.zoomDistance, view.distance, smoothing.zoomResponse, deltaSeconds)
      state.shoulderOffset = damp(state.shoulderOffset, view.shoulderOffset, smoothing.shoulderResponse, deltaSeconds)
    }
    const target = state.target
    const forward = forwardFromRotation(yaw, pitch)
    const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
    const offset: Vec3 = [
      -forward[0] * state.zoomDistance + right[0] * state.shoulderOffset,
      -forward[1] * state.zoomDistance,
      -forward[2] * state.zoomDistance + right[2] * state.shoulderOffset,
    ]
    const collisionFraction = view.collision
      ? cameraArmFraction(target, offset, this.context.compiled.colliders, this.characterAnchor?.entityId)
      : 1
    if (!smoothing.enabled || snap) state.armFraction = collisionFraction
    else if (collisionFraction < state.armFraction) {
      // Never ease through an obstruction: camera entry is immediate for collision safety.
      state.armFraction = collisionFraction
    } else if (deltaSeconds > 0) {
      // Recovery is intentionally slower to avoid the camera popping outward after walls/corners clear.
      state.armFraction = damp(state.armFraction, collisionFraction, smoothing.collisionRecoveryResponse, deltaSeconds)
    }
    camera.setPosition([
      target[0] + offset[0] * state.armFraction,
      target[1] + offset[1] * state.armFraction,
      target[2] + offset[2] * state.armFraction,
    ])
    setViewRotation(camera, yaw, pitch)
    this.applyThirdPersonFieldOfView(deltaSeconds, snap)
  }

  private resolveCharacterVisibility(actualDistance: number): number {
    const options = this.thirdPersonCamera?.characterVisibility
    if (!options) return 1
    if (actualDistance <= options.hiddenDistance) return 0
    if (actualDistance >= options.fadeStartDistance) return 1
    return clamp(
      (actualDistance - options.hiddenDistance) / (options.fadeStartDistance - options.hiddenDistance),
      0,
      1,
    )
  }

  private applyThirdPersonFieldOfView(deltaSeconds: number, snap: boolean): void {
    if (!this.context) return
    const dynamic = this.thirdPersonCamera?.dynamicFieldOfView
    if (!dynamic) return
    if (!snap && deltaSeconds <= 0) return
    const projection = this.context.renderer.camera.getProjection?.()
    if (projection?.type === 'orthographic' || !this.context.renderer.camera.setProjection) return
    const locomotion = this.body?.locomotion
    const speed = locomotion?.horizontalSpeed ?? 0
    const startSpeed = dynamic.startSpeed ?? locomotion?.walkSpeed ?? 0
    const runSpeed = Math.max(startSpeed + 1e-6, locomotion?.runSpeed ?? startSpeed + 1)
    const speedRatio = clamp((speed - startSpeed) / (runSpeed - startSpeed), 0, 1)
    const desired = clamp(dynamic.baseFieldOfView + dynamic.maxBoost * speedRatio, 20, 140)
    dynamic.currentFieldOfView = snap
      ? desired
      : damp(dynamic.currentFieldOfView, desired, dynamic.response, deltaSeconds)
    this.context.renderer.camera.setProjection({
      type: 'perspective',
      fieldOfView: dynamic.currentFieldOfView,
      ...(projection?.near === undefined ? {} : { near: projection.near }),
      ...(projection?.far === undefined ? {} : { far: projection.far }),
    })
  }

  private restoreThirdPersonFieldOfView(): void {
    const dynamic = this.thirdPersonCamera?.dynamicFieldOfView
    if (!this.context || !dynamic || !this.context.renderer.camera.setProjection) return
    const projection = this.context.renderer.camera.getProjection?.()
    if (projection?.type === 'orthographic') return
    dynamic.currentFieldOfView = dynamic.baseFieldOfView
    this.context.renderer.camera.setProjection({
      type: 'perspective',
      fieldOfView: dynamic.baseFieldOfView,
      ...(projection?.near === undefined ? {} : { near: projection.near }),
      ...(projection?.far === undefined ? {} : { far: projection.far }),
    })
  }

  private writeCharacterAnchor(): void {
    if (!this.context || !this.characterAnchor) return
    const pose = this.currentBodyPose()
    const position = pose.position
    const yaw = this.thirdPersonCamera?.orbit?.movementYaw ?? pose.rotation[0]
    const eyeHeight = this.body?.eyeHeight ?? 1.65
    const [rightOffset, upOffset, forwardOffset] = this.characterAnchor.offset
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const bodyPosition: Vec3 = [
      position[0] + rightX * rightOffset + forwardX * forwardOffset,
      position[1] - eyeHeight + upOffset,
      position[2] + rightZ * rightOffset + forwardZ * forwardOffset,
    ]
    const facing = this.characterAnchor.facing === 'movement' ? this.body?.facingYaw ?? yaw : yaw
    const bodyYaw = (this.characterAnchor.followYaw ? facing : 0) + this.characterAnchor.yawOffset
    this.context.transforms.set(this.characterAnchor.entityId, {
      position: bodyPosition,
      rotation: [0, bodyYaw, 0],
      ...(this.characterAnchor.scale ? { scale: copy(this.characterAnchor.scale) } : {}),
    }, {
      source: PlayerCameraController.characterAnchorSource,
      priority: 1_000,
      mode: 'override',
      space: 'world',
    })
  }

  private setColliders(colliders: PluginRuntimeContext['compiled']['colliders']): void {
    this.collisions?.setColliders(colliders)
    this.body?.setColliders(colliders)
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
    setViewRotation(this.context.renderer.camera, this.orbitYaw, this.orbitPitch)
  }

  private rotateFree(deltaX: number, deltaY: number): void {
    if (!this.context) return
    const rotation = this.context.renderer.camera.getRotation()
    setViewRotation(this.context.renderer.camera, rotation[0] - deltaX * .004, clamp(rotation[1] - deltaY * .004, -Math.PI / 2 + .02, Math.PI / 2 - .02))
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
    const { position, rotation } = this.currentBodyPose()
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
