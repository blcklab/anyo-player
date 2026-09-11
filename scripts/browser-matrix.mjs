import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createStaticServer, listen, closeServer } from './lib/static-server.mjs'

const root = resolve(new URL('../', import.meta.url).pathname)
const output = resolve(root, process.env.VALIDATION_OUTPUT ?? 'validation-results')
const required = process.env.ANYO_PLAYER_REQUIRE_BROWSER_MATRIX === '1'
const browserNames = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium,firefox,webkit').split(',').map(value => value.trim()).filter(Boolean)
let playwright
try {
  playwright = await import('playwright')
} catch (error) {
  const message = 'Playwright is not installed. Run npm install --no-save playwright and npx playwright install --with-deps.'
  if (required) throw new Error(message, { cause: error })
  console.warn(`BROWSER_MATRIX_SKIPPED: ${message}`)
  process.exit(0)
}

await mkdir(output, { recursive: true })
const appServer = createStaticServer({ root, fallback: 'validation/index.html' })
const assetServer = createStaticServer({ root, fallback: 'validation/assets/triangle.glb', cors: true })
const app = await listen(appServer)
const assets = await listen(assetServer)
const reports = []

async function waitForValidation(page, timeout = 120_000) {
  await page.waitForFunction(() => ['complete', 'fail'].includes(document.documentElement.dataset.validation), null, { timeout })
  return page.evaluate(() => window.__ANYO_PLAYER_VALIDATION__.buildReport())
}

async function runLab(browser, browserName, contextOptions, label) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.stack || error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const url = `${app.origin}/validation/index.html?autorun=1&memoryCycles=30&assetOrigin=${encodeURIComponent(assets.origin)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const report = await waitForValidation(page)
  const failed = report.entries.filter(entry => entry.status === 'fail')
  const result = { id: label, browser: browserName, context: contextOptions, url, failed: failed.map(entry => entry.id), errors, report }
  reports.push(result)
  await writeFile(resolve(output, `${label}.json`), `${JSON.stringify(result, null, 2)}\n`)
  await context.close()
  if (failed.length) throw new Error(`${label} failed: ${failed.map(entry => entry.id).join(', ')}`)
}

async function runFramework(page, fixture, id) {
  const errors = []
  page.on('pageerror', error => errors.push(error.stack || error.message))
  await page.goto(`${app.origin}/validation/framework/${fixture}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => ['pass', 'fail'].includes(document.documentElement.dataset.framework), null, { timeout: 90_000 })
  const state = await page.evaluate(() => document.documentElement.dataset.framework)
  const evidence = await page.locator('#result').textContent()
  const result = { id, state, evidence, errors }
  reports.push(result)
  await writeFile(resolve(output, `${id}.json`), `${JSON.stringify(result, null, 2)}\n`)
  if (state !== 'pass') throw new Error(`${id} failed: ${evidence}`)
}

const failures = []
try {
  for (const browserName of browserNames) {
    const browserType = playwright[browserName]
    if (!browserType) { failures.push(`${browserName}: unsupported Playwright browser name`); continue }
    let browser
    try {
      browser = await browserType.launch({ headless: true })
      await runLab(browser, browserName, {}, `desktop-${browserName}`)
      if (browserName === 'chromium') {
        await runLab(browser, browserName, { ...playwright.devices['Pixel 7'] }, 'emulation-android-chrome')
        await runLab(browser, browserName, { ...playwright.devices['Desktop Chrome HiDPI'] }, 'desktop-chromium-hidpi')
        const page = await browser.newPage()
        for (const [fixture, id] of [
          ['vue-3.4.html', 'framework-vue-3.4'],
          ['vue-3.5.html', 'framework-vue-3.5'],
          ['react-18.html', 'framework-react-18'],
          ['react-19.html', 'framework-react-19'],
        ]) await runFramework(page, fixture, id)
        await page.close()
      }
      if (browserName === 'webkit') {
        await runLab(browser, browserName, { ...playwright.devices['iPhone 15'] }, 'emulation-ios-webkit')
      }
    } catch (error) {
      failures.push(`${browserName}: ${error?.stack ?? error}`)
    } finally {
      await browser?.close()
    }
  }
} finally {
  await Promise.allSettled([closeServer(appServer), closeServer(assetServer)])
}

const summary = {
  format: '@blcklab/anyo-player/automation-matrix', schemaVersion: 1,
  packageVersion: '0.5.0', createdAt: new Date().toISOString(),
  distinction: 'Playwright WebKit and mobile emulation are compatibility signals, not physical Safari/iOS/Android evidence.',
  failures, reports: reports.map(item => item.id),
}
await writeFile(resolve(output, 'automation-matrix.json'), `${JSON.stringify(summary, null, 2)}\n`)
if (failures.length) throw new Error(`Browser matrix failed:\n${failures.join('\n\n')}`)
console.log(`Browser matrix passed: ${reports.length} evidence reports`)
