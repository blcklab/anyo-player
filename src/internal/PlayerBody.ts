import { CollisionWorld, type FirstPersonControllerOptions, type PluginRuntimeContext, type Vec3 } from '@blcklab/anyo'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** Player-owned locomotion state. The rendered camera is never an input to a step. */
export class PlayerBody {
  private readonly collisions: CollisionWorld
  private readonly config
  private position: Vec3
  private yaw: number
  private pitch: number
  private movementYawOverride: number | null = null
  private velocityY = 0
  private horizontalVelocity: Vec3 = [0, 0, 0]
  private horizontalSpeed = 0
  private resetSerial = 0
  private axes: [number, number] = [0, 0]
  private running = false
  private jump = false
  private enabled = true
  private inputEnabled = false
  private readonly cleanups: Array<() => void> = []
  grounded = false
  facingYaw: number

  constructor(private readonly context: PluginRuntimeContext, options: FirstPersonControllerOptions) {
    const e = context.document.exploration ?? {}
    this.config = {
      height: e.height ?? 1.75, eyeHeight: e.eyeHeight ?? 1.65,
      radius: e.radius ?? .3, stepHeight: e.stepHeight ?? .32,
      walkSpeed: e.walkSpeed ?? 3.2, runSpeed: e.runSpeed ?? 5.5,
      gravity: e.gravity ?? 9.81, sensitivity: options.lookSensitivity ?? .0022,
    }
    this.collisions = new CollisionWorld(context.compiled.colliders)
    this.position = [...context.renderer.camera.getPosition()]
    ;[this.yaw, this.pitch] = context.renderer.camera.getRotation()
    this.facingYaw = this.yaw
    this.cleanups.push(context.world.on('world:stop', () => this.clearInput()), context.world.on('xr:session-start', () => this.clearInput()))
  }

  get eyeHeight() { return this.config.eyeHeight }
  get lookSensitivity() { return this.config.sensitivity }
  get feet(): Vec3 { return [this.position[0], this.position[1] - this.eyeHeight, this.position[2]] }
  get pose() { return { position: [...this.position] as Vec3, rotation: [this.yaw, this.pitch] as const } }
  get locomotion() {
    return {
      horizontalVelocity: [...this.horizontalVelocity] as Vec3,
      horizontalSpeed: this.horizontalSpeed,
      verticalVelocity: this.velocityY,
      grounded: this.grounded,
      runIntent: this.running,
      walkSpeed: this.config.walkSpeed,
      runSpeed: this.config.runSpeed,
      resetSerial: this.resetSerial,
    }
  }
  setEnabled(value: boolean) { this.enabled = value; if (!value) this.clearInput() }
  setInputEnabled(value: boolean) { this.inputEnabled = value; if (!value) this.clearInput() }
  setMoveAxes(right: number, forward: number) {
    this.axes = [clamp(Number.isFinite(right) ? right : 0, -1, 1), clamp(Number.isFinite(forward) ? forward : 0, -1, 1)]
  }
  setRun(value: boolean) { this.running = value }
  requestJump() { if (this.enabled && this.inputEnabled) this.jump = true }
  clearInput() {
    this.axes = [0, 0]
    this.running = false
    this.jump = false
    this.horizontalVelocity = [0, 0, 0]
    this.horizontalSpeed = 0
  }
  addLookDelta(x: number, y: number) {
    if (!this.enabled || !this.inputEnabled || this.context.world.xr.state === 'active' || !Number.isFinite(x) || !Number.isFinite(y)) return
    this.yaw -= x * this.config.sensitivity
    this.pitch = clamp(this.pitch - y * this.config.sensitivity, -1.35, 1.35)
  }
  setLookAngles(yaw: number, pitch: number) {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return
    this.yaw = yaw
    this.pitch = clamp(pitch, -1.35, 1.35)
  }
  setMovementYawOverride(yaw: number | null) {
    this.movementYawOverride = yaw === null || !Number.isFinite(yaw) ? null : yaw
  }
  setColliders(colliders: PluginRuntimeContext['compiled']['colliders']) { this.collisions.setColliders(colliders) }
  teleport(position: Vec3, rotation?: readonly [number, number], reset = true) {
    if (rotation && !rotation.every(Number.isFinite)) throw new TypeError('Player rotation must be finite.')
    this.position = [...position]
    if (rotation) { this.yaw = rotation[0]; this.pitch = clamp(rotation[1], -1.35, 1.35); this.facingYaw = this.yaw }
    if (reset) {
      this.velocityY = 0
      this.grounded = false
      this.jump = false
      this.horizontalVelocity = [0, 0, 0]
      this.horizontalSpeed = 0
      this.resetSerial += 1
    }
  }
  update(delta: number) {
    if (!this.enabled || !this.inputEnabled || this.context.world.xr.state === 'active' || !Number.isFinite(delta) || delta <= 0) return
    // Bounded substeps prevent long inactive frames from tunnelling or causing a gravity spike.
    const duration = Math.min(delta, .1)
    const steps = Math.ceil(duration / (1 / 120))
    const dt = duration / steps
    const [right, forward] = this.axes
    const divisor = Math.max(1, Math.hypot(right, forward))
    const speed = this.running ? this.config.runSpeed : this.config.walkSpeed
    const movementYaw = this.movementYawOverride ?? this.yaw
    const dx = (Math.cos(movementYaw) * right - Math.sin(movementYaw) * forward) / divisor * speed
    const dz = (-Math.sin(movementYaw) * right - Math.cos(movementYaw) * forward) / divisor * speed
    const before = [...this.position]
    for (let i = 0; i < steps; i++) {
      if (this.jump && this.grounded) this.velocityY = Math.sqrt(2 * this.config.gravity)
      this.jump = false
      this.velocityY -= this.config.gravity * dt
      const previous = [...this.position] as Vec3
      const result = this.collisions.move(previous, [dx * dt, this.velocityY * dt, dz * dt], this.velocityY, this.config)
      // CollisionWorld handles ground/walls/steps; stop upward motion at ceilings too.
      if (this.velocityY > 0 && !this.collisions.canOccupy(result.position, this.config)) {
        result.position = [result.position[0], previous[1], result.position[2]]
        result.velocityY = 0
      }
      this.position = result.position
      this.velocityY = result.velocityY
      this.grounded = result.grounded
    }
    const movedX = this.position[0] - before[0]!, movedZ = this.position[2] - before[2]!
    this.horizontalVelocity = [movedX / duration, 0, movedZ / duration]
    this.horizontalSpeed = Math.hypot(this.horizontalVelocity[0], this.horizontalVelocity[2])
    if (Math.hypot(movedX, movedZ) > 1e-5) this.facingYaw = Math.atan2(-movedX, -movedZ)
    const room = this.context.compiled.rooms.find(r => this.position.every((v, i) => v >= r.bounds.min[i]! && v <= r.bounds.max[i]!))
    this.context.world.setCurrentRoom(room?.roomId ?? null)
  }
  dispose() { this.clearInput(); for (const cleanup of this.cleanups.splice(0)) cleanup() }
}
