import test from 'node:test'
import assert from 'node:assert/strict'
import { AnyoPlayer, useAnyoPlayer } from '../dist/react.js'

test('React adapter exports a forward-ref component and hook', () => {
  assert.ok(typeof AnyoPlayer === 'function' || typeof AnyoPlayer === 'object')
  assert.equal(AnyoPlayer.displayName, 'AnyoPlayer')
  assert.equal(typeof useAnyoPlayer, 'function')
})

test('React component renders an isolated host and accepts lifecycle callbacks', () => {
  const render = AnyoPlayer.render ?? AnyoPlayer
  const vnode = render({
    id: 'world-player',
    className: 'embed',
    source: null,
    options: {},
    onReady() {},
    onError() {},
  }, null)
  assert.equal(vnode.type, 'div')
  assert.equal(vnode.props.id, 'world-player')
  assert.equal(vnode.props.className, 'embed')
  assert.equal(vnode.props['data-anyo-player-react'], '')
  assert.equal(typeof vnode.props.ref, 'function')
})
