import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const validator = new URL('../scripts/validate-evidence.mjs', import.meta.url).pathname

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('validation template is structurally valid but fails the strict stable gate', () => {
  const normal = run('validation/stable-matrix.template.json')
  assert.equal(normal.status, 0, normal.stderr || normal.stdout)
  const strict = run('--strict', 'validation/stable-matrix.template.json')
  assert.equal(strict.status, 1)
})

test('strict evidence validation accepts a fully evidenced matrix', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'anyo-player-validation-'))
  try {
    const template = JSON.parse(await readFile(new URL('../validation/stable-matrix.template.json', import.meta.url), 'utf8'))
    template.updatedAt = new Date(0).toISOString()
    for (const entry of template.entries) {
      entry.status = 'pass'
      entry.evidence = `Verified ${entry.id}`
    }
    const path = join(directory, 'matrix.json')
    await writeFile(path, JSON.stringify(template))
    const result = run('--strict', path)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /Stable validation gate passed/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('passing validation entries require evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'anyo-player-validation-'))
  try {
    const path = join(directory, 'bad.json')
    await writeFile(path, JSON.stringify({
      format: '@blcklab/anyo-player/validation-report',
      schemaVersion: 1,
      packageVersion: '0.5.0-test',
      entries: [{ id: 'core.load', required: true, status: 'pass', evidence: '' }],
    }))
    const result = run(path)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /requires evidence/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
