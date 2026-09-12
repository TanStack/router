export type AssetCrossOrigin = 'anonymous' | 'use-credentials'
export type ScriptFormat = 'module' | 'iife'

export const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'

export type AssetCrossOriginConfig =
  | AssetCrossOrigin
  | Partial<Record<'script' | 'stylesheet', AssetCrossOrigin>>

export type ManifestAssetLink =
  | string
  | {
      href: string
      crossOrigin?: AssetCrossOrigin
    }

export function getAssetCrossOrigin(
  assetCrossOrigin: AssetCrossOriginConfig | undefined,
  kind: 'script' | 'stylesheet',
): AssetCrossOrigin | undefined {
  if (!assetCrossOrigin) {
    return undefined
  }

  if (typeof assetCrossOrigin === 'string') {
    return assetCrossOrigin
  }

  return assetCrossOrigin[kind]
}

export function getManifestScriptFormat(
  manifest: { scriptFormat?: ScriptFormat } | undefined,
): ScriptFormat {
  return manifest?.scriptFormat ?? 'module'
}

export function getScriptPreloadAttrs(
  manifest: { scriptFormat?: ScriptFormat } | undefined,
  link: ManifestAssetLink,
  assetCrossOrigin?: AssetCrossOriginConfig,
): {
  rel: 'modulepreload' | 'preload'
  as?: 'script'
  href: string
  crossOrigin?: AssetCrossOrigin
} {
  const preloadLink = resolveManifestAssetLink(link)
  const crossOrigin =
    getAssetCrossOrigin(assetCrossOrigin, 'script') ?? preloadLink.crossOrigin

  return {
    ...(getManifestScriptFormat(manifest) === 'iife'
      ? { rel: 'preload', as: 'script' }
      : { rel: 'modulepreload' }),
    href: preloadLink.href,
    ...(crossOrigin ? { crossOrigin } : {}),
  }
}

export function resolveManifestAssetLink(link: ManifestAssetLink) {
  if (typeof link === 'string') {
    return { href: link, crossOrigin: undefined }
  }

  return link
}

export type Manifest = {
  scriptFormat?: ScriptFormat
  inlineStyle?: ManifestInlineCss
  routes: Record<string, ManifestRoute>
}

export type ServerManifest = {
  scriptFormat?: ScriptFormat
  inlineCss?: ServerManifestInlineCss
  routes: Record<string, ServerManifestRoute>
}

export type ServerManifestInlineCss = {
  styles: Record<string, string>
  templates?: Record<string, InlineCssTemplate>
}

export type InlineCssTemplate = {
  strings: Array<string>
  urls: Array<string>
}

export type ManifestRoute = {
  filePath?: string
  preloads?: Array<ManifestAssetLink>
  scripts?: Array<ManifestScript>
  css?: Array<ManifestCssLink>
}

export type ServerManifestRoute = ManifestRoute

export type ManifestRouteAssets = Pick<
  ManifestRoute,
  'preloads' | 'scripts' | 'css'
>

export type RouterManagedTitleTag = {
  tag: 'title'
  attrs?: Record<string, any>
  children: string
}

export type RouterManagedMetaTag = {
  tag: 'meta'
  attrs?: Record<string, any>
  children?: never
}

export type RouterManagedLinkTag = {
  tag: 'link'
  attrs?: Record<string, any>
  children?: never
}

export type RouterManagedScriptTag = {
  tag: 'script'
  attrs?: Record<string, any>
  children?: string
}

export type ManifestScript = Omit<RouterManagedScriptTag, 'tag'>

export type RouterManagedStyleTag = {
  tag: 'style'
  attrs?: Record<string, any>
  children?: string
  inlineCss?: true
}

export type RouterManagedTag =
  | RouterManagedTitleTag
  | RouterManagedMetaTag
  | RouterManagedLinkTag
  | RouterManagedScriptTag
  | RouterManagedStyleTag

/**
 * `<link>` rels that are unique by nature: at most one such tag is valid in the
 * document. For these, a child route's tag must override its parent's rather
 * than being concatenated, mirroring how meta tags dedupe by name/property.
 * Deliberately narrow — rels like `stylesheet`, `preload`, `icon` and
 * `alternate` legitimately repeat and must not be collapsed.
 */
const UNIQUE_LINK_RELS = new Set<string>(['canonical'])
const LINK_REL_TOKEN_SEPARATOR = /[\t\n\f\r ]+/

function uniqueLinkRelKey(tag: RouterManagedTag): string | undefined {
  if (tag.tag !== 'link') {
    return undefined
  }
  const rel = tag.attrs?.rel
  const uniqueRel =
    typeof rel === 'string'
      ? rel
          .toLowerCase()
          .split(LINK_REL_TOKEN_SEPARATOR)
          .find((token) => UNIQUE_LINK_RELS.has(token))
      : undefined
  return uniqueRel === undefined ? undefined : `link:${uniqueRel}`
}

export function appendUniqueUserTags(
  target: Array<RouterManagedTag>,
  tags: Array<RouterManagedTag>,
) {
  if (tags.length === 0) {
    return
  }

  if (tags.length === 1) {
    target.push(tags[0]!)
    return
  }

  // Tags arrive parent-first, so the last occurrence of a unique-by-nature
  // link rel is the deepest (child) match and is the one that should win.
  const lastUniqueRelIndex = new Map<string, number>()
  tags.forEach((tag, index) => {
    const relKey = uniqueLinkRelKey(tag)
    if (relKey !== undefined) {
      lastUniqueRelIndex.set(relKey, index)
    }
  })

  const seen = new Set<string>()
  tags.forEach((tag, index) => {
    const relKey = uniqueLinkRelKey(tag)
    if (relKey !== undefined) {
      if (lastUniqueRelIndex.get(relKey) === index) {
        target.push(tag)
      }
      return
    }
    const key = JSON.stringify(tag)
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    target.push(tag)
  })
}

export type ManifestCssLink =
  | string
  | {
      href: string
      crossOrigin?: AssetCrossOrigin
      [DEV_STYLES_ATTR]?: true
    }

export type ManifestInlineCss = {
  attrs?: Record<string, any>
  children?: string
}

export type RouterManagedInlineCssTag = RouterManagedStyleTag & {
  inlineCss: true
}

export function getStylesheetHref(asset: ManifestCssLink) {
  return resolveManifestCssLink(asset).href
}

export function resolveManifestCssLink(link: ManifestCssLink) {
  if (typeof link === 'string') {
    return { href: link, crossOrigin: undefined }
  }

  return link
}

export function createInlineCssStyleAsset(css: string): ManifestInlineCss {
  return {
    attrs: {
      suppressHydrationWarning: true,
    },
    children: css,
  }
}

export function createInlineCssPlaceholderAsset(): ManifestInlineCss {
  return {
    attrs: {
      suppressHydrationWarning: true,
    },
  }
}
