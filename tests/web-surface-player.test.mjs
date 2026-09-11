import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebSurfaceAppRegistry } from '@blcklab/anyo/web-surface'
import { AnyoPlayerCore } from '../dist/internal/AnyoPlayerCore.js'
import {
  FakeContainer,
  FakeRuntimeFactory,
  FakeWorld,
  StaticSourceResolver,
} from './helpers.mjs'

const source = { version: '0.6' }

test('Player enables Web Surface presentation by default with an isolated registry', async () => {
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const app = { mount() { return { dispose() {} } } }
  const overlayRoot = new FakeContainer()
  const externalUrls = { allowedOrigins: ['https://docs.example.com'], sandbox: ['allow-forms'] }
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    webSurface: {
      apps: { dashboard: app },
      root: overlayRoot,
      zIndex: 37,
      externalUrls,
    },
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(source),
  })

  assert.ok(player.webSurfaceRegistry)
  assert.equal(player.webSurfaceRegistry.has('dashboard'), true)

  await player.load()
  assert.equal(factory.created[0].options.webSurface.registry, player.webSurfaceRegistry)
  assert.equal(factory.created[0].options.webSurface.root, overlayRoot)
  assert.equal(factory.created[0].options.webSurface.zIndex, 37)
  assert.equal(factory.created[0].options.webSurface.externalUrls, externalUrls)
  assert.equal(typeof factory.created[0].options.webSurface.onDiagnostic, 'function')

  const registry = player.webSurfaceRegistry
  await player.disposeAsync()
  assert.equal(registry.has('dashboard'), false)
})

test('Player reuses a host registry and does not clear unrelated applications', async () => {
  const registry = createWebSurfaceAppRegistry()
  const hostApp = { mount() { return { dispose() {} } } }
  registry.register('host-app', hostApp)

  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    webSurface: {
      registry,
      apps: {
        playerApp: { mount() { return { dispose() {} } } },
      },
    },
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(source),
  })

  assert.equal(player.webSurfaceRegistry, registry)
  assert.equal(registry.has('host-app'), true)
  assert.equal(registry.has('playerApp'), true)

  await player.load()
  await player.disposeAsync()
  assert.equal(registry.has('host-app'), true)
  assert.equal(registry.has('playerApp'), false)
})

test('Web Surface can be explicitly disabled without changing the Player runtime contract', async () => {
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    webSurface: false,
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(source),
  })

  assert.equal(player.webSurfaceRegistry, null)
  await player.load()
  assert.equal(factory.created[0].options.webSurface, false)
  await player.disposeAsync()
})

test('Web Surface diagnostics enter bounded Player diagnostics and never break a frame', async () => {
  const warnings = []
  const callbackDiagnostics = []
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    onWarning: message => warnings.push(message),
    webSurface: {
      onDiagnostic(diagnostic) {
        callbackDiagnostics.push(diagnostic)
        throw new Error('host callback failed')
      },
    },
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(source),
  })

  await player.load()
  const report = factory.created[0].options.webSurface.onDiagnostic
  assert.doesNotThrow(() => report({
    severity: 'warning',
    code: 'WEB_SURFACE_TEST',
    message: 'Surface hidden safely.',
    entityId: 'screen',
    primitiveId: 'screen:surface',
  }))

  assert.equal(callbackDiagnostics.length, 1)
  assert.equal(player.diagnostics.at(-1).code, 'WEB_SURFACE_TEST')
  assert.equal(player.diagnostics.at(-1).severity, 'warning')
  assert.equal(warnings.some(message => message.includes('WEB_SURFACE_TEST')), true)
  assert.equal(warnings.some(message => message.includes('callback failed')), true)
  await player.disposeAsync()
})

test('duplicate convenience registrations roll back without mutating a host registry', () => {
  const registry = createWebSurfaceAppRegistry()
  const existing = { mount() { return { dispose() {} } } }
  registry.register('duplicate', existing)

  assert.throws(() => new AnyoPlayerCore({
    container: new FakeContainer(),
    webSurface: {
      registry,
      apps: {
        temporary: { mount() { return { dispose() {} } } },
        duplicate: { mount() { return { dispose() {} } } },
      },
    },
  }), /already registered/)

  assert.equal(registry.has('temporary'), false)
  assert.equal(registry.get('duplicate'), existing)
})


test('Player forwards a defensive copy of trusted host plugins to each runtime', async () => {
  const hostPlugin = { name: 'host:texture-surface' }
  const configured = [hostPlugin]
  const factory = new FakeRuntimeFactory([new FakeWorld()])
  const player = new AnyoPlayerCore({
    container: new FakeContainer(),
    source,
    plugins: configured,
    webSurface: false,
  }, {
    runtimeFactory: factory,
    sourceResolver: new StaticSourceResolver(source),
  })

  await player.load()
  assert.deepEqual(factory.created[0].options.plugins, [hostPlugin])
  assert.notEqual(factory.created[0].options.plugins, configured)
  configured.length = 0
  assert.deepEqual(factory.created[0].options.plugins, [hostPlugin])
  await player.disposeAsync()
})
