import {
  buildManifest,
  resolveTransformAssetsConfig,
  transformManifestAssets,
} from './transformAssetUrls'
import { getStaticInlineCss, resolveInlineCssForRequest } from './inlineCss'
import type { ServerManifest } from '@tanstack/router-core'
import type { HandlerInlineCssOption } from './inlineCss'
import type {
  CreateTransformAssetsContext,
  TransformAssets,
  TransformAssetsFn,
} from './transformAssetUrls'

export type { HandlerInlineCssOption, TransformAssets }

export interface FinalManifestOptions {
  /**
   * Controls whether Start inlines build-collected CSS by default at runtime.
   *
   * This only has an effect when the build was created with
   * `server.build.inlineCss` enabled. Pass a callback to decide per request.
   * `handler(request, { inlineCss })` overrides this value for that request.
   *
   * @default true
   */
  inlineCss?: HandlerInlineCssOption
  /**
   * Transform manifest-managed asset URLs and attributes at runtime, e.g. to
   * prepend a CDN prefix.
   *
   * This covers JS preloads, manifest script tags, CSS links, and URLs inside
   * build-collected inline CSS. Asset imports used directly in
   * components should be handled by the bundler instead.
   */
  transformAssets?: TransformAssets
}

type FinalManifestCacheKey = 'inline-css' | 'linked-css'
// An entry holds the pending manifest, then the manifest itself once it
// resolves, so later requests read it without waiting.
type FinalManifestCache = Map<
  FinalManifestCacheKey,
  ServerManifest | Promise<ServerManifest>
>
export type GetBaseManifest = () => Promise<ServerManifest>

export interface FinalManifestRequestOptions {
  request: Request
  requestInlineCss: boolean | undefined
  getBaseManifest: GetBaseManifest
}

interface FinalManifestTransformResolver {
  cache: boolean
  warmup: boolean
  getTransformFn: (
    ctx: CreateTransformAssetsContext,
  ) => Promise<TransformAssetsFn | undefined>
  clearCachedCreateTransform: () => void
}

export interface FinalManifestResolver {
  warmup: (opts: {
    getBaseManifest: GetBaseManifest
  }) => Promise<ServerManifest> | undefined
  resolveCached: (
    opts: FinalManifestRequestOptions,
  ) => ServerManifest | Promise<ServerManifest>
  resolveUncached: (
    opts: FinalManifestRequestOptions,
  ) => Promise<ServerManifest>
}

export function createCachedBaseManifestLoader(
  loadBaseManifest: GetBaseManifest,
): GetBaseManifest {
  let baseManifestPromise: Promise<ServerManifest> | undefined

  return () => {
    if (!baseManifestPromise) {
      baseManifestPromise = loadBaseManifest().catch((error) => {
        baseManifestPromise = undefined
        throw error
      })
    }

    return baseManifestPromise
  }
}

function createFinalManifestTransformResolver(
  transformAssets: TransformAssets | undefined,
  opts: { cacheCreateTransform: boolean },
): FinalManifestTransformResolver {
  const transformConfig =
    transformAssets !== undefined
      ? resolveTransformAssetsConfig(transformAssets)
      : undefined
  const cache = transformConfig ? transformConfig.cache : true
  const warmup =
    !!transformAssets &&
    typeof transformAssets === 'object' &&
    'warmup' in transformAssets &&
    transformAssets.warmup === true

  let cachedCreateTransformPromise: Promise<TransformAssetsFn> | undefined

  const clearCachedCreateTransform = () => {
    cachedCreateTransformPromise = undefined
  }

  return {
    cache,
    warmup,
    clearCachedCreateTransform,
    getTransformFn: async (ctx) => {
      if (!transformConfig) return undefined

      if (transformConfig.type !== 'createTransform') {
        return transformConfig.transformFn
      }

      if (!cache || !opts.cacheCreateTransform) {
        return transformConfig.createTransform(ctx)
      }

      if (!cachedCreateTransformPromise) {
        cachedCreateTransformPromise = Promise.resolve(
          transformConfig.createTransform(ctx),
        ).catch((error) => {
          clearCachedCreateTransform()
          throw error
        })
      }

      return cachedCreateTransformPromise
    },
  }
}

