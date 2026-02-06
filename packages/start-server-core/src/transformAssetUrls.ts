import { rootRouteId } from '@tanstack/router-core'

import type {
  Awaitable,
  Manifest,
  RouterManagedTag,
} from '@tanstack/router-core'

export type AssetUrlType = 'modulepreload' | 'stylesheet' | 'clientEntry'

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

export type TransformAssetUrls =
  | string
  | TransformAssetUrlsFn
  | TransformAssetUrlsOptions

export type ResolvedTransformAssetUrlsConfig =
  | {
      type: 'transform'
      transformFn: TransformAssetUrlsFn
      cache: boolean
    }
  | {
      type: 'createTransform'
      createTransform: CreateTransformAssetUrlsFn
      cache: boolean
    }

/**
 * Resolves a TransformAssetUrls value (string prefix, callback, or options
 * object) into a concrete transform function and cache flag.
 */
export function resolveTransformConfig(
  transform: TransformAssetUrls,
): ResolvedTransformAssetUrlsConfig {
  // String shorthand
  if (typeof transform === 'string') {
    const prefix = transform
    return {
      type: 'transform',
      transformFn: ({ url }) => `${prefix}${url}`,
      cache: true,
    }
  }

  // Callback shorthand
  if (typeof transform === 'function') {
    return {
      type: 'transform',
      transformFn: transform,
      cache: true,
    }
  }

  // Options object
  if ('createTransform' in transform && transform.createTransform) {
    return {
      type: 'createTransform',
      createTransform: transform.createTransform,
      cache: transform.cache !== false,
    }
  }

  const transformFn =
    typeof transform.transform === 'string'
      ? ((({ url }: TransformAssetUrlsContext) =>
          `${transform.transform}${url}`) as TransformAssetUrlsFn)
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

/**
 * Applies a URL transform to every asset URL in the manifest and returns a
 * new manifest with a client entry script tag appended to the root route's
 * assets.
 *
 * The source manifest is deep-cloned so the cached original is never mutated.
 */
export function transformManifestUrls(
  source: StartManifestWithClientEntry,
  transformFn: TransformAssetUrlsFn,
  opts?: {
    /** When true, clone the source manifest before mutating it. */
    clone?: boolean
  },
): Promise<Manifest> {
  return (async () => {
    const manifest = opts?.clone
      ? structuredClone(source.manifest)
      : source.manifest

    for (const route of Object.values(manifest.routes)) {
      // Transform preload URLs (modulepreload)
      if (route.preloads) {
        route.preloads = await Promise.all(
          route.preloads.map((url) =>
            Promise.resolve(transformFn({ url, type: 'modulepreload' })),
          ),
        )
      }

      // Transform asset tag URLs
      if (route.assets) {
        for (const asset of route.assets) {
          if (asset.tag === 'link' && asset.attrs?.href) {
            asset.attrs.href = await Promise.resolve(
              transformFn({
                url: asset.attrs.href,
                type: 'stylesheet',
              }),
            )
          }
        }
      }
    }

    // Transform and append the client entry script tag
    const transformedClientEntry = await Promise.resolve(
      transformFn({
        url: source.clientEntry,
        type: 'clientEntry',
      }),
    )

    const rootRoute = manifest.routes[rootRouteId]
    if (rootRoute) {
      rootRoute.assets = rootRoute.assets || []
      rootRoute.assets.push(
        buildClientEntryScriptTag(
          transformedClientEntry,
          source.injectedHeadScripts,
        ),
      )
    }

    return manifest
  })()
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
    ...(baseRootRoute
      ? {
          [rootRouteId]: {
            ...baseRootRoute,
            assets: [...(baseRootRoute.assets || []), scriptTag],
          },
        }
      : {}),
  }

  return { routes }
}
