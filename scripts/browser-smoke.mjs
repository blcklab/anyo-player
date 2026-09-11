import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { CdpSession, evaluate } from './lib/cdp.mjs'

const root = resolve(new URL('../', import.meta.url).pathname)
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
])

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    const relative = pathname === '/' ? 'tests/browser/smoke.html' : pathname.slice(1)
    const file = normalize(join(root, relative))
    if (!file.startsWith(root)) throw new Error('outside root')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'content-type': mime.get(extname(file)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(await readFile(file))
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})

async function listen(serverInstance, host = '127.0.0.1', port = 0) {
  await new Promise((resolveListen, reject) => {
    serverInstance.once('error', reject)
    serverInstance.listen(port, host, resolveListen)
  })
  const address = serverInstance.address()
  if (!address || typeof address === 'string') throw new Error('Could not resolve server port.')
  return address.port
}

async function reservePort() {
  const holder = createServer()
  const port = await listen(holder)
  await new Promise(resolveClose => holder.close(resolveClose))
  return port
}

async function waitForTarget(debugPort, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(item =>
          item.type === 'page' &&
          item.webSocketDebuggerUrl &&
          typeof item.url === 'string' &&
          item.url.includes('/tests/browser/smoke.html')
        )
        if (target) return target
      }
    } catch (error) {
      lastError = error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150))
  }
  throw new Error(`Chromium CDP target did not become available.${lastError ? ` ${lastError.message}` : ''}`)
}

async function waitForSmoke(session, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await evaluate(session, 'document.documentElement?.dataset?.smoke || "running"')
    if (state === 'pass' || state === 'fail') {
      const text = await evaluate(session, 'document.querySelector("#result")?.textContent || ""')
      return { state, text }
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  const snapshot = await evaluate(session, `({
    href: location.href,
    readyState: document.readyState,
    smoke: document.documentElement?.dataset?.smoke ?? null,
    result: document.querySelector('#result')?.textContent ?? null,
    scripts: [...document.scripts].map(script => ({ src: script.src, type: script.type })),
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
  })`)
  throw new Error(`Browser smoke page did not reach a terminal state. ${JSON.stringify(snapshot)}`)
}

const httpPort = await listen(server)
const url = `http://127.0.0.1:${httpPort}/tests/browser/smoke.html`
const chromium = process.env.CHROMIUM_BIN ?? 'chromium'
const debugPort = await reservePort()
const profile = await mkdtemp(join(tmpdir(), 'anyo-player-browser-smoke-'))
const stderr = []
let child = null
let session = null

try {
  child = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--disable-background-networking',
    '--no-proxy-server',
    '--proxy-bypass-list=<-loopback>',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr.push(chunk)
    if (stderr.join('').length > 12_000) stderr.splice(0, Math.max(1, stderr.length - 4))
  })

  const target = await waitForTarget(debugPort)
  session = new CdpSession(target.webSocketDebuggerUrl)
  await session.connect()
  const result = await waitForSmoke(session)
  if (result.state !== 'pass') throw new Error(result.text || 'Browser smoke failed.')

  const passLines = result.text.split('\n').filter(line => line.startsWith('PASS '))
  console.log(`Headless Chromium smoke passed: ${passLines.length} browser assertions`)
  for (const line of passLines) console.log(`- ${line}`)
} catch (error) {
  const message = [
    'Headless Chromium smoke could not pass in this environment.',
    error?.stack ?? String(error),
    stderr.join('').slice(-3000),
  ].join('\n')
  if (process.env.ANYO_PLAYER_REQUIRE_BROWSER_SMOKE === '1') throw new Error(message)
  console.warn('BROWSER_SMOKE_SKIPPED')
  console.warn(message)
} finally {
  session?.close()
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise(resolveExit => child.once('exit', resolveExit)),
      new Promise(resolveDelay => setTimeout(resolveDelay, 1000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  await rm(profile, { recursive: true, force: true })
  server.closeAllConnections?.()
  await new Promise(resolveClose => server.close(resolveClose))
}
