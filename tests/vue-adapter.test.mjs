import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { AnyoPlayer, useAnyoPlayer } from '../dist/vue.js'

test('Vue adapter exports a component and composable', () => {
  assert.equal(typeof AnyoPlayer, 'object')
  assert.equal(AnyoPlayer.name, 'AnyoPlayer')
  assert.equal(typeof useAnyoPlayer, 'function')
})

test('Vue composable exposes lifecycle methods inside component setup', async () => {
  let api

  const Harness = defineComponent({
    name: 'AnyoPlayerComposableHarness',
    setup() {
      api = useAnyoPlayer({ source: null })
      return () => h('div', { 'data-anyo-player-vue-harness': '' })
    },
  })

  const app = createSSRApp(Harness)
  const warnings = []
  app.config.warnHandler = message => warnings.push(message)
  const html = await renderToString(app)

  assert.match(html, /^<div\b/)
  assert.match(html, /\bdata-anyo-player-vue-harness\b/)
  assert.ok(api)
  assert.equal(typeof api.load, 'function')
  assert.equal(typeof api.activate, 'function')
  assert.equal(typeof api.replaceWorld, 'function')
  assert.equal(typeof api.disposeAsync, 'function')
  assert.equal(api.player.value, null)
  assert.deepEqual(warnings, [])
})

test('Vue component renders an isolated host through a real Vue instance', async () => {
  const App = defineComponent({
    setup() {
      return () => h(AnyoPlayer, {
        id: 'world-player',
        class: 'embed',
        source: null,
        options: {},
        tag: 'section',
        pauseOnDeactivated: true,
      })
    },
  })

  const app = createSSRApp(App)
  const warnings = []
  app.config.warnHandler = message => warnings.push(message)
  const html = await renderToString(app)

  assert.match(html, /^<section\b/)
  assert.match(html, /\bid="world-player"/)
  assert.match(html, /\bclass="embed"/)
  assert.match(html, /\bdata-anyo-player-vue\b/)
  assert.deepEqual(warnings, [])
})
