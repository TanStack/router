import type { MetaDescriptor } from './types'

/**
 * Merge strategy for handling duplicate meta tags
 */
export type MergeStrategy = 'last-wins' | 'first-wins' | 'append'

/**
 * Options for mergeMeta
 */
export interface MergeOptions {
  /**
   * How to handle duplicates
   * - 'last-wins': Later values override earlier ones (default)
   * - 'first-wins': Keep first occurrence
   * - 'append': Keep all values, no deduplication
   */
  strategy?: MergeStrategy
}

/**
 * Merges multiple meta arrays with intelligent deduplication.
 *
 * By default, later values override earlier ones for the same key.
 * Keys are determined by:
 * - title: 'title'
 * - name: 'name:${name}'
 * - property: 'property:${property}'
 * - canonical link: 'link:canonical'
 * - JSON-LD: 'jsonld:${@type}'
 *
 * @example
 * ```ts
 * import { createMeta, mergeMeta } from '@tanstack/meta'
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * // Merge parent route meta with child route meta
 * head: ({ matches }) => {
 *   const parentMeta = matches[0]?.meta ?? []
 *   return {
 *     meta: mergeMeta(
 *       parentMeta,
 *       createMeta({ title: 'Child Page', description: 'Child desc' }),
 *     ),
 *   }
 * }
 * ```
 */
export function mergeMeta(
  ...sources: Array<Array<MetaDescriptor> | undefined | null>
): Array<MetaDescriptor> {
  return mergeMetaWith({}, ...sources)
}

/**
 * Merges meta arrays with custom options
 *
 * @example
 * ```ts
 * // Keep first occurrence instead of last
 * mergeMetaWith({ strategy: 'first-wins' }, baseMeta, overrideMeta)
 *
 * // Keep all values without deduplication
 * mergeMetaWith({ strategy: 'append' }, meta1, meta2)
 * ```
 */
export function mergeMetaWith(
  options: MergeOptions,
  ...sources: Array<Array<MetaDescriptor> | undefined | null>
): Array<MetaDescriptor> {
  const { strategy = 'last-wins' } = options

  if (strategy === 'append') {
    return sources.filter(Boolean).flat() as Array<MetaDescriptor>
  }

  const metaByKey = new Map<string, MetaDescriptor>()
  const orderedKeys: Array<string> = []

  for (const source of sources) {
    if (!source) continue

    for (const descriptor of source) {
      const key = getMetaKey(descriptor)

      if (strategy === 'first-wins' && metaByKey.has(key)) {
        continue
      }

      if (!metaByKey.has(key)) {
        orderedKeys.push(key)
      }

      metaByKey.set(key, descriptor)
    }
  }

  return orderedKeys.map((key) => metaByKey.get(key)!)
}

/**
 * Gets a unique key for a meta descriptor for deduplication
 */
function getMetaKey(descriptor: MetaDescriptor): string {
  if ('charSet' in descriptor) return 'charset'
  if ('title' in descriptor) return 'title'
  if ('name' in descriptor && 'content' in descriptor)
    return `name:${(descriptor as any).name}`
  if ('property' in descriptor && 'content' in descriptor)
    return `property:${(descriptor as any).property}`
  if ('httpEquiv' in descriptor) return `http-equiv:${(descriptor as any).httpEquiv}`
  if ('script:ld+json' in descriptor) {
    const ldJson = (descriptor as any)['script:ld+json']
    if (ldJson['@id']) return `jsonld:${ldJson['@id']}`
    if (ldJson['@type']) return `jsonld:${ldJson['@type']}`
    if (ldJson['@graph']) return 'jsonld:graph'
    return `jsonld:${JSON.stringify(ldJson)}`
  }
  if ('tagName' in descriptor) {
    const tagName = (descriptor as any).tagName
    if (tagName === 'link' && (descriptor as any).rel === 'canonical')
      return 'link:canonical'
    if (tagName === 'link' && (descriptor as any).rel === 'alternate') {
      const hreflang = (descriptor as any).hreflang || ''
      return `link:alternate:${hreflang}`
    }
    return `${tagName}:${JSON.stringify(descriptor)}`
  }

  return JSON.stringify(descriptor)
}

/**
 * Removes specific meta tags from an array by their keys
 *
 * @example
 * ```ts
 * // Remove og:image from parent meta
 * const filtered = excludeMeta(parentMeta, ['og:image', 'twitter:image'])
 * ```
 */
export function excludeMeta(
  meta: Array<MetaDescriptor>,
  keys: Array<string>,
): Array<MetaDescriptor> {
  const keySet = new Set(keys.map(normalizeKey))
  return meta.filter((m) => !keySet.has(getMetaKey(m)))
}

/**
 * Picks specific meta tags from an array by their keys
 *
 * @example
 * ```ts
 * // Keep only title and description
 * const picked = pickMeta(parentMeta, ['title', 'description'])
 * ```
 */
export function pickMeta(
  meta: Array<MetaDescriptor>,
  keys: Array<string>,
): Array<MetaDescriptor> {
  const keySet = new Set(keys.map(normalizeKey))
  return meta.filter((m) => keySet.has(getMetaKey(m)))
}

/**
 * Normalizes a user-provided key to match our internal key format
 */
function normalizeKey(key: string): string {
  if (key === 'title' || key === 'charset' || key === 'description')
    return key === 'description' ? 'name:description' : key
  if (key.startsWith('og:')) return `property:${key}`
  if (key.startsWith('twitter:')) return `name:${key}`
  if (key.startsWith('article:')) return `property:${key}`
  return key
}
