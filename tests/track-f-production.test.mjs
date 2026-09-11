import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import { SourceResolver } from '../dist/internal/SourceResolver.js'
import { FakeContainer, FakeRuntimeFactory, FakeWorld } from './helpers.mjs'

function largeWorld(count = 10_000) {
  return {
    version: '0.7', revision: 1,
    materials: { shared: { baseColor: '#8899aa' } },
    entities: Array.from({ length: count }, (_, index) => ({ id: `e-${index}`, type: 'box', material: 'shared', position: [index % 100, 0, -Math.floor(index / 100)] })),
  }
}

test('source resolution accepts a 10,000-entity world within the production budget', async () => {
  const document = largeWorld(10_000)
  const json = JSON.stringify(document)
  const resolver = new SourceResolver({ loading: { maxDocumentBytes: Buffer.byteLength(json) + 1024 } })
  const resolved = await resolver.resolve({ json }, new AbortController().signal)
  assert.equal(resolved.document.version, '0.7')
  assert.equal(resolved.document.entities.length, 10_000)
  assert.equal(resolved.info.bytes, Buffer.byteLength(json))
})

test('repeated Player generations release runtime ownership cleanly', async () => {
  const worlds = Array.from({ length: 40 }, () => new FakeWorld())
  const factory = new FakeRuntimeFactory(worlds)
  for (let index = 0; index < 40; index += 1) {
    const source = { version: '0.7', revision: index, entities: [{ id: `e-${index}`, type: 'box' }] }
    const player = new AnyoPlayerCore({ container: new FakeContainer(), source, ui: false }, {
      runtimeFactory: factory,
      sourceResolver: { async resolve(input) { return { document: structuredClone(input), info: { kind: 'document', url: null, bytes: null, cache: 'none', integrity: 'not-requested', migratedFrom: null, documentVersion: input.version } } } },
    })
    await player.load()
    assert.equal(player.state, 'ready')
    await player.disposeAsync()
    assert.equal(player.state, 'disposed')
  }
  assert.equal(factory.created.length, 40)
  assert.ok(worlds.every(world => world.disposed))
})

test('diagnostic bundles distinguish runtime evidence from physical-device evidence', async () => {
  const source = { version: '0.7', revision: 1, metadata: { id: 'track-f' } }
  const player = new AnyoPlayerCore({ container: new FakeContainer(), source, ui: false }, {
    runtimeFactory: new FakeRuntimeFactory([new FakeWorld()]),
    sourceResolver: { async resolve(input) { return { document: structuredClone(input), info: { kind: 'document', url: null, bytes: null, cache: 'none', integrity: 'not-requested', migratedFrom: null, documentVersion: input.version } } } },
  })
  await player.load()
  const bundle = player.createDiagnosticBundle()
  assert.equal(bundle.format, '@blcklab/anyo-player/diagnostic-bundle')
  assert.equal(bundle.runtime.lifecycle.state, 'ready')
  assert.equal(typeof bundle.documentHash, 'string')
  assert.equal(bundle.source.kind, 'document')
  await player.disposeAsync()
})
