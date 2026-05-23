export type AssetCrossOrigin = 'anonymous' | 'use-credentials'
export type ScriptFormat = 'module' | 'iife'

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
  inlineCss?: {
    styles: Record<string, string>
    templates?: Record<
      string,
      {
        strings: Array<string>
        urls: Array<string>
      }
    >
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
    }
  | {
      tag: 'meta' | 'link'
      attrs?: Record<string, any>
      children?: never
    }
  | {
      tag: 'script'
      attrs?: Record<string, any>
      children?: string
    }
  | {
      tag: 'style'
      attrs?: Record<string, any>
      children?: string
      inlineCss?: true
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
