export type AssetCrossOrigin = 'anonymous' | 'use-credentials'
export type ScriptFormat = 'module' | 'iife'

export const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'

// The dev styles link is a snapshot of the SSR-collected CSS. It must stay until
// the bundler injected the same styles on the client (server-rendered lazy
// components may still be loading after hydration), and becomes stale after HMR.
// The flag covers listeners that mount after the update; the window event
// reaches them across duplicated copies of this module.
const DEV_STYLES_STALE_EVENT = 'tanstack-router:dev-styles-stale'
let devStylesStale = false

/** @internal Called by the Start client runtime once an HMR update is applied. */
export function markDevStylesStale() {
  devStylesStale = true
  window.dispatchEvent(new Event(DEV_STYLES_STALE_EVENT))
}

/** @internal Runs `callback` once the dev styles are stale, immediately if they already are. */
export function onDevStylesStale(callback: () => void): () => void {
  if (devStylesStale) {
    callback()
    return () => {}
  }
  window.addEventListener(DEV_STYLES_STALE_EVENT, callback, { once: true })
  return () => window.removeEventListener(DEV_STYLES_STALE_EVENT, callback)
}

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
  fetchPriority: 'low'
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
    fetchPriority: 'low',
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

  const seen = new Set<string>()
  for (const tag of tags) {
    const key = JSON.stringify(tag)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    target.push(tag)
  }
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
