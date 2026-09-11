import test from 'node:test'
import assert from 'node:assert/strict'
import { SourceResolver } from '../dist/internal/SourceResolver.js'

const world = {
  version: '0.6',
  assets: {
    model: { type: 'model', format: 'glb', src: './models/store.glb', lod: [{ distance: 20, src: './models/store-low.glb' }] },
    texture: { type: 'texture', format: 'png', src: '../textures/wall.png' },
  },
  prefabs: {
    product: { type: 'model', src: './models/product.glb' },
  },
  building: {
    floors: [{ id: 'ground', elevation: 0, rooms: [{ id: 'room', size: [5, 5], entities: [{ id: 'room-image', type: 'image', src: './images/room.png' }] }] }],
  },
  entities: [{
    id: 'screen',
    type: 'web-surface',
    src: './images/direct.png',
    audio: { src: './audio/ambient.ogg' },
    lod: [{ distance: 30, src: './models/lod.glb' }],
    components: [{ type: 'vendor.component', src: './components/data.json', levels: [{ src: './components/low.json' }] }],
    webSurface: {
      source: { type: 'snapshot', image: './images/screen.png', href: './product' },
      fallback: { type: 'snapshot', image: './images/fallback.png', href: './fallback' },
    },
  }],
}

test('resolves object and inline JSON sources', async () => {
  const resolver = new SourceResolver()
  const signal = new AbortController().signal
  const objectResult = await resolver.resolve(world, signal)
  const jsonResult = await resolver.resolve(JSON.stringify(world), signal)
  assert.equal(objectResult.document.version, '0.7')
  assert.equal(jsonResult.document.version, '0.7')
  assert.equal(objectResult.document.revision, 0)
  assert.equal(objectResult.info.migratedFrom, '0.6')
  assert.notEqual(objectResult.document, world)
})

test('fetches URL sources abortably and preserves relative Anyo resources', async () => {
  let requestUrl
  const resolver = new SourceResolver({
    baseUrl: 'https://example.com/app/',
    fetch: async (url, init) => {
      requestUrl = String(url)
      assert(init.signal instanceof AbortSignal)
      return new Response(JSON.stringify(world), { status: 200 })
    },
  })
  const result = await resolver.resolve('./worlds/store.anyo.json', new AbortController().signal)
  assert.equal(requestUrl, 'https://example.com/app/worlds/store.anyo.json')
  assert.equal(result.documentUrl, requestUrl)
  assert.equal(result.document.assets.model.src, 'https://example.com/app/worlds/models/store.glb')
  assert.equal(result.document.assets.model.lod[0].src, 'https://example.com/app/worlds/models/store-low.glb')
  assert.equal(result.document.assets.texture.src, 'https://example.com/app/textures/wall.png')
  assert.equal(result.document.prefabs.product.src, 'https://example.com/app/worlds/models/product.glb')
  assert.equal(result.document.building.floors[0].rooms[0].entities[0].src, 'https://example.com/app/worlds/images/room.png')
  assert.equal(result.document.entities[0].audio.src, 'https://example.com/app/worlds/audio/ambient.ogg')
  assert.equal(result.document.entities[0].components[0].src, 'https://example.com/app/worlds/components/data.json')
  assert.equal(result.document.entities[0].webSurface.source.image, 'https://example.com/app/worlds/images/screen.png')
})


test('invokes fetch with the global receiver required by browser Window.fetch', async () => {
  let receiver
  const resolver = new SourceResolver({
    baseUrl: 'https://example.com/',
    fetch: function (_url, init) {
      receiver = this
      assert(init.signal instanceof AbortSignal)
      return Promise.resolve(new Response(JSON.stringify(world), { status: 200 }))
    },
  })
  await resolver.resolve('/world.anyo.json', new AbortController().signal)
  assert.equal(receiver, globalThis)
})

test('aborts an in-flight URL fetch', async () => {
  const controller = new AbortController()
  const resolver = new SourceResolver({
    baseUrl: 'https://example.com/',
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }),
  })
  const pending = resolver.resolve('/world.anyo.json', controller.signal)
  controller.abort('test')
  await assert.rejects(pending, error => {
    assert.equal(error.code, 'PLAYER_FETCH_ABORTED')
    return true
  })
})

test('invalid baseUrl uses the typed player error model', () => {
  assert.throws(() => new SourceResolver({ baseUrl: 'relative-without-runtime-base' }), error => {
    assert.equal(error.code, 'PLAYER_INVALID_SOURCE')
    return true
  })
})
