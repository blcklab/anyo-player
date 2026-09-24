import test from 'node:test'
import assert from 'node:assert/strict'
import { PlayerCameraController } from '../dist/internal/PlayerCameraController.js'

const closeTo = (actual, expected, epsilon = 1e-9) => Math.abs(actual - expected) <= epsilon

function fixture() {
  let position = [0, 1.65, 0]
  let rotation = [0, 0]
  let projection = { type: 'perspective', fieldOfView: 60, near: .1, far: 1000 }
  const listeners = new Map()
  const camera = {
    getPosition: () => [...position],
    setPosition: value => { position = [...value] },
    getRotation: () => [...rotation],
    setRotation: (yaw, pitch) => { rotation = [yaw, pitch] },
    getForward() { const c = Math.cos(rotation[1]); return [-Math.sin(rotation[0]) * c, Math.sin(rotation[1]), -Math.cos(rotation[0]) * c] },
    getRight() { return [Math.cos(rotation[0]), 0, -Math.sin(rotation[0])] },
    getProjection: () => ({ ...projection }),
    setProjection: value => { projection = { ...value } },
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
  const hero = { id: 'hero' }
  const context = {
    renderer: { canvas, camera }, world,
    document: { exploration: { height: 1.75, eyeHeight: 1.65, radius: .3, stepHeight: .32, gravity: 9.81, walkSpeed: 3.2, runSpeed: 5.5 } },
    compiled: {
      rooms: [],
      colliders: [
        { id: 'ground', entityId: 'ground', enabled: true, kind: 'floor', bounds: { min: [-50, -.2, -50], max: [50, 0, 50] } },
      ],
      entityById: new Map([['hero', hero]]),
      entityByAuthoringId: new Map(),
    },
    transforms: { set() {}, clear() {} },
    query: {},
  }
  return {
    context,
    get projection() { return projection },
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

test('P2 supports independent X/Y sensitivity and horizontal/vertical inversion', () => {
  const f = fixture()
  const controller = createThirdPerson(f, {
    orbit: { sensitivityX: 2, sensitivityY: .5, invertX: true, invertY: true },
  })
  controller.beginPointerLook(2)
  controller.addLookDelta(10, 10)
  const view = controller.viewState
  assert.ok(closeTo(view.yaw, .044), `expected inverted X yaw 0.044, got ${view.yaw}`)
  assert.ok(closeTo(view.pitch, .011), `expected inverted Y pitch 0.011, got ${view.pitch}`)
  controller.endPointerLook(2)
  controller.plugin.teardown()
})

test('P2 semantic shoulder switching preserves magnitude and supports center', () => {
  const f = fixture()
  const controller = createThirdPerson(f, {
    shoulderSide: 'right',
    shoulderOffset: .5,
    smoothing: false,
  })
  assert.equal(controller.viewState.shoulderSide, 'right')
  assert.ok(closeTo(controller.viewState.shoulderOffset, .5))
  assert.ok(closeTo(controller.viewState.camera[0], .5))

  assert.equal(controller.swapThirdPersonShoulder(), 'left')
  assert.equal(controller.viewState.shoulderSide, 'left')
  assert.ok(closeTo(controller.viewState.shoulderOffset, -.5))
  assert.ok(closeTo(controller.viewState.camera[0], -.5))

  controller.setThirdPersonShoulder('center')
  assert.equal(controller.viewState.shoulderSide, 'center')
  assert.ok(closeTo(controller.viewState.shoulderOffset, 0))

  controller.setThirdPersonShoulder('right')
  assert.ok(closeTo(controller.viewState.shoulderOffset, .5), 'center should preserve the configured shoulder magnitude')
  controller.plugin.teardown()
})

test('P2 shoulder switching is frame-rate-independent and smooth with default camera smoothing', () => {
  const f = fixture()
  const controller = createThirdPerson(f, { shoulderSide: 'right', shoulderOffset: .6 })
  controller.swapThirdPersonShoulder()
  assert.ok(closeTo(controller.viewState.shoulderOffset, .6), 'requested shoulder changes should not pop the physical camera')
  controller.plugin.update(1 / 60, f.context)
  const moving = controller.viewState.shoulderOffset
  assert.ok(moving < .6 && moving > -.6, `shoulder should be transitioning, got ${moving}`)
  for (let index = 0; index < 90; index += 1) controller.plugin.update(1 / 60, f.context)
  assert.ok(controller.viewState.shoulderOffset < -.599)
  controller.plugin.teardown()
})

test('P2 exposes a renderer-neutral close-camera character visibility signal', () => {
  const f = fixture()
  const controller = createThirdPerson(f, {
    distance: 1,
    orbit: false,
    collision: false,
    smoothing: false,
    characterVisibility: { hiddenDistance: .5, fadeStartDistance: 1.5 },
  })
  assert.ok(closeTo(controller.viewState.actualDistance, 1))
  assert.ok(closeTo(controller.viewState.characterVisibility, .5), `expected half visibility at one metre, got ${controller.viewState.characterVisibility}`)

  controller.setThirdPersonCamera({ distance: .4, orbit: false, collision: false, smoothing: false })
  assert.equal(controller.viewState.characterVisibility, 0)

  controller.setThirdPersonCamera({ distance: 1, orbit: false, collision: false, smoothing: false, characterVisibility: false })
  assert.equal(controller.viewState.characterVisibility, 1)
  controller.plugin.teardown()
})

test('P3 dynamic FOV widens only above walk speed and damps back to the base FOV', () => {
  const f = fixture()
  const controller = createThirdPerson(f, { dynamicFieldOfView: { maxBoost: 6, response: 7 } })
  assert.ok(closeTo(f.projection.fieldOfView, 60))

  controller.setMoveAxes(0, 1)
  controller.plugin.update(.1, f.context)
  assert.ok(closeTo(f.projection.fieldOfView, 60), 'walking at configured walk speed should not widen FOV')

  controller.setRun(true)
  controller.plugin.update(.1, f.context)
  assert.ok(f.projection.fieldOfView > 60 && f.projection.fieldOfView < 66, `run FOV should ease toward 66, got ${f.projection.fieldOfView}`)
  for (let index = 0; index < 90; index += 1) controller.plugin.update(1 / 60, f.context)
  assert.ok(f.projection.fieldOfView > 65.99)

  controller.setMoveAxes(0, 0)
  controller.setRun(false)
  for (let index = 0; index < 90; index += 1) controller.plugin.update(1 / 60, f.context)
  assert.ok(Math.abs(f.projection.fieldOfView - 60) < .01, `idle FOV should return to base, got ${f.projection.fieldOfView}`)
  controller.plugin.teardown()
})

test('P3 dynamic FOV respects runtime base-FOV changes and restores base when third person is disabled', () => {
  const f = fixture()
  const controller = createThirdPerson(f, { dynamicFieldOfView: true })
  controller.setFieldOfView(75)
  assert.ok(closeTo(f.projection.fieldOfView, 75))

  controller.setMoveAxes(0, 1)
  controller.setRun(true)
  for (let index = 0; index < 60; index += 1) controller.plugin.update(1 / 60, f.context)
  assert.ok(f.projection.fieldOfView > 79.9, `run FOV should use updated 75-degree base, got ${f.projection.fieldOfView}`)

  controller.setThirdPersonCamera(false)
  assert.ok(closeTo(f.projection.fieldOfView, 75), `disabling third person should restore the base FOV, got ${f.projection.fieldOfView}`)
  controller.plugin.teardown()
})

test('P2/P3 option validation rejects unsafe camera configuration', () => {
  const f = fixture()
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  controller.setCharacterAnchor({ character: 'hero' })

  assert.throws(
    () => controller.setThirdPersonCamera({ orbit: { sensitivityX: 0 } }),
    /sensitivityX must be a positive finite number/,
  )
  assert.throws(
    () => controller.setThirdPersonCamera({ characterVisibility: { hiddenDistance: 1, fadeStartDistance: .5 } }),
    /fadeStartDistance must be finite and greater than hiddenDistance/,
  )
  assert.throws(
    () => controller.setThirdPersonCamera({ dynamicFieldOfView: { response: 0 } }),
    /dynamic FOV response must be a positive finite number/,
  )
  controller.setThirdPersonCamera({ orbit: true })
  assert.throws(() => controller.setThirdPersonShoulder('right', -1), /non-negative finite number/)
  controller.plugin.teardown()
})
