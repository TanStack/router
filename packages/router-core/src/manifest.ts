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
