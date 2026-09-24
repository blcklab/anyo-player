import test from 'node:test'
import assert from 'node:assert/strict'
import { PlayerCameraController } from '../dist/internal/PlayerCameraController.js'

function fixture() {
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
  const hero = { id: 'hero' }
  const transformWrites = []
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
    transforms: {
      set(...args) { transformWrites.push(args) },
      clear() {},
    },
    query: {},
  }
  return { context, transformWrites }
}

function createThirdPerson(f, orbit = true) {
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  controller.setEnabled(true)
  controller.setInputEnabled(true)
  controller.setCharacterAnchor({ character: 'hero' })
  controller.setThirdPersonCamera({ distance: 4, orbit })
  return controller
}

function latestAnchorYaw(f) {
  const write = f.transformWrites.at(-1)
  return write?.[1]?.rotation?.[1]
}

test('default MMORPG controls reserve RMB for authoritative orbit and LMB for visual free-look', () => {
  const f = fixture()
  const controller = createThirdPerson(f)
  assert.equal(controller.usesPointerLookButton(2), true)
  assert.equal(controller.usesPointerLookButton(0), true)
  assert.equal(controller.usesPointerLookButton(1), false)
  controller.plugin.teardown()
})

test('LMB free-look rotates the camera without changing authoritative character or movement yaw', () => {
  const f = fixture()
  const controller = createThirdPerson(f)
  const initialYaw = latestAnchorYaw(f)
  assert.equal(initialYaw, 0)

  assert.equal(controller.beginPointerLook(0), true)
  controller.addLookDelta(100, -20)
  const freeLook = controller.viewState
  assert.notEqual(freeLook.yaw, 0, 'visual camera yaw should change during LMB free-look')
  assert.equal(latestAnchorYaw(f), initialYaw, 'character yaw must remain authoritative during LMB free-look')

  controller.setMoveAxes(0, 1)
  controller.plugin.update(.1, f.context)
  controller.setMoveAxes(0, 0)
  const moved = controller.viewState.feet
  assert.ok(moved[2] < -0.25, `forward movement should keep the authoritative yaw, got z=${moved[2]}`)
  assert.ok(Math.abs(moved[0]) < .05, `free-look must not redirect forward movement, got x=${moved[0]}`)

  controller.endPointerLook(0)
  controller.plugin.teardown()
})

test('RMB authoritative orbit claims the current free-look heading and continues rotating character/movement yaw', () => {
  const f = fixture()
  const controller = createThirdPerson(f)

  controller.beginPointerLook(0)
  controller.addLookDelta(100, 0)
  const visualYaw = controller.viewState.yaw
  controller.endPointerLook(0)
  assert.equal(latestAnchorYaw(f), 0)

  assert.equal(controller.beginPointerLook(2), true)
  assert.ok(Math.abs(latestAnchorYaw(f) - visualYaw) < 1e-12, 'RMB should claim the current camera heading as authoritative yaw')
  controller.addLookDelta(50, 0)
  assert.ok(Math.abs(latestAnchorYaw(f) - controller.viewState.yaw) < 1e-12, 'RMB drag should keep character yaw coupled to camera yaw')
  controller.endPointerLook(2)
  controller.plugin.teardown()
})


test('RMB authoritative orbit takes precedence when LMB and RMB are held together', () => {
  const f = fixture()
  const controller = createThirdPerson(f)

  controller.beginPointerLook(0)
  controller.beginPointerLook(2)
  controller.addLookDelta(80, 0)
  assert.ok(Math.abs(latestAnchorYaw(f) - controller.viewState.yaw) < 1e-12, 'RMB must remain authoritative while both buttons are held')

  controller.endPointerLook(2)
  const authoritativeYaw = latestAnchorYaw(f)
  controller.addLookDelta(80, 0)
  assert.notEqual(controller.viewState.yaw, authoritativeYaw, 'remaining LMB should return to visual free-look')
  assert.ok(Math.abs(latestAnchorYaw(f) - authoritativeYaw) < 1e-12, 'character yaw must stop following after RMB is released')

  controller.endPointerLook(0)
  controller.plugin.teardown()
})

test('free-look can be disabled and legacy LMB-authoritative orbit remains compatible', () => {
  const disabled = fixture()
  const a = createThirdPerson(disabled, { freeLookButton: false })
  assert.equal(a.usesPointerLookButton(0), false)
  assert.equal(a.usesPointerLookButton(2), true)
  a.plugin.teardown()

  const legacy = fixture()
  const b = createThirdPerson(legacy, { button: 0 })
  assert.equal(b.usesPointerLookButton(0), true)
  assert.equal(b.usesPointerLookButton(2), false)
  b.plugin.teardown()
})

test('free-look and authoritative orbit cannot use the same explicit mouse button', () => {
  const f = fixture()
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  controller.setCharacterAnchor({ character: 'hero' })
  assert.throws(
    () => controller.setThirdPersonCamera({ orbit: { button: 2, freeLookButton: 2 } }),
    /free-look button must differ from the authoritative orbit button/,
  )
  controller.plugin.teardown()
})
