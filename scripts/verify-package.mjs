import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
})
if (result.status !== 0) throw new Error(result.stderr || result.stdout)
const report = JSON.parse(result.stdout)[0]
const paths = report.files.map(file => file.path)

for (const required of [
  'package.json',
  'dist/index.js', 'dist/index.d.ts',
  'dist/element.js', 'dist/element.d.ts',
  'dist/vue.js', 'dist/vue.d.ts',
  'dist/react.js', 'dist/react.d.ts',
  'dist/element-define.js', 'dist/element-define.d.ts',
  'dist/styles.css',
  'README.md', 'LICENSE', 'CHANGELOG.md',
  'docs/README.md', 'docs/PRODUCTION.md', 'docs/TESTING.md',
  'docs/api/API.md',
  'docs/guides/MIGRATION.md', 'docs/guides/SUPPORT.md',
  'docs/integrations/SEKAI64_080_BRIDGE.md',
  'validation/index.html', 'validation/main.js', 'validation/styles.css',
  'validation/stable-matrix.template.json', 'validation/report.template.json',
  'validation/assets/triangle.glb',
  'validation/assets/base-color.png',
  'validation/assets/metallic-roughness.png',
  'validation/assets/normal.png',
  'validation/assets/emissive.png',
  'validation/assets/occlusion.png',
  'validation/framework/vue-3.4.html',
  'validation/framework/vue-3.5.html',
  'validation/framework/react-18.html',
  'validation/framework/react-19.html',
  'validation/framework/vue-runtime.js',
  'validation/framework/react-runtime.js',
  'scripts/validation-server.mjs',
  'scripts/validate-evidence.mjs',
  'scripts/browser-matrix.mjs',
  'scripts/memory-profile.mjs',
  'scripts/safari-smoke.mjs',
  'scripts/verify-published-cdn.mjs',
  'scripts/lib/static-server.mjs',
]) {
  assert(paths.includes(required), `Packed package is missing ${required}`)
}

for (const path of paths) {
  assert(!path.startsWith('src/'), `Packed package leaked source file ${path}`)
  assert(!path.startsWith('tests/'), `Packed package leaked test file ${path}`)
  assert(!path.startsWith('.internal/'), `Packed package leaked maintainer-only file ${path}`)
  assert(!path.startsWith('node_modules/'), `Packed package leaked dependency file ${path}`)
}

console.log(`Verified npm package contents: ${report.files.length} files, ${report.size} bytes compressed; maintainer-only docs are excluded`)
