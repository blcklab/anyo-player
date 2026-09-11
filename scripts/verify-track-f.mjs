import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const required = [
  '.internal/validation/TRACK_F_PRODUCTION_VALIDATION.md', 'tests/track-f-production.test.mjs',
  'scripts/track-f-browser-smoke.mjs', 'validation/track-f-stable-matrix.template.json',
  '.github/workflows/track-f-production.yml',
]
for (const relative of required) {
  const info = await stat(path.join(root, relative))
  if (!info.isFile()) throw new Error(`Missing production-validation file: ${relative}`)
}
const validation = await readFile(path.join(root, 'validation/main.js'), 'utf8')
for (const token of ['WEBGL_lose_context', 'capturedDevice.destroy()', 'memory.long-running', 'xr.physical-headset']) {
  if (!validation.includes(token)) throw new Error(`Player validation lab is missing ${token}.`)
}
const workflow = await readFile(path.join(root, '.github/workflows/track-f-production.yml'), 'utf8')
for (const token of ['ubuntu-latest', 'windows-latest', 'macos-15', 'browser', 'memory']) {
  if (!workflow.includes(token)) throw new Error(`Production-validation workflow is missing ${token}.`)
}
console.log('Anyo Player production-validation source gate passed.')
