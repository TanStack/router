import { escapeHtml } from './utils'

export type AssetCrossOrigin = 'anonymous' | 'use-credentials'

export type AssetCrossOriginConfig =
  | AssetCrossOrigin
  | Partial<Record<'modulepreload' | 'stylesheet', AssetCrossOrigin>>

export type ManifestAssetLink =
  | string
  | {
      href: string
      crossOrigin?: AssetCrossOrigin
    }

export function getAssetCrossOrigin(
  assetCrossOrigin: AssetCrossOriginConfig | undefined,
  kind: 'modulepreload' | 'stylesheet',
): AssetCrossOrigin | undefined {
  if (!assetCrossOrigin) {
    return undefined
  }

  if (typeof assetCrossOrigin === 'string') {
    return assetCrossOrigin
  }

  return assetCrossOrigin[kind]
}

export function resolveManifestAssetLink(link: ManifestAssetLink) {
  if (typeof link === 'string') {
    return { href: link, crossOrigin: undefined }
  }

  return link
}

export type Manifest = {
  inlineCss?: {
    styles: Record<string, string>
  }
  routes: Record<
    string,
    {
      filePath?: string
      preloads?: Array<ManifestAssetLink>
      assets?: Array<RouterManagedTag>
    }
  >
}

export type RouterManagedTag =
  | {
      tag: 'title'
      attrs?: Record<string, any>
      children: string
      key?: string
    }
  | {
      tag: 'meta' | 'link'
      attrs?: Record<string, any>
      children?: never
      key?: string
    }
  | {
      tag: 'script'
      attrs?: Record<string, any>
      children?: string
      key?: string
    }
  | {
      tag: 'style'
      attrs?: Record<string, any>
      children?: string
      inlineCss?: true
      key?: string
    }

export function getStylesheetHref(asset: RouterManagedTag) {
  if (asset.tag !== 'link') return undefined

  const rel = asset.attrs?.rel
  const href = asset.attrs?.href
  if (typeof href !== 'string') return undefined

  const relTokens = typeof rel === 'string' ? rel.split(/\s+/) : []
  if (!relTokens.includes('stylesheet')) return undefined

  return href
}

export function isInlinableStylesheet(
  manifest: Manifest | undefined,
  asset: RouterManagedTag,
) {
  const href = getStylesheetHref(asset)
  return !!href && manifest?.inlineCss?.styles[href] !== undefined
}

export function createInlineCssStyleAsset(css: string): RouterManagedTag {
  return {
    tag: 'style',
    attrs: {
      suppressHydrationWarning: true,
    },
    inlineCss: true,
    children: css,
  }
}

export function createInlineCssPlaceholderAsset(): RouterManagedTag {
  return {
    tag: 'style',
    attrs: {
      suppressHydrationWarning: true,
    },
    inlineCss: true,
  }
}

export function uniqBy<T>(arr: Array<T>, fn: (item: T) => string): Array<T> {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const key = fn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function dedupByLastKey<T extends { key?: string }>(
  items: Array<T>,
): Array<T> {
  const lastIndexByKey: Record<string, number> = {}
  for (let i = 0; i < items.length; i++) {
    const k = items[i]!.key
    if (k) lastIndexByKey[k] = i
  }
  return items.filter((item, i) => {
    if (item.key) return lastIndexByKey[item.key] === i
    return true
  })
}

function metaOutputTag(m: any): 'title' | 'script' | 'meta' {
  if (m.title) return 'title'
  if ('script:ld+json' in m) return 'script'
  return 'meta'
}

export function hashTag({ key: _key, ...rest }: RouterManagedTag): string {
  return JSON.stringify(rest)
}

export function buildMetaTags(
  routeMeta: Array<Array<any>>,
  nonce?: string,
): Array<RouterManagedTag> {
  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  const metaByKey: Record<string, true> = {}
  let title: RouterManagedTag | undefined

  for (let i = routeMeta.length - 1; i >= 0; i--) {
    const metas = routeMeta[i]!
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j]
      if (!m) continue

      // Key-based deduplication is scoped per output tag type — a `<title>`,
      // a `<meta>` and a `<script:ld+json>` with the same key all coexist.
      // The mark is set only after a tag is actually committed so that entries
      // which don't contribute a rendered tag — invalid JSON-LD, a parent's
      // title that loses to a child's, etc. — don't reserve the key against
      // later, valid entries.
      const outputTag = metaOutputTag(m)
      const dedupKey = m.key ? `${outputTag}:${m.key}` : null
      if (dedupKey && metaByKey[dedupKey]) continue

      if (m.title) {
        if (!title) {
          title = {
            tag: 'title',
            children: m.title,
            key: m.key,
          }
          if (dedupKey) metaByKey[dedupKey] = true
        }
      } else if ('script:ld+json' in m) {
        // JSON-LD content is HTML-escaped to prevent XSS when injected via
        // innerHTML / dangerouslySetInnerHTML.
        try {
          const json = JSON.stringify(m['script:ld+json'])
          resultMeta.push({
            tag: 'script',
            attrs: { type: 'application/ld+json', nonce },
            children: escapeHtml(json),
            key: m.key,
          })
          if (dedupKey) metaByKey[dedupKey] = true
        } catch {
          // Skip invalid JSON-LD objects
        }
      } else {
        const attribute = m.name ?? m.property
        if (attribute) {
          if (metaByAttribute[attribute]) continue
          metaByAttribute[attribute] = true
        }
        const { key, ...attrs } = m
        resultMeta.push({
          tag: 'meta',
          attrs: { ...attrs, nonce },
          key,
        })
        if (dedupKey) metaByKey[dedupKey] = true
      }
    }
  }

  if (title) resultMeta.push(title)

  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: { property: 'csp-nonce', content: nonce },
    })
  }

  resultMeta.reverse()
  return resultMeta
}
