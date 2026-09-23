import test from 'node:test'
import assert from 'node:assert/strict'
import { PlayerCameraController } from '../dist/internal/PlayerCameraController.js'

function fixture() {
  let position = [0, 1.65, 0]
  let rotation = [0, 0]
  let projection = { type: 'perspective', fieldOfView: 60, near: .1, far: 1000 }
  const listeners = new Map()
  const canvasListeners = new Map()
  const ownerDocument = { activeElement: null }
  const canvas = {
    tabIndex: -1, ownerDocument,
    addEventListener(type, listener) {
      let bucket = canvasListeners.get(type)
      if (!bucket) canvasListeners.set(type, bucket = new Set())
      bucket.add(listener)
    },
    removeEventListener(type, listener) { canvasListeners.get(type)?.delete(listener) },
    dispatch(type, properties = {}) {
      const event = {
        type, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, code: '', deltaY: 0,
        preventDefault() {}, stopImmediatePropagation() {}, ...properties,
      }
      for (const listener of [...(canvasListeners.get(type) || [])]) listener(event)
      return event
    },
    focus() { ownerDocument.activeElement = canvas; canvas.dispatch('focus') },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false },
  }
  const exploration = {
    bind(controller) { this.controller = controller; return () => { this.controller = null } },
  }
  const world = {
    exploration,
    xr: { state: 'idle' },
    on(name, listener) { listeners.set(name, listener); return () => listeners.delete(name) },
    emit() {}, setCurrentRoom() {},
  }
  const camera = {
    getPosition: () => [...position], setPosition: value => { position = [...value] },
    getRotation: () => [...rotation], setRotation: (yaw, pitch) => { rotation = [yaw, pitch] },
    getForward() { const c = Math.cos(rotation[1]); return [-Math.sin(rotation[0]) * c, Math.sin(rotation[1]), -Math.cos(rotation[0]) * c] },
    getRight() { return [Math.cos(rotation[0]), 0, -Math.sin(rotation[0])] },
    getProjection: () => ({ ...projection }),
    setProjection: value => { projection = { ...value } },
  }
  const context = {
    renderer: { canvas, camera }, world,
    document: { exploration: { height: 1.75, eyeHeight: 1.65, radius: .3, stepHeight: .32, gravity: 9.81 } },
    compiled: { rooms: [], colliders: [{ id: 'ground', enabled: true, kind: 'floor', bounds: { min: [-50,-.2,-50], max: [50,0,50] } }] },
    transforms: {}, query: {},
  }
  return { context, camera, canvas, get position() { return position }, get rotation() { return rotation }, get projection() { return projection } }
}

test('inspection camera supports orbit, top, free, and restored explore pose', () => {
  const f = fixture()
  const changes = []
  const controller = new PlayerCameraController({ browserInput: false }, {}, { onModeChange: (previous, mode) => changes.push([previous, mode]) })
  controller.plugin.setup(f.context)
  controller.setInputEnabled(true)
  controller.setMode('orbit', { bounds: { min: [-10,0,-5], max: [10,20,5] } })
  assert.equal(controller.mode, 'orbit')
  assert.ok(f.position[1] > 0)
  controller.setMode('top', { target: [0,0,0], radius: 20, northUp: true })
  assert.equal(controller.mode, 'top')
  assert.ok(f.position[1] >= 50)
  assert.ok(f.rotation[1] < -1.5)
  assert.equal(f.projection.type, 'orthographic')
  const topY = f.position[1]
  const topScale = f.projection.verticalSize
  f.canvas.dispatch('wheel', { deltaY: -120 })
  assert.equal(f.position[1], topY)
  assert.ok(f.projection.verticalSize < topScale)
  controller.setMode('free', { speed: 30 })
  assert.equal(controller.mode, 'free')
  assert.equal(f.projection.type, 'perspective')
  controller.setMode('explore')
  assert.equal(controller.mode, 'explore')
  assert.deepEqual(changes.map(change => change[1]), ['orbit','top','free','explore'])
  controller.plugin.teardown()
})

test('teleport resets motion and fall recovery returns to verified support once', () => {
  const f = fixture()
  const states = []
  const controller = new PlayerCameraController({ browserInput: false }, { minimumY: -5, maxAttempts: 2, cooldownMs: 250 }, { onRecoveryChange: status => states.push(status.state) })
  controller.plugin.setup(f.context)
  controller.setEnabled(true)
  controller.setInputEnabled(true)
  controller.teleport({ position: [2,1.65,2], rotation: [.3,-.1], resetMotion: true })
  assert.deepEqual(f.position, [2,1.65,2])
  controller.teleport({ position: [2,-20,2], rotation: [.3,-.1], resetMotion: true })
  controller.plugin.update(.016, f.context)
  assert.ok(f.position[1] >= 1.64)
  assert.deepEqual(states, ['recovering','recovered'])
  controller.plugin.teardown()
})


test('inspection input survives rejected pointer capture and free mode owns focused keyboard controls', () => {
  const f = fixture()
  const controller = new PlayerCameraController({ browserInput: false }, false)
  controller.plugin.setup(f.context)
  f.canvas.setPointerCapture = () => { throw new DOMException('inactive pointer', 'InvalidStateError') }

  controller.setMode('orbit', { target: [0, 0, 0], distance: 20 })
  const beforeRotation = [...f.rotation]
  assert.doesNotThrow(() => f.canvas.dispatch('pointerdown', { pointerId: 7, clientX: 10, clientY: 10 }))
  f.canvas.dispatch('pointermove', { pointerId: 7, clientX: 40, clientY: 25 })
  f.canvas.dispatch('pointerup', { pointerId: 7, clientX: 40, clientY: 25 })
  assert.notDeepEqual(f.rotation, beforeRotation)

  controller.setMode('free', { speed: 10 })
  assert.equal(f.canvas.ownerDocument.activeElement, f.canvas)
  const beforePosition = [...f.position]
  f.canvas.dispatch('keydown', { code: 'KeyW' })
  controller.plugin.update(1, f.context)
  f.canvas.dispatch('keyup', { code: 'KeyW' })
  assert.notDeepEqual(f.position, beforePosition)
  controller.plugin.teardown()
})
