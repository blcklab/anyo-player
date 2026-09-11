import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const matrix = JSON.parse(await readFile(new URL('validation/stable-matrix.template.json', root), 'utf8'))
const validation = await readFile(new URL('.internal/validation/VALIDATION.md', root), 'utf8')
const milestones = await readFile(new URL('.internal/history/MILESTONES.md', root), 'utf8')
const status = await readFile(new URL('.internal/validation/VALIDATION_STATUS.md', root), 'utf8')
const deviceGuide = await readFile(new URL('.internal/validation/DEVICE_VALIDATION.md', root), 'utf8')
const lab = await readFile(new URL('validation/main.js', root), 'utf8')

assert.equal(matrix.packageVersion, packageJson.version)
assert.equal(matrix.format, '@blcklab/anyo-player/stable-validation-matrix')
assert.equal(matrix.schemaVersion, 1)
assert.ok(Array.isArray(matrix.entries) && matrix.entries.length >= 20)

const ids = new Set(matrix.entries.map(entry => entry.id))
for (const required of [
  'browser.desktop.chrome.webgl2', 'browser.desktop.firefox.webgl2', 'browser.desktop.safari.webgl2',
  'backend.chrome.webgpu', 'mobile.android.chrome', 'mobile.ios.safari', 'loss.webgl2', 'loss.webgpu',
  'framework.vue3.4', 'framework.vue3.5', 'framework.react18', 'framework.react19',
  'cdn.import-map', 'memory.long-running', 'xr.physical-headset',
]) assert.ok(ids.has(required), `Missing stable validation row: ${required}`)
for (const entry of matrix.entries) {
  assert.equal(entry.required, true)
  assert.equal(entry.status, 'pending')
}

for (const script of [
  'validation:serve', 'validation:check', 'validation:strict', 'check:validation',
  'validation:matrix', 'validation:memory', 'validation:cdn:published', 'test:safari',
]) assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
for (const file of ['docs', 'validation']) {
  assert.ok(packageJson.files.includes(file), `Missing packed validation file: ${file}`)
}
for (const file of [
  'validation/assets/triangle.glb', 'validation/assets/base-color.png', 'validation/assets/metallic-roughness.png',
  'validation/assets/normal.png', 'validation/assets/emissive.png', 'validation/assets/occlusion.png',
  'validation/framework/vue-3.4.html', 'validation/framework/vue-3.5.html',
  'validation/framework/react-18.html', 'validation/framework/react-19.html',
  'scripts/browser-matrix.mjs', 'scripts/memory-profile.mjs', 'scripts/safari-smoke.mjs',
  'scripts/verify-published-cdn.mjs',
]) assert.ok((await stat(new URL(file, root))).isFile(), `Missing validation fixture: ${file}`)

for (const id of ['assets.remote-glb-textures', 'loss.webgl2', 'loss.webgpu', 'memory.long-running']) {
  assert.match(lab, new RegExp(id.replaceAll('.', '\\.')))
}
assert.match(validation, /cross-origin/i)
assert.match(validation, /validation:strict/)
assert.match(deviceGuide, /physical WebXR/i)
assert.match(status, /not physical hardware|Await real devices/i)
assert.match(milestones, /Player-backed Play Mode/i)

console.log(`Verified ${matrix.entries.length} stable rows, cross-runtime fixtures, and evidence tooling`)
