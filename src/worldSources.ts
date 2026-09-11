import type { AnyoPlayerFileMapSource } from './types.js'

export interface AnyoPlayerFolderFile extends Blob {
  readonly name: string
  readonly webkitRelativePath?: string
}

export interface AnyoPlayerFolderSourceOptions {
  /** Explicit world document path after optional common-root stripping. */
  entry?: string
  /** Strip one shared top-level folder produced by directory file inputs. Defaults to true. */
  stripCommonRoot?: boolean
  baseUrl?: string | URL
  integrity?: string
}

function normalizePackagePath(value: string): string {
  const segments = value.replaceAll('\\', '/').split('/').filter(segment => segment && segment !== '.')
  if (segments.length === 0 || segments.some(segment => segment === '..')) {
    throw new TypeError(`Invalid world package path "${value}".`)
  }
  return segments.join('/')
}

function commonRoot(paths: readonly string[]): string | null {
  if (paths.length === 0) return null
  const roots = paths.map(path => path.split('/'))
  if (roots.some(parts => parts.length < 2)) return null
  const root = roots[0]?.[0] ?? null
  return root && roots.every(parts => parts[0] === root) ? root : null
}

/**
 * Converts `<input type="file" webkitdirectory multiple>` results into a Player virtual file map.
 * The utility does not read file contents and does not request browser permissions.
 */
export function createAnyoPlayerFolderSource(
  files: Iterable<AnyoPlayerFolderFile>,
  options: AnyoPlayerFolderSourceOptions = {},
): AnyoPlayerFileMapSource {
  const records = [...files].map(file => {
    if (!(file instanceof Blob) || typeof file.name !== 'string' || !file.name.trim()) {
      throw new TypeError('Folder sources require File-like Blob values with a non-empty name.')
    }
    return {
      file,
      path: normalizePackagePath(file.webkitRelativePath?.trim() || file.name),
    }
  })
  if (records.length === 0) throw new TypeError('Folder sources require at least one file.')

  const root = options.stripCommonRoot === false ? null : commonRoot(records.map(record => record.path))
  const output = new Map<string, Blob>()
  for (const record of records) {
    const path = root ? record.path.slice(root.length + 1) : record.path
    if (!path || output.has(path)) throw new TypeError(`Duplicate or empty world package path "${path}".`)
    output.set(path, record.file)
  }

  let entry = options.entry ? normalizePackagePath(options.entry) : undefined
  if (entry && root && entry.startsWith(`${root}/`)) entry = entry.slice(root.length + 1)
  return {
    files: output,
    ...(entry ? { entry } : {}),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.integrity === undefined ? {} : { integrity: options.integrity }),
  }
}
