import {
  buildManifestWithClientEntry,
  resolveTransformAssetsConfig,
  transformManifestAssets,
} from './transformAssetUrls'
import {
  getStaticHandlerInlineCssDefault,
  resolveInlineCssForRequest,
} from './inlineCss'
import type { Manifest } from '@tanstack/router-core'
import type { HandlerInlineCssOption } from './inlineCss'
import type {
  CreateTransformAssetsContext,
  StartManifestWithClientEntry,
  TransformAssets,
  TransformAssetsFn,
} from './transformAssetUrls'

export type {
  HandlerInlineCssOption,
  StartManifestWithClientEntry,
  TransformAssets,
}

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
   * This covers JS preloads, CSS links, the client entry script, and URLs
   * inside build-collected inline CSS. Asset imports used directly in
   * components should be handled by the bundler instead.
   */
  transformAssets?: TransformAssets
}

type FinalManifestCacheKey = 'inline-css' | 'linked-css'
type FinalManifestCache = Map<FinalManifestCacheKey, Promise<Manifest>>
export type GetBaseManifest = () => Promise<StartManifestWithClientEntry>

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
  }) => Promise<Manifest> | undefined
  resolveCached: (opts: FinalManifestRequestOptions) => Promise<Manifest>
  resolveUncached: (opts: FinalManifestRequestOptions) => Promise<Manifest>
}

export function createCachedBaseManifestLoader(
  loadBaseManifest: GetBaseManifest,
): GetBaseManifest {
  let baseManifestPromise: Promise<StartManifestWithClientEntry> | undefined

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
  const handlerDefaultInlineCss = getStaticHandlerInlineCssDefault(
    opts.inlineCss,
  )

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
    resolveCached: (requestOpts) =>
      resolveRequest(requestOpts, finalManifestCache),
    resolveUncached: (requestOpts) => resolveRequest(requestOpts, undefined),
  }
}

function getFinalManifestCacheKey(inlineCss: boolean): FinalManifestCacheKey {
  return inlineCss ? 'inline-css' : 'linked-css'
}

function cacheFinalManifestPromise(
  cachedFinalManifestPromises: FinalManifestCache,
  cacheKey: FinalManifestCacheKey,
  promise: Promise<Manifest>,
): Promise<Manifest> {
  const cachedFinalManifestPromise = promise.catch((error) => {
    if (
      cachedFinalManifestPromises.get(cacheKey) === cachedFinalManifestPromise
    ) {
      cachedFinalManifestPromises.delete(cacheKey)
    }
    throw error
  })

  cachedFinalManifestPromises.set(cacheKey, cachedFinalManifestPromise)
  return cachedFinalManifestPromise
}

function getOrCreateCachedFinalManifestPromise(
  cachedFinalManifestPromises: FinalManifestCache,
  cacheKey: FinalManifestCacheKey,
  computeFinalManifest: () => Promise<Manifest>,
): Promise<Manifest> {
  const cachedFinalManifestPromise = cachedFinalManifestPromises.get(cacheKey)
  if (cachedFinalManifestPromise) {
    return cachedFinalManifestPromise
  }

  return cacheFinalManifestPromise(
    cachedFinalManifestPromises,
    cacheKey,
    Promise.resolve().then(computeFinalManifest),
  )
}

async function buildFinalManifest(opts: {
  base: StartManifestWithClientEntry
  transformFn: TransformAssetsFn | undefined
  inlineCss: boolean
}): Promise<Manifest> {
  return opts.transformFn
    ? await transformManifestAssets(opts.base, opts.transformFn, {
        inlineCss: opts.inlineCss,
      })
    : buildManifestWithClientEntry(opts.base, { inlineCss: opts.inlineCss })
}

async function resolveFinalManifest(opts: {
  getBaseManifest: () => Promise<StartManifestWithClientEntry>
  transformFn: TransformAssetsFn | undefined
  cache: boolean
  inlineCss: boolean
  finalManifestCache?: FinalManifestCache
}): Promise<Manifest> {
  const computeFinalManifest = async () => {
    return buildFinalManifest({
      base: await opts.getBaseManifest(),
      transformFn: opts.transformFn,
      inlineCss: opts.inlineCss,
    })
  }

  if (opts.finalManifestCache && (!opts.transformFn || opts.cache)) {
    return getOrCreateCachedFinalManifestPromise(
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
  getBaseManifest: () => Promise<StartManifestWithClientEntry>
  getTransformFn: () => Promise<TransformAssetsFn | undefined>
  onError?: () => void
}): Promise<Manifest> | undefined {
  if (
    !opts.enabled ||
    opts.handlerDefaultInlineCss === undefined ||
    !opts.cache
  ) {
    return undefined
  }

  const inlineCss = opts.handlerDefaultInlineCss
  const warmupPromise = getOrCreateCachedFinalManifestPromise(
    opts.finalManifestCache,
    getFinalManifestCacheKey(inlineCss),
    async () => {
      const [base, transformFn] = await Promise.all([
        opts.getBaseManifest(),
        opts.getTransformFn(),
      ])

      return buildFinalManifest({
        base,
        transformFn,
        inlineCss,
      })
    },
  )

  if (opts.onError) {
    void warmupPromise.catch(opts.onError)
  }

  return warmupPromise
}
