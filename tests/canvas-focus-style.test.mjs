import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const cssUrl = new URL('../src/styles.css', import.meta.url)
const styleTextUrl = new URL('../src/styleText.ts', import.meta.url)

test('player canvas is borderless by default on focus-visible', async () => {
  const css = await readFile(cssUrl, 'utf8')
  assert.match(css, /--anyo-player-canvas-focus-outline:\s*none;/)
  assert.match(css, /--anyo-player-canvas-focus-outline-offset:\s*-2px;/)
  assert.match(css, /\.anyo-player__canvas:focus-visible\s*\{[^}]*outline:\s*var\(--anyo-player-canvas-focus-outline\);[^}]*outline-offset:\s*var\(--anyo-player-canvas-focus-outline-offset\);/s)
  assert.doesNotMatch(css, /\.anyo-player__canvas:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/s)
})

test('inline CSS payload carries the same borderless focus contract', async () => {
  const source = await readFile(styleTextUrl, 'utf8')
  assert.match(source, /--anyo-player-canvas-focus-outline: none;/)
  assert.match(source, /outline: var\(--anyo-player-canvas-focus-outline\);/)
})
