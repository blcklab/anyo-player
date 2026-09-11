import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createStaticServer, listen, closeServer } from './lib/static-server.mjs'

if (process.platform !== 'darwin') {
  console.warn('SAFARI_SMOKE_SKIPPED: real Safari validation requires macOS and safaridriver.')
  process.exit(0)
}
const root = resolve(new URL('../', import.meta.url).pathname)
const appServer = createStaticServer({ root, fallback: 'validation/index.html' })
const assetServer = createStaticServer({ root, fallback: 'validation/assets/triangle.glb', cors: true })
const app = await listen(appServer)
const assets = await listen(assetServer)
const driverPort = Number(process.env.SAFARIDRIVER_PORT ?? 4444)
const driver = spawn('safaridriver', ['-p', String(driverPort)], { stdio: ['ignore', 'pipe', 'pipe'] })
const base = `http://127.0.0.1:${driverPort}`
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))
async function command(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.value?.error) throw new Error(JSON.stringify(payload))
  return payload.value
}
let sessionId
try {
  for (let i = 0; i < 40; i += 1) { try { await fetch(`${base}/status`); break } catch { await pause(250) } }
  const session = await command('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'safari' } } })
  sessionId = session.sessionId
  const url = `${app.origin}/validation/index.html?autorun=1&memoryCycles=20&assetOrigin=${encodeURIComponent(assets.origin)}`
  await command(`/session/${sessionId}/url`, 'POST', { url })
  let state = 'running'
  for (let i = 0; i < 240 && state === 'running'; i += 1) {
    state = await command(`/session/${sessionId}/execute/sync`, 'POST', { script: 'return document.documentElement.dataset.validation || "running"', args: [] })
    if (!['complete', 'fail'].includes(state)) { state = 'running'; await pause(500) }
  }
  const report = await command(`/session/${sessionId}/execute/sync`, 'POST', { script: 'return window.__ANYO_PLAYER_VALIDATION__ && window.__ANYO_PLAYER_VALIDATION__.buildReport()', args: [] })
  if (state !== 'complete') throw new Error(`Safari validation state=${state}; report=${JSON.stringify(report)}`)
  console.log('Real Safari automated matrix passed. User-gesture and physical-device rows still require manual evidence.')
} finally {
  if (sessionId) await command(`/session/${sessionId}`, 'DELETE').catch(() => undefined)
  driver.kill('SIGTERM')
  await Promise.allSettled([closeServer(appServer), closeServer(assetServer)])
}
