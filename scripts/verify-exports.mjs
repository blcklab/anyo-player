import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
await access(new URL('dist/index.js', root))
await access(new URL('dist/index.d.ts', root))
await access(new URL('dist/styles.css', root))
await access(new URL('dist/element.js', root))
await access(new URL('dist/element.d.ts', root))
await access(new URL('dist/vue.js', root))
await access(new URL('dist/vue.d.ts', root))
await access(new URL('dist/react.js', root))
await access(new URL('dist/react.d.ts', root))
await access(new URL('dist/element-define.js', root))
await access(new URL('dist/element-define.d.ts', root))

const entry = await import(new URL('dist/index.js', root))
assert.equal(typeof entry.createAnyoPlayer, 'function')
assert.equal(typeof entry.AnyoPlayerError, 'function')
assert.equal(packageJson.exports['./styles.css'], './dist/styles.css')
assert.equal(packageJson.exports['./element'].import, './dist/element.js')
assert.equal(packageJson.exports['./element'].types, './dist/element.d.ts')
assert.equal(packageJson.exports['./vue'].import, './dist/vue.js')
assert.equal(packageJson.exports['./vue'].types, './dist/vue.d.ts')
assert.equal(packageJson.exports['./react'].import, './dist/react.js')
assert.equal(packageJson.exports['./react'].types, './dist/react.d.ts')
assert.equal(packageJson.exports['./element/define'].import, './dist/element-define.js')
assert.equal(packageJson.exports['./element/define'].types, './dist/element-define.d.ts')
const elementEntry = await import(new URL('dist/element.js', root))
assert.equal(typeof elementEntry.AnyoPlayerElement, 'function')
assert.equal(typeof elementEntry.defineAnyoPlayerElement, 'function')
let optionalAdapters = 'verified'
try {
  const vueEntry = await import(new URL('dist/vue.js', root))
  assert.equal(typeof vueEntry.AnyoPlayer, 'object')
  assert.equal(typeof vueEntry.useAnyoPlayer, 'function')
  const reactEntry = await import(new URL('dist/react.js', root))
  assert.ok(typeof reactEntry.AnyoPlayer === 'function' || typeof reactEntry.AnyoPlayer === 'object')
  assert.equal(typeof reactEntry.useAnyoPlayer, 'function')
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
  optionalAdapters = 'files verified; runtime imports skipped because optional framework peers are unavailable'
}
console.log(`Verified public exports: root, element, element/define, styles.css, package.json; vue/react ${optionalAdapters}`)
