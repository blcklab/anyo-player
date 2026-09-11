import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

export async function listen(server, host = '127.0.0.1', port = 0) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not resolve server address.')
  return { host, port: address.port, origin: `http://${host}:${address.port}` }
}

export async function closeServer(server) {
  server.closeAllConnections?.()
  await new Promise(resolveClose => server.close(() => resolveClose()))
}

export function createStaticServer({ root, fallback = 'validation/index.html', cors = false } = {}) {
  const absoluteRoot = resolve(root)
  const rootPrefix = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`
  return createServer(async (request, response) => {
    const corsHeaders = cors ? {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': '*',
    } : {}
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders)
      response.end()
      return
    }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const relative = decodeURIComponent(url.pathname === '/' ? fallback : url.pathname.slice(1))
      const file = normalize(join(absoluteRoot, relative))
      if (file !== absoluteRoot && !file.startsWith(rootPrefix)) throw new Error('Path is outside root.')
      const info = await stat(file)
      if (!info.isFile()) throw new Error('Not a file.')
      response.writeHead(200, {
        ...corsHeaders,
        'content-type': mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
        'content-length': info.size,
        'cache-control': 'no-store',
        'cross-origin-resource-policy': 'cross-origin',
      })
      if (request.method === 'HEAD') response.end()
      else response.end(await readFile(file))
    } catch {
      response.writeHead(404, { ...corsHeaders, 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })
}
