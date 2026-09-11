import { resolve } from 'node:path'
import { createStaticServer, listen, closeServer } from './lib/static-server.mjs'

const root = resolve(new URL('../', import.meta.url).pathname)
const requestedPort = Number(process.env.PORT ?? 4173)
const requestedAssetPort = Number(process.env.ASSET_PORT ?? 4174)
const appServer = createStaticServer({ root, fallback: 'validation/index.html' })
const assetServer = createStaticServer({ root, fallback: 'validation/assets/triangle.glb', cors: true })

const app = await listen(appServer, '0.0.0.0', requestedPort)
const assets = await listen(assetServer, '0.0.0.0', requestedAssetPort)
const appOrigin = `http://localhost:${app.port}`
const assetOrigin = `http://localhost:${assets.port}`
console.log(`Anyo Player validation lab: ${appOrigin}/?assetOrigin=${encodeURIComponent(assetOrigin)}`)
console.log(`Cross-origin asset server: ${assetOrigin}/validation/assets/`)
console.log('Use Ctrl+C to stop both servers.')

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await Promise.allSettled([closeServer(appServer), closeServer(assetServer)])
}
process.once('SIGINT', () => stop().finally(() => process.exit()))
process.once('SIGTERM', () => stop().finally(() => process.exit()))
