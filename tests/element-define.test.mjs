import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('element/define is the only auto-registration entry', () => {
  const script = `
    globalThis.HTMLElement = class {}
    const definitions = new Map()
    globalThis.customElements = {
      define(name, ctor) { if (definitions.has(name)) throw new Error('duplicate'); definitions.set(name, ctor) },
      get(name) { return definitions.get(name) }
    }
    await import(${JSON.stringify(new URL('../dist/element-define.js', import.meta.url).href)})
    if (typeof customElements.get('anyo-player') !== 'function') process.exit(2)
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
