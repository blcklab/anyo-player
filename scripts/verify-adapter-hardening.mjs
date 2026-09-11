import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const rootPath = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', rootPath), 'utf8'))

assert.equal(packageJson.dependencies, undefined)
for (const framework of ['vue', 'react', 'react-dom']) {
  assert.equal(packageJson.peerDependenciesMeta[framework].optional, true)
}

const rootSource = await readFile(new URL('dist/index.js', rootPath), 'utf8')
const elementSource = await readFile(new URL('dist/element.js', rootPath), 'utf8')
assert.doesNotMatch(rootSource, /from ['"](?:vue|react|react-dom)/)
assert.doesNotMatch(elementSource, /from ['"](?:vue|react|react-dom)/)

const temporary = await mkdtemp(join(tmpdir(), 'anyo-player-hardening-'))
try {
  const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], {
    cwd: rootPath,
    encoding: 'utf8',
  })
  if (pack.status !== 0) throw new Error(pack.stderr || pack.stdout)
  const report = JSON.parse(pack.stdout)[0]
  const archive = join(temporary, report.filename)
  const extracted = join(temporary, 'extracted')
  const consumer = join(temporary, 'consumer')
  const modules = join(consumer, 'node_modules', '@blcklab')
  await mkdir(extracted, { recursive: true })
  await mkdir(modules, { recursive: true })
  const untar = spawnSync('tar', ['-xzf', archive, '-C', extracted], { encoding: 'utf8' })
  if (untar.status !== 0) throw new Error(untar.stderr || untar.stdout)
  await cp(join(extracted, 'package'), join(modules, 'anyo-player'), { recursive: true })
  await cp(new URL('../node_modules/@blcklab/anyo/', import.meta.url), join(modules, 'anyo'), { recursive: true })
  await cp(new URL('../node_modules/@blcklab/sekai64/', import.meta.url), join(modules, 'sekai64'), { recursive: true })
  await writeFile(join(consumer, 'package.json'), '{"type":"module"}\n')
  await writeFile(join(consumer, 'verify.mjs'), `
    const root = await import('@blcklab/anyo-player')
    const element = await import('@blcklab/anyo-player/element')
    if (typeof root.createAnyoPlayer !== 'function') process.exit(2)
    if (typeof element.defineAnyoPlayerElement !== 'function') process.exit(3)
    for (const subpath of ['@blcklab/anyo-player/vue', '@blcklab/anyo-player/react']) {
      try {
        await import(subpath)
        process.exit(4)
      } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
      }
    }
  `)
  const verify = spawnSync(process.execPath, ['verify.mjs'], { cwd: consumer, encoding: 'utf8' })
  assert.equal(verify.status, 0, verify.stderr || verify.stdout)
} finally {
  await rm(temporary, { recursive: true, force: true })
}

console.log('Verified packed-consumer framework isolation and optional adapter peers')
