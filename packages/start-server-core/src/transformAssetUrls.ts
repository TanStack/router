import { resolveManifestAssetLink, rootRouteId } from '@tanstack/router-core'

import type {
  AssetCrossOrigin,
  Awaitable,
  Manifest,
  ManifestAssetLink,
  RouterManagedTag,
} from '@tanstack/router-core'

export type { AssetCrossOrigin }

export type TransformAssetsContext =
  | {
      url: string
      kind: 'modulepreload'
    }
  | {
      url: string
      kind: 'stylesheet'
    }
  | {
      url: string
      kind: 'clientEntry'
    }
  | {
      url: string
      kind: 'css-url'
      stylesheetHref: string
    }

export type TransformAssetKind = TransformAssetsContext['kind']

type TransformAssetsShorthandCrossOriginKind = Exclude<
  TransformAssetKind,
  'clientEntry' | 'css-url'
>

export type TransformAssetResult =
  | string
  | {
      href: string
      crossOrigin?: AssetCrossOrigin
    }

export type TransformAssetsFn = (
  context: TransformAssetsContext,
) => Awaitable<TransformAssetResult>

export type CreateTransformAssetsContext =
  | {
      /** True when the server is computing the cached manifest during startup warmup. */
      warmup: true
    }
  | {
      /**
       * The current Request.
       *
       * Only available during request handling (i.e. when `warmup: false`).
       */
      request: Request
      /** False when transforming URLs as part of request handling. */
      warmup: false
    }

export type CreateTransformAssetsFn = (
  ctx: CreateTransformAssetsContext,
) => Awaitable<TransformAssetsFn>

type TransformAssetsOptionsBase = {
  /**
   * Whether to cache the transformed manifest after the first request.
   *
   * When `true` (default), the transform runs once on the first request and
   * the resulting manifest is reused for all subsequent requests in production.
   *
   * Set to `false` for per-request transforms (e.g. geo-routing to different
   * CDNs based on request headers).
   *
   * @default true
   */
  cache?: boolean

  /**
   * When `true`, warms up the cached transformed manifest in the background when
   * the server starts (production only).
   *
   * This can reduce latency for the first request when `cache` is `true`.
   * Has no effect when `cache: false` (per-request transforms) or in dev mode.
   *
   * @default false
   */
  warmup?: boolean
}

export type TransformAssetsOptions =
  | (TransformAssetsOptionsBase & {
      transform: string | TransformAssetsFn
      createTransform?: never
    })
  | (TransformAssetsOptionsBase & {
      createTransform: CreateTransformAssetsFn
      transform?: never
    })

/**
 * Per-kind crossOrigin configuration for the object shorthand.
 *
 * Accepts either a single value applied to all asset kinds, or a per-kind
 * record (matching `HeadContent`'s `assetCrossOrigin` shape):
 *
 * ```ts
 * // All assets get the same value
 * crossOrigin: 'anonymous'
 *
 * // Different values per kind
 * crossOrigin: { modulepreload: 'anonymous', stylesheet: 'use-credentials' }
 * ```
 */
export type TransformAssetsCrossOriginConfig =
  | AssetCrossOrigin
  | Partial<Record<TransformAssetsShorthandCrossOriginKind, AssetCrossOrigin>>

/**
 * Object shorthand for `transformAssets`. Combines a URL prefix with optional
 * per-asset `crossOrigin` without needing a callback:
 *
 * ```ts
 * transformAssets: {
 *   prefix: 'https://cdn.example.com',
 *   crossOrigin: 'anonymous',
 * }
 * ```
 */
export interface TransformAssetsObjectShorthand {
  /** URL prefix prepended to every asset URL. */
  prefix: string
  /**
   * Optional crossOrigin attribute applied to manifest-managed `<link>` assets.
   *
   * Accepts a single value or a per-kind record.
   */
  crossOrigin?: TransformAssetsCrossOriginConfig
}

export type TransformAssets =
  | string
  | TransformAssetsFn
  | TransformAssetsObjectShorthand
  | TransformAssetsOptions

