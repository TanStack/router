import { resolveManifestAssetLink, rootRouteId } from '@tanstack/router-core'

import type {
  AssetCrossOrigin,
  Awaitable,
  Manifest,
  ManifestAssetLink,
  RouterManagedTag,
} from '@tanstack/router-core'

export type { AssetCrossOrigin }

export type TransformAssetKind = 'modulepreload' | 'stylesheet' | 'clientEntry'

type TransformAssetsShorthandCrossOriginKind = Exclude<
  TransformAssetKind,
  'clientEntry'
>

export type AssetUrlType = TransformAssetKind

export interface TransformAssetsContext {
  url: string
  kind: TransformAssetKind
}

export type TransformAssetResult =
  | string
  | {
      href: string
      crossOrigin?: AssetCrossOrigin
    }

export type TransformAssetsFn = (
  context: TransformAssetsContext,
) => Awaitable<TransformAssetResult>

export interface TransformAssetUrlsContext {
  url: string
  type: AssetUrlType
}

export type TransformAssetUrlsFn = (
  context: TransformAssetUrlsContext,
) => Awaitable<string>

export type CreateTransformAssetUrlsContext =
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

/**
 * Async factory that runs once per manifest computation and returns the
 * per-asset transform.
 */
export type CreateTransformAssetUrlsFn = (
  ctx: CreateTransformAssetUrlsContext,
) => Awaitable<TransformAssetUrlsFn>

export type CreateTransformAssetsFn = (
  ctx: CreateTransformAssetUrlsContext,
) => Awaitable<TransformAssetsFn>

type TransformAssetUrlsOptionsBase = {
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

export type TransformAssetUrlsOptions =
  | (TransformAssetUrlsOptionsBase & {
      /**
       * The transform to apply to asset URLs. Can be a string prefix or a callback.
       *
       * **String** — prepended to every asset URL.
       * **Callback** — receives `{ url, type }` and returns a new URL.
       */
      transform: string | TransformAssetUrlsFn
      createTransform?: never
    })
  | (TransformAssetUrlsOptionsBase & {
      /**
       * Create a per-asset transform function.
       *
       * This factory runs once per manifest computation (per request when
       * `cache: false`, or once per server when `cache: true`). It can do async
       * setup work (fetch config, read from a KV, etc.) and return a fast
       * per-asset transformer.
       */
      createTransform: CreateTransformAssetUrlsFn
      transform?: never
    })

export type TransformAssetsOptions =
  | (TransformAssetUrlsOptionsBase & {
      transform: string | TransformAssetsFn
      createTransform?: never
    })
  | (TransformAssetUrlsOptionsBase & {
      createTransform: CreateTransformAssetsFn
      transform?: never
    })

export type TransformAssetUrls =
  | string
  | TransformAssetUrlsFn
  | TransformAssetUrlsOptions

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

let hasWarnedAboutDeprecatedTransformAssetUrls = false

export function warnDeprecatedTransformAssetUrls() {
  if (
    (process.env.NODE_ENV === 'development' ||
      process.env.TSS_DEV_SERVER === 'true') &&
    !hasWarnedAboutDeprecatedTransformAssetUrls
  ) {
    hasWarnedAboutDeprecatedTransformAssetUrls = true
    console.warn(
      '[TanStack Start] `transformAssetUrls` is deprecated. Use `transformAssets` instead.',
    )
  }
}

function normalizeTransformAssetResult(
  result: TransformAssetResult,
): Exclude<TransformAssetResult, string> {
  if (typeof result === 'string') {
    return { href: result }
  }

  return result
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

        if (kind === 'clientEntry') {
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

export function adaptTransformAssetUrlsToTransformAssets(
  transformFn: TransformAssetUrlsFn,
): TransformAssetsFn {
  return async ({ url, kind }) => ({
    href: await transformFn({ url, type: kind }),
  })
}

export function adaptTransformAssetUrlsConfigToTransformAssets(
  transform: TransformAssetUrls,
): TransformAssets {
  warnDeprecatedTransformAssetUrls()

  if (typeof transform === 'string') {
    return transform
  }

  if (typeof transform === 'function') {
    return adaptTransformAssetUrlsToTransformAssets(transform)
  }

  if ('createTransform' in transform && transform.createTransform) {
    return {
      createTransform: async (ctx: CreateTransformAssetUrlsContext) =>
        adaptTransformAssetUrlsToTransformAssets(
          await transform.createTransform(ctx),
        ),
      cache: transform.cache,
      warmup: transform.warmup,
    }
  }

  return {
    transform:
      typeof transform.transform === 'string'
        ? transform.transform
        : adaptTransformAssetUrlsToTransformAssets(transform.transform),
    cache: transform.cache,
    warmup: transform.warmup,
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
  },
): Promise<Manifest> {
  const manifest = structuredClone(source.manifest)

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

    if (route.assets && !source.manifest.inlineCss) {
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
 * URL transforms. Used when no transformAssetUrls option is provided.
 *
 * Returns a new manifest object so the cached base manifest is never mutated.
 */
export function buildManifestWithClientEntry(
  source: StartManifestWithClientEntry,
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

  return { inlineCss: source.manifest.inlineCss, routes }
}
