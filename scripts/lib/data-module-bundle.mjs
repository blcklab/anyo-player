import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function createDataModuleBundle({ root, entry }) {
  const moduleByPath = new Map()
  const modules = []

  async function addModule(path) {
    const absolute = normalize(resolve(path))
    const existing = moduleByPath.get(absolute)
    if (existing) return existing
    const record = { id: `m${modules.length}`, path: absolute, source: '', dependencies: new Map() }
    modules.push(record)
    moduleByPath.set(absolute, record)
    const source = await readFile(absolute, 'utf8')
    const specifiers = collectSpecifiers(source)
    for (const specifier of specifiers) {
      if (isExternalUrl(specifier)) continue
      const dependencyPath = await resolveSpecifier(specifier, absolute, root)
      const dependency = await addModule(dependencyPath)
      record.dependencies.set(specifier, dependency.id)
    }
    record.source = rewriteSpecifiers(source, record.dependencies)
    return record
  }

  const entryRecord = await addModule(entry)
  const imports = {}
  for (const record of modules) {
    const source = `${record.source}\n//# sourceURL=${pathToFileURL(record.path).href}\n`
    imports[record.id] = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  }
  return { entryId: entryRecord.id, imports, moduleCount: modules.length, modules: modules.map(item => item.path) }
}

function collectSpecifiers(source) {
  const values = new Set()
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.add(match[1])
  }
  return values
}

function rewriteSpecifiers(source, dependencies) {
  const replace = specifier => dependencies.get(specifier) ?? specifier
  return source
    .replace(/(\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"])([^'"]+)(['"])/g,
      (_, before, specifier, after) => `${before}${replace(specifier)}${after}`)
    .replace(/(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g,
      (_, before, specifier, after) => `${before}${replace(specifier)}${after}`)
}

async function resolveSpecifier(specifier, parentPath, root) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return resolveFile(specifier.startsWith('/') ? join(root, specifier) : resolve(dirname(parentPath), specifier))
  }
  if (specifier === '@blcklab/anyo-player') return join(root, 'dist/index.js')
  if (specifier.startsWith('@blcklab/')) return resolvePackageSpecifier(specifier, root)
  throw new Error(`Unsupported browser bundle import ${JSON.stringify(specifier)} from ${parentPath}`)
}

async function resolvePackageSpecifier(specifier, root) {
  const segments = specifier.split('/')
  const packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  const subpath = specifier.slice(packageName.length).replace(/^\//, '')
  const packageRoot = join(root, 'node_modules', packageName)
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const key = subpath ? `./${subpath}` : '.'
  const target = resolveExport(packageJson.exports?.[key] ?? (subpath ? undefined : packageJson.module ?? packageJson.main))
  if (!target) throw new Error(`No browser import export for ${specifier}`)
  return resolveFile(join(packageRoot, target))
}

function resolveExport(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  return resolveExport(value.import ?? value.browser ?? value.default)
}

function resolveFile(value) {
  if (extname(value)) return value
  return `${value}.js`
}

function isExternalUrl(value) {
  return /^(?:data:|blob:|https?:|file:)/.test(value)
}