export function createFinalManifestResolver(
  opts: FinalManifestOptions & { cacheCreateTransform: boolean },
): FinalManifestResolver {
  const finalManifestCache: FinalManifestCache = new Map()
  const transformResolver = createFinalManifestTransformResolver(
    opts.transformAssets,
    { cacheCreateTransform: opts.cacheCreateTransform },
  )
  const handlerDefaultInlineCss = getStaticInlineCss(undefined, opts.inlineCss)

  const getRequestManifestOptions = async (
    requestOpts: FinalManifestRequestOptions,
  ) => {
    const transformFn = await transformResolver.getTransformFn({
      warmup: false,
      request: requestOpts.request,
    })
    const inlineCss = await resolveInlineCssForRequest({
      request: requestOpts.request,
      handlerInlineCss: opts.inlineCss,
      requestInlineCss: requestOpts.requestInlineCss,
    })

    return {
      getBaseManifest: requestOpts.getBaseManifest,
      transformFn,
      cache: transformResolver.cache,
      inlineCss,
    }
  }

  const resolveRequest = async (
    requestOpts: FinalManifestRequestOptions,
    cache: FinalManifestCache | undefined,
  ) => {
    return resolveFinalManifest({
      ...(await getRequestManifestOptions(requestOpts)),
      finalManifestCache: cache,
    })
  }

  return {
    warmup: ({ getBaseManifest }) =>
      warmupFinalManifest({
        enabled: transformResolver.warmup,
        handlerDefaultInlineCss,
        cache: transformResolver.cache,
        finalManifestCache,
        getBaseManifest,
        getTransformFn: () =>
          transformResolver.getTransformFn({ warmup: true }),
        onError: transformResolver.clearCachedCreateTransform,
      }),
    resolveCached: (requestOpts) => {
      // With a cached transform, the entry for the request's inline-CSS choice
      // is the manifest resolveRequest would produce, unless a handler
      // callback still has to make that choice.
      const inlineCss = getStaticInlineCss(
        requestOpts.requestInlineCss,
        opts.inlineCss,
      )
      if (transformResolver.cache && inlineCss !== undefined) {
        const cached = finalManifestCache.get(
          getFinalManifestCacheKey(inlineCss),
        )
        if (cached) {
          return cached
        }
      }
      return resolveRequest(requestOpts, finalManifestCache)
    },
    resolveUncached: (requestOpts) => resolveRequest(requestOpts, undefined),
  }
}

function getFinalManifestCacheKey(inlineCss: boolean): FinalManifestCacheKey {
  return inlineCss ? 'inline-css' : 'linked-css'
}

function cacheFinalManifestPromise(
  finalManifestCache: FinalManifestCache,
  cacheKey: FinalManifestCacheKey,
  promise: Promise<ServerManifest>,
): Promise<ServerManifest> {
  const cachedPromise = promise.then(
    (manifest) => {
      if (finalManifestCache.get(cacheKey) === cachedPromise) {
        finalManifestCache.set(cacheKey, manifest)
      }
      return manifest
    },
    (error) => {
      if (finalManifestCache.get(cacheKey) === cachedPromise) {
        finalManifestCache.delete(cacheKey)
      }
      throw error
    },
  )

  finalManifestCache.set(cacheKey, cachedPromise)
  return cachedPromise
}

function getOrCreateCachedFinalManifest(
  finalManifestCache: FinalManifestCache,
  cacheKey: FinalManifestCacheKey,
  computeFinalManifest: () => Promise<ServerManifest>,
): ServerManifest | Promise<ServerManifest> {
  const cached = finalManifestCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return cacheFinalManifestPromise(
    finalManifestCache,
    cacheKey,
    Promise.resolve().then(computeFinalManifest),
  )
}

async function buildFinalManifest(opts: {
  base: ServerManifest
  transformFn: TransformAssetsFn | undefined
  inlineCss: boolean
}): Promise<ServerManifest> {
  return opts.transformFn
    ? await transformManifestAssets(opts.base, opts.transformFn, {
        inlineCss: opts.inlineCss,
      })
    : buildManifest(opts.base, { inlineCss: opts.inlineCss })
}

async function resolveFinalManifest(opts: {
  getBaseManifest: () => Promise<ServerManifest>
  transformFn: TransformAssetsFn | undefined
  cache: boolean
  inlineCss: boolean
  finalManifestCache?: FinalManifestCache
}): Promise<ServerManifest> {
  const computeFinalManifest = async () => {
    return buildFinalManifest({
      base: await opts.getBaseManifest(),
      transformFn: opts.transformFn,
      inlineCss: opts.inlineCss,
    })
  }

  if (opts.finalManifestCache && (!opts.transformFn || opts.cache)) {
    return getOrCreateCachedFinalManifest(
      opts.finalManifestCache,
      getFinalManifestCacheKey(opts.inlineCss),
      computeFinalManifest,
    )
  }

  return computeFinalManifest()
}

function warmupFinalManifest(opts: {
  enabled: boolean
  handlerDefaultInlineCss: boolean | undefined
  cache: boolean
  finalManifestCache: FinalManifestCache
  getBaseManifest: () => Promise<ServerManifest>
  getTransformFn: () => Promise<TransformAssetsFn | undefined>
  onError?: () => void
}): Promise<ServerManifest> | undefined {
  if (
    !opts.enabled ||
    opts.handlerDefaultInlineCss === undefined ||
    !opts.cache
  ) {
    return undefined
  }

  // Warmup runs when the handler is created, before any request fills the
  // cache.
  const inlineCss = opts.handlerDefaultInlineCss
  const warmupPromise = cacheFinalManifestPromise(
    opts.finalManifestCache,
    getFinalManifestCacheKey(inlineCss),
    Promise.resolve().then(async () => {
      const [base, transformFn] = await Promise.all([
        opts.getBaseManifest(),
        opts.getTransformFn(),
      ])

      return buildFinalManifest({
        base,
        transformFn,
        inlineCss,
      })
    }),
  )

  if (opts.onError) {
    void warmupPromise.catch(opts.onError)
  }

  return warmupPromise
}