export type ResolvedTransformAssetsConfig =
  | {
      type: 'transform'
      transformFn: TransformAssetsFn
      cache: boolean
    }
  | {
      type: 'createTransform'
      createTransform: CreateTransformAssetsFn
      cache: boolean
    }

function normalizeTransformAssetResult(
  result: TransformAssetResult,
): Exclude<TransformAssetResult, string> {
  if (typeof result === 'string') {
    return { href: result }
  }

  return result
}

function escapeCssString(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
    .replace(/\f/g, '\\c ')
}

async function transformInlineCssTemplate(options: {
  stylesheetHref: string
  template: { strings: Array<string>; urls: Array<string> }
  transformFn: TransformAssetsFn
}) {
  const { strings, urls } = options.template

  if (strings.length !== urls.length + 1) {
    throw new Error(
      `TanStack Start inlineCss template for ${options.stylesheetHref} is invalid`,
    )
  }

  let css = strings[0]!

  for (let index = 0; index < urls.length; index++) {
    const transformed = normalizeTransformAssetResult(
      await options.transformFn({
        kind: 'css-url',
        url: urls[index]!,
        stylesheetHref: options.stylesheetHref,
      }),
    )

    css += escapeCssString(transformed.href) + strings[index + 1]!
  }

  return css
}

async function transformInlineCssStyles(
  inlineCss: NonNullable<Manifest['inlineCss']>,
  transformFn: TransformAssetsFn,
) {
  const transformedStyles: Record<string, string> = {}

  const transformedEntries = await Promise.all(
    Object.entries(inlineCss.styles).map(async ([stylesheetHref, css]) => {
      const template = inlineCss.templates?.[stylesheetHref]
      return [
        stylesheetHref,
        template
          ? await transformInlineCssTemplate({
              stylesheetHref,
              template,
              transformFn,
            })
          : css,
      ] as const
    }),
  )

  for (const [stylesheetHref, css] of transformedEntries) {
    transformedStyles[stylesheetHref] = css
  }

  return {
    styles: transformedStyles,
    ...(inlineCss.templates ? { templates: inlineCss.templates } : {}),
  }
}

function resolveTransformAssetsCrossOrigin(
  config: TransformAssetsCrossOriginConfig | undefined,
  kind: TransformAssetsShorthandCrossOriginKind,
): AssetCrossOrigin | undefined {
  if (!config) return undefined
  if (typeof config === 'string') return config

  return config[kind]
}

function isObjectShorthand(
  transform: TransformAssetsObjectShorthand | TransformAssetsOptions,
): transform is TransformAssetsObjectShorthand {
  return 'prefix' in transform
}

export function resolveTransformAssetsConfig(
  transform: TransformAssets,
): ResolvedTransformAssetsConfig {
  if (typeof transform === 'string') {
    const prefix = transform
    return {
      type: 'transform',
      transformFn: ({ url }) => ({ href: `${prefix}${url}` }),
      cache: true,
    }
  }

  if (typeof transform === 'function') {
    return {
      type: 'transform',
      transformFn: transform,
      cache: true,
    }
  }

  // Object shorthand: { prefix, crossOrigin? }
  if (isObjectShorthand(transform)) {
    const { prefix, crossOrigin } = transform

    return {
      type: 'transform',
      transformFn: ({ url, kind }) => {
        const href = `${prefix}${url}`

        if (kind === 'clientEntry' || kind === 'css-url') {
          return { href }
        }

        const co = resolveTransformAssetsCrossOrigin(crossOrigin, kind)
        return co ? { href, crossOrigin: co } : { href }
      },
      cache: true,
    }
  }

  if ('createTransform' in transform && transform.createTransform) {
    return {
      type: 'createTransform',
      createTransform: transform.createTransform,
      cache: transform.cache !== false,
    }
  }

  const transformFn =
    typeof transform.transform === 'string'
      ? ((({ url }: TransformAssetsContext) => ({
          href: `${transform.transform}${url}`,
        })) as TransformAssetsFn)
      : transform.transform

  return {
    type: 'transform',
    transformFn,
    cache: transform.cache !== false,
  }
}

export interface StartManifestWithClientEntry {
  manifest: Manifest
  clientEntry: string
  /** Script content prepended before the client entry import (dev only) */
  injectedHeadScripts?: string
}

