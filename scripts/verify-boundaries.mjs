import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const sourceRoot = new URL('../src/', import.meta.url)
const universallyForbidden = [
  /from\s+['"]@sekai64\//,
  /from\s+['"][^'"]*\/src\//,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
]

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const url = new URL(entry.name, directory)
    if (entry.isDirectory()) output.push(...await files(new URL(`${entry.name}/`, directory)))
    else if (entry.name.endsWith('.ts')) output.push(url)
  }
  return output
}

for (const file of await files(sourceRoot)) {
  const source = await readFile(file, 'utf8')
  for (const pattern of universallyForbidden) {
    assert.equal(pattern.test(source), false, `Forbidden boundary pattern ${pattern} in ${file.pathname}`)
  }
  const relative = file.pathname.slice(sourceRoot.pathname.length)
  if (relative !== 'vue.ts') {
    assert.equal(/from\s+['"]vue['"]/.test(source), false, `Vue leaked into ${relative}`)
  }
  if (relative !== 'react.ts') {
    assert.equal(/from\s+['"](?:react|react-dom(?:\/[^'"]*)?)['"]/.test(source), false, `React leaked into ${relative}`)
  }
}

const rootEntry = await readFile(new URL('index.ts', sourceRoot), 'utf8')
assert.equal(/\.\/vue\.js/.test(rootEntry), false, 'Root entry must not import Vue adapter')
assert.equal(/\.\/react\.js/.test(rootEntry), false, 'Root entry must not import React adapter')
console.log('Verified core/framework boundaries and forbidden dynamic-code rules')
