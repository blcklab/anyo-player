import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createStaticServer, listen, closeServer } from './lib/static-server.mjs'

const root = resolve(new URL('../', import.meta.url).pathname)
const output = resolve(root, process.env.VALIDATION_OUTPUT ?? 'validation-results')
const required = process.env.ANYO_PLAYER_REQUIRE_MEMORY_PROFILE === '1'
let chromium
try { ({ chromium } = await import('playwright')) } catch (error) {
  const message = 'Playwright is required for the CDP memory profile.'
  if (required) throw new Error(message, { cause: error })
  console.warn(`MEMORY_PROFILE_SKIPPED: ${message}`)
  process.exit(0)
}
await mkdir(output, { recursive: true })
const appServer = createStaticServer({ root, fallback: 'validation/index.html' })
const assetServer = createStaticServer({ root, fallback: 'validation/assets/triangle.glb', cors: true })
const app = await listen(appServer)
const assets = await listen(assetServer)
let browser
try {
  browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  await page.goto(`${app.origin}/validation/index.html?assetOrigin=${encodeURIComponent(assets.origin)}&memoryCycles=150`, { waitUntil: 'domcontentloaded' })
  await cdp.send('HeapProfiler.collectGarbage')
  const before = await cdp.send('Performance.getMetrics')
  const report = await page.evaluate(() => window.__ANYO_PLAYER_VALIDATION__.runMemoryProfile(150).then(() => window.__ANYO_PLAYER_VALIDATION__.buildReport()))
  await cdp.send('HeapProfiler.collectGarbage')
  const after = await cdp.send('Performance.getMetrics')
  const metric = (payload, name) => payload.metrics.find(item => item.name === name)?.value ?? null
  const evidence = {
    format: '@blcklab/anyo-player/memory-profile', schemaVersion: 1, packageVersion: '0.5.0',
    createdAt: new Date().toISOString(), cycles: 150,
    before: { JSHeapUsedSize: metric(before, 'JSHeapUsedSize'), Nodes: metric(before, 'Nodes'), Documents: metric(before, 'Documents') },
    after: { JSHeapUsedSize: metric(after, 'JSHeapUsedSize'), Nodes: metric(after, 'Nodes'), Documents: metric(after, 'Documents') },
    report,
  }
  evidence.delta = {
    JSHeapUsedSize: evidence.before.JSHeapUsedSize !== null && evidence.after.JSHeapUsedSize !== null ? evidence.after.JSHeapUsedSize - evidence.before.JSHeapUsedSize : null,
    Nodes: evidence.before.Nodes !== null && evidence.after.Nodes !== null ? evidence.after.Nodes - evidence.before.Nodes : null,
    Documents: evidence.before.Documents !== null && evidence.after.Documents !== null ? evidence.after.Documents - evidence.before.Documents : null,
  }
  await writeFile(resolve(output, 'memory-profile.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  const row = report.entries.find(entry => entry.id === 'memory.long-running')
  if (row?.status !== 'pass') throw new Error(row?.evidence || 'Memory profile did not pass.')
  console.log(`Memory profile passed: heap delta ${evidence.delta.JSHeapUsedSize ?? 'unavailable'} bytes`)
} finally {
  await browser?.close()
  await Promise.allSettled([closeServer(appServer), closeServer(assetServer)])
}
