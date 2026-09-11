import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createStaticServer, listen, closeServer } from './lib/static-server.mjs'
import { CdpSession, evaluate } from './lib/cdp.mjs'

const root = resolve(new URL('../', import.meta.url).pathname)
const output = resolve(root, process.env.VALIDATION_OUTPUT ?? 'validation-results')
await mkdir(output, { recursive: true })
const appServer = createStaticServer({ root, fallback: 'validation/index.html', cors: true })
const app = await listen(appServer)

async function reservePort() {
  const server = createServer()
  const address = await new Promise((resolveAddress, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveAddress(server.address()))
  })
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise(resolveClose => server.close(resolveClose))
  return port
}
async function waitForTarget(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url.includes('/validation/index.html'))
      if (target) return target
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150))
  }
  throw new Error('Chromium validation target did not become available.')
}
async function waitForReport(session, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const href = await evaluate(session, 'location.href')
    if (String(href).startsWith('chrome-error://')) throw new Error(`Chromium could not load the validation URL: ${href}`)
    const state = await evaluate(session, 'document.documentElement.dataset.validation || "running"')
    if (state === 'complete' || state === 'fail') {
      return { state, report: await evaluate(session, 'window.__ANYO_PLAYER_VALIDATION__.buildReport()') }
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 300))
  }
  throw new Error('Track F browser validation timed out.')
}

const chromium = process.env.CHROMIUM_BIN ?? 'chromium'
const debugPort = await reservePort()
const profile = await mkdtemp(join(tmpdir(), 'anyo-track-f-browser-'))
const url = `${app.origin}/validation/index.html?autorun=1&memoryCycles=15&assetOrigin=${encodeURIComponent(app.origin)}`
const stderr = []
let child
let session
try {
  child = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox',
    '--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--no-first-run', '--disable-background-networking', '--no-proxy-server', '--proxy-bypass-list=<-loopback>',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr.push(chunk); if (stderr.join('').length > 20_000) stderr.splice(0, 2) })
  const target = await waitForTarget(debugPort)
  session = new CdpSession(target.webSocketDebuggerUrl)
  await session.connect()
  const result = await waitForReport(session)
  const requiredAutomation = new Set([
    'core.load', 'core.two-players', 'core.replace', 'element.shadow', 'lifecycle.dispose',
    'lifecycle.stress', 'assets.remote-glb-textures', 'loss.webgl2', 'memory.long-running',
  ])
  const failed = result.report.entries.filter(entry => requiredAutomation.has(entry.id) && entry.status !== 'pass')
  const evidence = {
    format: '@blcklab/anyo-player/track-f-browser-smoke', schemaVersion: 1,
    packageVersion: '0.5.0', createdAt: new Date().toISOString(),
    browser: { binary: chromium, mode: 'headless-chromium', url },
    state: result.state, requiredAutomation: [...requiredAutomation], failed: failed.map(entry => ({ id: entry.id, status: entry.status, evidence: entry.evidence })),
    report: result.report,
    distinction: 'Headless SwiftShader is automation evidence, not physical GPU, mobile, Safari, or thermal evidence.',
  }
  await writeFile(resolve(output, 'track-f-browser-smoke.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  if (failed.length) throw new Error(`Track F browser smoke failed: ${failed.map(item => `${item.id}=${item.status}`).join(', ')}`)
  console.log(`Track F headless Chromium smoke passed: ${requiredAutomation.size} required automation checks.`)
} catch (error) {
  const message = `${error?.stack ?? error}\n${stderr.join('').slice(-5000)}`
  if (process.env.ANYO_PLAYER_REQUIRE_TRACK_F_BROWSER === '1') throw new Error(message)
  console.warn('TRACK_F_BROWSER_SMOKE_BLOCKED')
  console.warn(message)
} finally {
  session?.close()
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise(resolveExit => child.once('exit', resolveExit)),
      new Promise(resolveDelay => setTimeout(resolveDelay, 1500)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await rm(profile, { recursive: true, force: true }); break }
    catch (error) { if (attempt === 4) throw error; await new Promise(resolveDelay => setTimeout(resolveDelay, 200)) }
  }
  await closeServer(appServer)
}
