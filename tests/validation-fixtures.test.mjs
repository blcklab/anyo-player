import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('remote asset fixtures are valid GLB and PNG containers', async () => {
  const glb = await readFile(new URL('validation/assets/triangle.glb', root))
  assert.equal(glb.subarray(0, 4).toString('ascii'), 'glTF')
  assert.equal(glb.readUInt32LE(4), 2)
  assert.equal(glb.readUInt32LE(8), glb.length)
  for (const file of ['base-color.png', 'metallic-roughness.png', 'normal.png', 'emissive.png', 'occlusion.png']) {
    const png = await readFile(new URL(`validation/assets/${file}`, root))
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  }
})

test('framework browser fixtures pin all supported runtime lines', async () => {
  const fixtures = {
    'vue-3.4.html': 'vue@3.4.38',
    'vue-3.5.html': 'vue@3.5.40',
    'react-18.html': 'react@18.2.0',
    'react-19.html': 'react@19.2.8',
  }
  for (const [file, marker] of Object.entries(fixtures)) {
    const source = await readFile(new URL(`validation/framework/${file}`, root), 'utf8')
    assert.match(source, new RegExp(marker.replace('.', '\\.')))
  }
})
