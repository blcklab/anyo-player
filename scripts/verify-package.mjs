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
]) {
  assert(paths.includes(required), `Packed package is missing ${required}`)
}

for (const path of paths) {
  assert(!path.startsWith('src/'), `Packed package leaked source file ${path}`)
  assert(!path.startsWith('tests/'), `Packed package leaked test file ${path}`)
  assert(!path.startsWith('.internal/'), `Packed package leaked maintainer-only file ${path}`)
  assert(!path.startsWith('validation/'), `Packed package leaked validation file ${path}`)
  assert(!path.startsWith('scripts/'), `Packed package leaked repository script ${path}`)
  assert(!path.startsWith('node_modules/'), `Packed package leaked dependency file ${path}`)
}

console.log(`Verified npm package contents: ${report.files.length} files, ${report.size} bytes compressed; repository-only files are excluded`)