/**
 * Builds the client entry `<script>` tag from a (possibly transformed) client
 * entry URL and optional injected head scripts.
 */
export function buildClientEntryScriptTag(
  clientEntry: string,
  injectedHeadScripts?: string,
): RouterManagedTag {
  const clientEntryLiteral = JSON.stringify(clientEntry)
  let script = `import(${clientEntryLiteral})`
  if (injectedHeadScripts) {
    script = `${injectedHeadScripts};${script}`
  }
  return {
    tag: 'script',
    attrs: {
      type: 'module',
      async: true,
    },
    children: script,
  }
}

function assignManifestAssetLink(
  link: ManifestAssetLink,
  next: { href: string; crossOrigin?: AssetCrossOrigin },
): ManifestAssetLink {
  if (typeof link === 'string') {
    return next.crossOrigin ? next : next.href
  }

  return next.crossOrigin ? next : { href: next.href }
}

export async function transformManifestAssets(
  source: StartManifestWithClientEntry,
  transformFn: TransformAssetsFn,
  _opts?: {
    clone?: boolean
    inlineCss?: boolean
  },
): Promise<Manifest> {
  const manifest = structuredClone(source.manifest)
  const inlineCssEnabled = _opts?.inlineCss !== false

  if (!inlineCssEnabled) {
    delete manifest.inlineCss
  } else if (manifest.inlineCss) {
    manifest.inlineCss = await transformInlineCssStyles(
      manifest.inlineCss,
      transformFn,
    )
  }

  for (const route of Object.values(manifest.routes)) {
    if (route.preloads) {
      route.preloads = await Promise.all(
        route.preloads.map(async (link) => {
          const resolved = resolveManifestAssetLink(link)
          const result = normalizeTransformAssetResult(
            await transformFn({
              url: resolved.href,
              kind: 'modulepreload',
            }),
          )

          return assignManifestAssetLink(link, {
            href: result.href,
            crossOrigin: result.crossOrigin,
          })
        }),
      )
    }

    if (route.assets && !manifest.inlineCss) {
      for (const asset of route.assets) {
        if (asset.tag === 'link' && asset.attrs?.href) {
          const rel = asset.attrs.rel
          const relTokens = typeof rel === 'string' ? rel.split(/\s+/) : []

          if (!relTokens.includes('stylesheet')) {
            continue
          }

          const result = normalizeTransformAssetResult(
            await transformFn({
              url: asset.attrs.href,
              kind: 'stylesheet',
            }),
          )

          asset.attrs.href = result.href
          if (result.crossOrigin) {
            asset.attrs.crossOrigin = result.crossOrigin
          } else {
            delete asset.attrs.crossOrigin
          }
        }
      }
    }
  }

  const transformedClientEntry = normalizeTransformAssetResult(
    await transformFn({
      url: source.clientEntry,
      kind: 'clientEntry',
    }),
  )

  const rootRoute = (manifest.routes[rootRouteId] =
    manifest.routes[rootRouteId] || {})
  rootRoute.assets = rootRoute.assets || []
  rootRoute.assets.push(
    buildClientEntryScriptTag(
      transformedClientEntry.href,
      source.injectedHeadScripts,
    ),
  )

  return manifest
}

/**
 * Builds a final Manifest from a StartManifestWithClientEntry without any
 * URL transforms. Used when no transformAssets option is provided.
 *
 * Returns a new manifest object so the cached base manifest is never mutated.
 */
export function buildManifestWithClientEntry(
  source: StartManifestWithClientEntry,
  opts?: { inlineCss?: boolean },
): Manifest {
  const scriptTag = buildClientEntryScriptTag(
    source.clientEntry,
    source.injectedHeadScripts,
  )

  const baseRootRoute = source.manifest.routes[rootRouteId]
  const routes = {
    ...source.manifest.routes,
    [rootRouteId]: {
      ...baseRootRoute,
      assets: [...(baseRootRoute?.assets || []), scriptTag],
    },
  }

  return {
    ...(opts?.inlineCss === false
      ? {}
      : { inlineCss: structuredClone(source.manifest.inlineCss) }),
    routes,
  }
}
