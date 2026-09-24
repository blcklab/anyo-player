import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('package metadata keeps Player framework-neutral and on the validated engine baseline', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.peerDependencies['@blcklab/anyo'], '>=0.10.0-rc.1 <1.0.0')
  assert.equal(pkg.peerDependencies['@blcklab/sekai64'], '>=0.7.0 <0.8.0 || >=0.8.0-0 <0.9.0')
  assert.equal(pkg.version, '0.5.3')
  assert.equal(pkg.devDependencies['@blcklab/anyo'], '0.10.0-rc.3')
  assert.equal(pkg.devDependencies['@blcklab/sekai64'], '0.8.0-rc.34')
  assert.equal(pkg.exports['./element'].import, './dist/element.js')
  assert.equal(pkg.exports['./vue'].import, './dist/vue.js')
  assert.equal(pkg.exports['./react'].import, './dist/react.js')
  assert.equal(pkg.exports['./element/define'].import, './dist/element-define.js')
  assert.equal(pkg.peerDependenciesMeta.vue.optional, true)
  assert.equal(pkg.peerDependenciesMeta.react.optional, true)
  assert.equal(pkg.peerDependenciesMeta['react-dom'].optional, true)
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.engines.node, '>=22.12.0')
  assert.deepEqual(pkg.sideEffects, ['./dist/styles.css', './dist/element-define.js'])
})


test('package ownership and MIT license identify Avelurs Tinio', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8')

  assert.equal(pkg.author, 'Avelurs Tinio')
  assert.equal(pkg.license, 'MIT')
  assert.match(license, /Copyright \(c\) 2026 Avelurs Tinio/)
})
