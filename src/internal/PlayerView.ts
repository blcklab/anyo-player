import type { CameraAdapter, CompiledCollider, Vec3 } from '@blcklab/anyo'

/** Use the native camera's yaw/pitch contract when the adapter exposes it. */
export function setViewRotation(camera: CameraAdapter, yaw: number, pitch: number): void {
  const native = (camera as CameraAdapter & { nativeCamera?: { setViewAngles?: (pitch: number, yaw: number, roll: number) => unknown } }).nativeCamera
  if (native?.setViewAngles) native.setViewAngles(pitch, yaw, 0)
  else camera.setRotation(yaw, pitch)
}

/** Conservative swept camera radius against the world's enabled collision boxes. */
export function cameraArmFraction(target: Vec3, arm: Vec3, colliders: readonly CompiledCollider[], character?: string): number {
  const length = Math.hypot(...arm)
  if (length < 1e-6) return 1
  let fraction = 1
  const radius = .15
  for (const collider of colliders) {
    if (!collider.enabled || (character && collider.entityId === character)) continue
    let near = 0, far = 1
    for (let axis = 0; axis < 3; axis++) {
      const min = collider.bounds.min[axis]! - radius, max = collider.bounds.max[axis]! + radius
      const origin = target[axis]!, direction = arm[axis]!
      if (Math.abs(direction) < 1e-9) {
        if (origin < min || origin > max) { far = -1; break }
      } else {
        const a = (min - origin) / direction, b = (max - origin) / direction
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b))
      }
    }
    if (near <= far && far >= 0) fraction = Math.min(fraction, Math.max(0, near - .03 / length))
  }
  return fraction
}
