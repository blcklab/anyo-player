import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { FakeContainer, FakeRuntimeFactory, FakeWorld, StaticSourceResolver } from './helpers.mjs'

test('runtime report summarizes lifecycle, world, renderer, input, assets, and recovery', async () => {
  const world = new FakeWorld({ currentRoom: 'street' })
  world.document = { version: '0.6' }
  world.compiled.rooms = [{ roomId: 'street' }]
  world.compiled.entities = [{ id: 'house' }]
  world.compiled.primitives = [{ id: 'wall' }, { id: 'roof' }]
  world.compiled.materials = [{ id: 'plaster' }]
  world.compiled.colliders = [{ id: 'street-floor' }]
  world.compiled.portals = []
  world.compiled.triggers = []
  const factory = new FakeRuntimeFactory([world])
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source: { version: '0.6' } }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver({ version: '0.6' }),
  })

  await player.load()
  factory.created[0].renderer.info = {
    name: 'sekai64',
    version: '0.8.0-test',
    capabilities: { backend: 'webgpu', shadows: true, atmosphere: true, colorGrading: true },
  }
  const report = player.createRuntimeReport()
  assert.equal(report.format, '@blcklab/anyo-player/runtime-report')
  assert.equal(report.lifecycle.state, 'ready')
  assert.equal(report.world.currentRoom, 'street')
  assert.equal(report.world.primitives, 2)
  assert.equal(report.renderer.backend, 'webgpu')
  assert.equal(report.renderer.atmosphere, true)
  assert.equal(report.assets.ratio, 1)
  await player.disposeAsync()
})

test('resetToSpawn restores authored exploration spawn', async () => {
  const world = new FakeWorld({ cameraPosition: [9, 9, 9] })
  const source = {
    version: '0.6',
    exploration: { spawn: { room: 'street', position: [2, 1.7, 4] }, eyeHeight: 1.7 },
  }
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source }, {
    runtimeFactory: new FakeRuntimeFactory([world]),
    sourceResolver: new StaticSourceResolver(source),
  })
  await player.load()
  player.resetToSpawn()
  assert.deepEqual(world.cameraPosition, [2, 1.7, 4])
  assert.equal(world.currentRoom, 'street')
  await player.disposeAsync()
})
