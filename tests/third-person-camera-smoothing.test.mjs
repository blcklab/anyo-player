import test from 'node:test'
import assert from 'node:assert/strict'
import { PlayerCameraController } from '../dist/internal/PlayerCameraController.js'

function fixture({ wallEnabled = false } = {}) {
  let position = [0, 1.65, 0]
  let rotation = [0, 0]
  const listeners = new Map()
  const camera = {
    getPosition: () => [...position],
    setPosition: value => { position = [...value] },
    getRotation: () => [...rotation],
    setRotation: (yaw, pitch) => { rotation = [yaw, pitch] },
    getForward() { const c = Math.cos(rotation[1]); return [-Math.sin(rotation[0]) * c, Math.sin(rotation[1]), -Math.cos(rotation[0]) * c] },
    getRight() { return [Math.cos(rotation[0]), 0, -Math.sin(rotation[0])] },
    getProjection: () => ({ type: 'perspective', fieldOfView: 60, near: .1, far: 1000 }),
    setProjection() {},
  }
  const canvas = {
    tabIndex: -1, clientWidth: 640, clientHeight: 360,
    ownerDocument: { activeElement: null },
    addEventListener() {}, removeEventListener() {}, focus() {},
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false },
  }
  const world = {
    exploration: { bind(controller) { this.controller = controller; return () => { this.controller = null } } },
    xr: { state: 'idle' },
    on(name, listener) {
      let bucket = listeners.get(name)
      if (!bucket) listeners.set(name, bucket = new Set())
      bucket.add(listener)
      return () => bucket.delete(listener)
    },
    emit() {}, setCurrentRoom() {},
  }
  const wall = {
    id: 'wall', entityId: 'wall', enabled: wallEnabled, kind: 'wall',
    bounds: { min: [-2, 0, 1.5], max: [2, 4, 2] },
  }
  const hero = { id: 'hero' }
  const transformWrites = []
  const context = {
    renderer: { canvas, camera }, world,
    document: { exploration: { height: 1.75, eyeHeight: 1.65, radius: .3, stepHeight: .32, gravity: 9.81, walkSpeed: 3.2, runSpeed: 5.5 } },
    compiled: {
      rooms: [],
      colliders: [
        { id: 'ground', entityId: 'ground', enabled: true, kind: 'floor', bounds: { min: [-50, -.2, -50], max: [50, 0, 50] } },
        wall,
      ],
      entityById: new Map([['hero', hero]]),
      entityByAuthoringId: new Map(),
    },
    transforms: {
      set(...args) { transformWrites.push(args) },
      clear() {},
    },
    query: {},
  }
  return {
    context, wall, transformWrites,
    get position() { return position },
  }
}

function createThirdPerson(f, options = {}) {
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  controller.setEnabled(true)
  controller.setInputEnabled(true)
  controller.setCharacterAnchor({ character: 'hero' })
  controller.setThirdPersonCamera({ distance: 4, orbit: true, ...options })
  return controller
}

test('third-person follow target uses frame-rate-independent damping while the authoritative body remains immediate', () => {
  const f = fixture()
  const controller = createThirdPerson(f)
  const initial = controller.viewState
  assert.ok(Math.abs(initial.actualDistance - 4) < 1e-6)

  controller.setMoveAxes(1, 0)
  controller.plugin.update(.1, f.context)
  controller.setMoveAxes(0, 0)

  const view = controller.viewState
  assert.ok(view.feet[0] > 0.25, 'body should move immediately')
  assert.ok(view.target[0] > 0, 'camera target should follow')
  assert.ok(view.target[0] < view.feet[0], 'visual target should damp behind the authoritative body')
  controller.plugin.teardown()
})

test('wheel zoom changes requested distance immediately but eases the physical camera arm', () => {
  const f = fixture()
  const controller = createThirdPerson(f)
  const before = controller.viewState

  assert.equal(controller.addZoomDelta(100), true)
  const requested = controller.viewState
  assert.ok(requested.requestedDistance > before.requestedDistance)
  assert.ok(Math.abs(requested.actualDistance - before.actualDistance) < 1e-6, 'wheel intent should not pop the physical camera')

  controller.plugin.update(.016, f.context)
  const after = controller.viewState
  assert.ok(after.actualDistance > before.actualDistance)
  assert.ok(after.actualDistance < after.requestedDistance)
  controller.plugin.teardown()
})

test('camera damping converges consistently across different frame rates', () => {
  const thirty = fixture()
  const sixty = fixture()
  const a = createThirdPerson(thirty)
  const b = createThirdPerson(sixty)
  a.addZoomDelta(100)
  b.addZoomDelta(100)
  for (let index = 0; index < 30; index += 1) a.plugin.update(1 / 30, thirty.context)
  for (let index = 0; index < 60; index += 1) b.plugin.update(1 / 60, sixty.context)
  assert.ok(Math.abs(a.viewState.actualDistance - b.viewState.actualDistance) < 1e-9)
  a.plugin.teardown()
  b.plugin.teardown()
})

test('camera obstruction entry is immediate and recovery eases outward after the wall clears', () => {
  const f = fixture()
  const controller = createThirdPerson(f)
  assert.ok(controller.viewState.actualDistance > 3.9)

  f.wall.enabled = true
  controller.plugin.update(.016, f.context)
  const blocked = controller.viewState.actualDistance
  assert.ok(blocked < 2, `camera should clamp inside the obstruction immediately, got ${blocked}`)

  f.wall.enabled = false
  controller.plugin.update(.016, f.context)
  const recovering = controller.viewState.actualDistance
  assert.ok(recovering > blocked, 'camera should begin recovering after the obstruction clears')
  assert.ok(recovering < 4, 'camera recovery should not pop directly back to full distance')

  for (let index = 0; index < 90; index += 1) controller.plugin.update(1 / 60, f.context)
  assert.ok(controller.viewState.actualDistance > 3.99)
  controller.plugin.teardown()
})

test('smoothing false preserves the legacy immediate third-person zoom response', () => {
  const f = fixture()
  const controller = createThirdPerson(f, { smoothing: false })
  const before = controller.viewState.actualDistance
  controller.addZoomDelta(100)
  const after = controller.viewState
  assert.ok(after.actualDistance > before)
  assert.ok(Math.abs(after.actualDistance - after.requestedDistance) < 1e-6)
  controller.plugin.teardown()
})

test('third-person smoothing responses reject non-positive or non-finite values', () => {
  const f = fixture()
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  controller.setCharacterAnchor({ character: 'hero' })
  assert.throws(
    () => controller.setThirdPersonCamera({ smoothing: { verticalTargetResponse: 0 } }),
    /verticalTargetResponse must be a positive finite number/,
  )
  assert.throws(
    () => controller.setThirdPersonCamera({ smoothing: { zoomResponse: Number.NaN } }),
    /zoomResponse must be a positive finite number/,
  )
  controller.plugin.teardown()
})
