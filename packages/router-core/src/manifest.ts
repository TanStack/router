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
    }
