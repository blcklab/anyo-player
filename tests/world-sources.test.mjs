import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnyoPlayerFolderSource } from '../dist/worldSources.js'

function file(parts, name, path) {
  const value = new File(parts, name)
  Object.defineProperty(value, 'webkitRelativePath', { value: path })
  return value
}

test('folder source helper strips one common directory and preserves relative package paths', () => {
  const source = createAnyoPlayerFolderSource([
    file(['{}'], 'world.anyo.json', 'everdawn/world.anyo.json'),
    file(['glb'], 'town.glb', 'everdawn/assets/town.glb'),
  ])
  assert.deepEqual([...source.files.keys()], ['world.anyo.json', 'assets/town.glb'])
})

test('folder source helper rejects traversal and duplicate package paths', () => {
  assert.throws(() => createAnyoPlayerFolderSource([
    file(['{}'], 'world.anyo.json', '../world.anyo.json'),
  ]), /Invalid world package path/)
  assert.throws(() => createAnyoPlayerFolderSource([
    file(['a'], 'world.anyo.json', 'root/world.anyo.json'),
    file(['b'], 'world.anyo.json', 'root/world.anyo.json'),
  ]), /Duplicate/)
})
