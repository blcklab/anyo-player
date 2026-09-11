import { gzipSync } from 'node:zlib'
import { readdir, readFile, stat } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
let raw = 0
let gzip = 0
let modules = 0

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory)
    if (entry.isDirectory()) await visit(new URL(`${entry.name}/`, directory))
    else if (entry.name.endsWith('.js')) {
      const content = await readFile(url)
      raw += (await stat(url)).size
      gzip += gzipSync(content).length
      modules += 1
    }
  }
}

await visit(dist)
console.log(JSON.stringify({ modules, rawBytes: raw, gzipBytes: gzip }, null, 2))
