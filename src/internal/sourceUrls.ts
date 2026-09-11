import type { ComponentDefinition, EntityDefinition, WorldDocument } from '@blcklab/anyo'

export type PlayerResourceUrlResolver = (value: string) => string

function resolveComponent(component: ComponentDefinition, resolveUrl: PlayerResourceUrlResolver): void {
  const record = component as Record<string, unknown>
  if (typeof record.src === 'string') record.src = resolveUrl(record.src)

  const levels = Array.isArray(record.levels)
    ? record.levels
    : Array.isArray(record.lod)
      ? record.lod
      : undefined
  if (!levels) return

  for (const entry of levels) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const item = entry as Record<string, unknown>
    if (typeof item.src === 'string') item.src = resolveUrl(item.src)
  }
}

function resolveEntity(entity: EntityDefinition, resolveUrl: PlayerResourceUrlResolver): void {
  if (typeof entity.src === 'string') entity.src = resolveUrl(entity.src)
  if (entity.audio) entity.audio.src = resolveUrl(entity.audio.src)
  for (const entry of entity.lod ?? []) if (entry.src) entry.src = resolveUrl(entry.src)
  for (const component of entity.components ?? []) resolveComponent(component, resolveUrl)

  const surface = entity.webSurface
  if (surface?.source.type === 'url') {
    surface.source.url = resolveUrl(surface.source.url)
  } else if (surface?.source.type === 'snapshot') {
    surface.source.image = resolveUrl(surface.source.image)
    if (surface.source.href) surface.source.href = resolveUrl(surface.source.href)
  }
  if (surface?.fallback) {
    surface.fallback.image = resolveUrl(surface.fallback.image)
    if (surface.fallback.href) surface.fallback.href = resolveUrl(surface.fallback.href)
  }

  for (const child of entity.children ?? []) resolveEntity(child, resolveUrl)
}

export function resolveDocumentResourceUrlsWith(
  document: WorldDocument,
  resolver: PlayerResourceUrlResolver,
): WorldDocument {
  const copy = structuredClone(document)
  for (const asset of Object.values(copy.assets ?? {})) {
    if (typeof asset.src === 'string') asset.src = resolver(asset.src)
    for (const entry of asset.lod ?? []) if (entry.src) entry.src = resolver(entry.src)
  }
  for (const entity of copy.entities ?? []) resolveEntity(entity, resolver)
  for (const prefab of Object.values(copy.prefabs ?? {})) resolveEntity(prefab as EntityDefinition, resolver)
  for (const floor of copy.building?.floors ?? []) {
    for (const room of floor.rooms) for (const entity of room.entities ?? []) resolveEntity(entity, resolver)
  }
  return copy
}

/** Absolutizes public Anyo resource URL fields relative to the world document. */
export function resolveDocumentResourceUrls(document: WorldDocument, documentUrl: string): WorldDocument {
  const baseUrl = new URL('.', documentUrl).href
  return resolveDocumentResourceUrlsWith(document, value => {
    try { return new URL(value, baseUrl).href } catch { return value }
  })
}
