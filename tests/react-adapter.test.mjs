import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnyoPlayer, useAnyoPlayer } from '../dist/react.js'

test('React adapter exports a forward-ref component and hook', () => {
  assert.ok(typeof AnyoPlayer === 'function' || typeof AnyoPlayer === 'object')
  assert.equal(AnyoPlayer.displayName, 'AnyoPlayer')
  assert.equal(typeof useAnyoPlayer, 'function')
})

test('React component renders an isolated host and accepts lifecycle callbacks', () => {
  const html = renderToStaticMarkup(createElement(AnyoPlayer, {
    id: 'world-player',
    className: 'embed',
    source: null,
    options: {},
    onReady() {},
    onError() {},
  }))

  assert.match(html, /^<div\b/)
  assert.match(html, /\bid="world-player"/)
  assert.match(html, /\bclass="embed"/)
  assert.match(html, /\bdata-anyo-player-react=""/)
})
