import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayer, useAnyoPlayer } from '../dist/vue.js'

test('Vue adapter exports a component and composable', () => {
  assert.equal(typeof AnyoPlayer, 'object')
  assert.equal(AnyoPlayer.name, 'AnyoPlayer')
  assert.equal(typeof useAnyoPlayer, 'function')
})

test('Vue component exposes lifecycle methods and renders an isolated host', () => {
  let exposed
  const emitted = []
  const render = AnyoPlayer.setup({
    source: null,
    options: {},
    tag: 'section',
    pauseOnDeactivated: true,
  }, {
    attrs: { id: 'world-player', class: 'embed' },
    emit: (...args) => emitted.push(args),
    expose: value => { exposed = value },
  })
  const vnode = render()
  assert.equal(vnode.type, 'section')
  assert.equal(vnode.props.id, 'world-player')
  assert.equal(vnode.props['data-anyo-player-vue'], '')
  assert.equal(typeof exposed.load, 'function')
  assert.equal(typeof exposed.activate, 'function')
  assert.equal(typeof exposed.replaceWorld, 'function')
  assert.equal(typeof exposed.disposeAsync, 'function')
  assert.equal(exposed.player.value, null)
  assert.deepEqual(emitted, [])
})
