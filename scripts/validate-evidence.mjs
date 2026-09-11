import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const files = args.filter(argument => !argument.startsWith('--'))
if (files.length === 0) files.push('validation/stable-matrix.template.json')

const allowedFormats = new Set([
  '@blcklab/anyo-player/stable-validation-matrix',
  '@blcklab/anyo-player/validation-report',
])
const allowedStatuses = new Set(['pending', 'pass', 'fail', 'blocked', 'not-applicable'])
let failed = false

for (const input of files) {
  const path = resolve(input)
  try {
    const document = JSON.parse(await readFile(path, 'utf8'))
    if (!allowedFormats.has(document.format)) throw new Error(`Unsupported format: ${String(document.format)}`)
    if (document.schemaVersion !== 1) throw new Error('schemaVersion must be 1.')
    if (typeof document.packageVersion !== 'string' || document.packageVersion.length === 0) {
      throw new Error('packageVersion is required.')
    }
    if (!Array.isArray(document.entries)) throw new Error('entries must be an array.')

    const seen = new Set()
    const counts = { pending: 0, pass: 0, fail: 0, blocked: 0, 'not-applicable': 0 }
    for (const [index, entry] of document.entries.entries()) {
      if (!entry || typeof entry !== 'object') throw new Error(`entries[${index}] must be an object.`)
      if (typeof entry.id !== 'string' || entry.id.length === 0) throw new Error(`entries[${index}].id is required.`)
      if (seen.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}`)
      seen.add(entry.id)
      if (!allowedStatuses.has(entry.status)) throw new Error(`Invalid status for ${entry.id}: ${String(entry.status)}`)
      counts[entry.status] += 1
      if (entry.status === 'pass' && (!entry.evidence || String(entry.evidence).trim().length === 0)) {
        throw new Error(`Passing entry ${entry.id} requires evidence.`)
      }
      if (strict && entry.required !== false && entry.status !== 'pass') {
        failed = true
      }
    }

    console.log(`${input}: ${document.entries.length} entries`)
    console.log(`  pass=${counts.pass} pending=${counts.pending} blocked=${counts.blocked} fail=${counts.fail} not-applicable=${counts['not-applicable']}`)
    if (counts.fail > 0) failed = true
    if (strict && document.format === '@blcklab/anyo-player/stable-validation-matrix' && document.entries.length === 0) {
      throw new Error('A strict stable matrix cannot be empty.')
    }
  } catch (error) {
    failed = true
    console.error(`${input}: ${error?.message ?? error}`)
  }
}

if (strict && !failed) console.log('Stable validation gate passed.')
if (failed) process.exitCode = 1
