import { createMemoryHistory } from '@tanstack/history'
import {
  createNullProtoObject,
  flattenMiddlewares,
  mergeHeaders,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import {
  executeRewriteInput,
  isRedirect,
  isResolvedRedirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  getNormalizedURL,
  getOrigin,
} from '@tanstack/router-core/ssr/server'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import { requestHandler } from './request-response'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'
import {
  adaptTransformAssetUrlsConfigToTransformAssets,
  buildManifestWithClientEntry,
  resolveTransformAssetsConfig,
  transformManifestAssets,
} from './transformAssetUrls'
import {
  collectDynamicHintsFromMatches,
  collectStaticHintsFromManifest,
  createEarlyHintsEvent,
  createResponseLinkHeaderEntries,
  getResponseLinkHeaderEntries,
} from './early-hints'

import { HEADERS } from './constants'
import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AnyStartInstanceOptions,
  RouteMethod,
  RouteMethodHandlerFn,
  RouterEntry,
  StartEntry,
} from '@tanstack/start-client-core'
import type { RequestHandler } from './request-handler'
import type {
  EarlyHint,
  EarlyHintsEvent,
  EarlyHintsPhase,
  OnEarlyHints,
  ResponseLinkHeaderEntry,
  ResponseLinkHeaderFilter,
  ResponseLinkHeaderOptions,
} from './early-hints'
import type {
  AnyRoute,
  AnyRouter,
  AnySerializationAdapter,
  Manifest,
  Register,
} from '@tanstack/router-core'
import type { HandlerCallback } from '@tanstack/router-core/ssr/server'
import type {
  StartManifestWithClientEntry,
  TransformAssetUrls,
  TransformAssets,
  TransformAssetsFn,
} from './transformAssetUrls'

type TODO = any

type AnyMiddlewareServerFn =
  | AnyRequestMiddleware['options']['server']
  | AnyFunctionMiddleware['options']['server']

export interface CreateStartHandlerOptions {
  handler: HandlerCallback<AnyRouter>
  /**
   * Transform asset URLs and attributes at runtime, e.g. to prepend a CDN prefix.
   *
   * **String** — a URL prefix prepended to every asset URL (cached by default):
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssets: 'https://cdn.example.com',
   * })
   * ```
   *
   * **Object shorthand** — a URL prefix with optional `crossOrigin`:
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssets: {
   *     prefix: 'https://cdn.example.com',
   *     crossOrigin: 'anonymous',
   *   },
   * })
   * ```
   *
   * `crossOrigin` accepts a single value or a per-kind record:
   * ```ts
   * transformAssets: {
   *   prefix: 'https://cdn.example.com',
   *   crossOrigin: {
   *     modulepreload: 'anonymous',
   *     stylesheet: 'use-credentials',
   *   },
   * }
   * ```
   *
   * **Callback** — receives `{ kind, url }` and returns either a string URL or
   * `{ href, crossOrigin? }` (cached by default — runs once on first request):
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssets: ({ kind, url }) => {
   *     const href = `https://cdn.example.com${url}`
   *
   *     if (kind === 'modulepreload') {
   *       return { href, crossOrigin: 'anonymous' }
   *     }
   *
   *     return { href }
   *   },
   * })
   * ```
   *
   * **Object** — for explicit cache control:
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssets: {
   *     transform: ({ url }) => {
   *       const region = getRequest().headers.get('x-region') || 'us'
   *       return { href: `https://cdn-${region}.example.com${url}` }
   *     },
   *     cache: false,
   *   },
   * })
   * ```
   *
   * `kind` is one of `'modulepreload' | 'stylesheet' | 'clientEntry'`.
   * `crossOrigin` applies to manifest-managed `<link>` assets.
   *
   * By default, the transformed manifest is cached after the first request
   * (`cache: true`). Set `cache: false` for per-request transforms.
   *
   * If you're using a cached transform, you can optionally set `warmup: true`
   * (object form only) to compute the transformed manifest in the background at
   * server startup.
   *
   * Note: This only transforms URLs managed by TanStack Start's manifest
   * (JS preloads, CSS links, and the client entry script). For asset imports
   * used directly in components (e.g. `import logo from './logo.svg'`),
   * configure Vite's `experimental.renderBuiltUrl` in your vite.config.ts.
   */
  transformAssets?: TransformAssets
  /**
   * @deprecated Use `transformAssets` instead.
   *
   * **String** — a URL prefix prepended to every asset URL (cached by default):
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssetUrls: 'https://cdn.example.com',
   * })
   * ```
   *
   * **Callback** — receives `{ url, type }` and returns a new URL
   * (cached by default — runs once on first request):
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssetUrls: ({ url, type }) => {
   *     return `https://cdn.example.com${url}`
   *   },
   * })
   * ```
   *
   * **Object** — for explicit cache control:
   * ```ts
   * createStartHandler({
   *   handler: defaultStreamHandler,
   *   transformAssetUrls: {
   *     transform: ({ url }) => {
   *       const region = getRequest().headers.get('x-region') || 'us'
   *       return `https://cdn-${region}.example.com${url}`
   *     },
   *     cache: false, // transform per-request
   *   },
   * })
   * ```
   *
   * `type` is one of `'modulepreload' | 'stylesheet' | 'clientEntry'`.
   *
   * By default, the transformed manifest is cached after the first request
   * (`cache: true`). Set `cache: false` for per-request transforms.
   *
   * If you're using a cached transform, you can optionally set `warmup: true`
   * (object form only) to compute the transformed manifest in the background at
   * server startup.
   *
   * Note: This only transforms URLs managed by TanStack Start's manifest
   * (JS preloads, CSS links, and the client entry script). For asset imports
   * used directly in components (e.g. `import logo from './logo.svg'`),
   * configure Vite's `experimental.renderBuiltUrl` in your vite.config.ts.
   */
  transformAssetUrls?: TransformAssetUrls
}

function getStartResponseHeaders(opts: { router: AnyRouter }) {
  const headers = mergeHeaders(
    {
      'Content-Type': 'text/html; charset=utf-8',
    },
    ...opts.router.stores.matches.get().map((match) => {
      return match.headers
    }),
  )
  return headers
}

function notifyEarlyHints(
  phase: EarlyHintsPhase,
  event: EarlyHintsEvent,
  onEarlyHints: OnEarlyHints,
) {
  try {
    const result = onEarlyHints(event)
    if (result) {
      void Promise.resolve(result).catch((err) => {
        console.error(`Error sending ${phase} early hints:`, err)
      })
    }
  } catch (err) {
    console.error(`Error sending ${phase} early hints:`, err)
  }
}

function getResponseLinkHeaderFilter(
  responseLinkHeader: boolean | ResponseLinkHeaderOptions | undefined,
): ResponseLinkHeaderFilter | undefined {
  if (typeof responseLinkHeader !== 'object') {
    return undefined
  }

  return responseLinkHeader.filter
}

function appendResponseLinkHeaders(opts: {
  responseHeaders: Headers
  entries: ReadonlyArray<ResponseLinkHeaderEntry>
  filter?: ResponseLinkHeaderFilter
}) {
  if (!opts.filter) {
    for (const entry of opts.entries) {
      opts.responseHeaders.append('Link', entry.link)
    }
    return
  }

  const links = getResponseLinkHeaderEntries(opts)

  for (const link of links) {
    opts.responseHeaders.append('Link', link)
  }
}

function collectResponseLinkHeaderEntries(opts: {
  phase: EarlyHintsPhase
  event: EarlyHintsEvent
  entries: Array<ResponseLinkHeaderEntry>
}) {
  for (let index = 0; index < opts.event.hints.length; index++) {
    opts.entries.push({
      phase: opts.phase,
      hint: opts.event.hints[index]!,
      link: opts.event.links[index]!,
    })
  }
}

function handleCollectedEarlyHints(opts: {
  phase: EarlyHintsPhase
  hints: ReadonlyArray<EarlyHint>
  sentLinks: Set<string>
  sentHints?: Array<EarlyHint>
  onEarlyHints?: OnEarlyHints
  responseLinkHeaderEntries?: Array<ResponseLinkHeaderEntry>
}) {
  const event = opts.onEarlyHints
    ? createEarlyHintsEvent({
        phase: opts.phase,
        hints: opts.hints,
        sentLinks: opts.sentLinks,
        sentHints: opts.sentHints!,
      })
    : undefined

  if (event) {
    notifyEarlyHints(opts.phase, event, opts.onEarlyHints!)
  }

  if (!opts.responseLinkHeaderEntries) return

  if (event) {
    collectResponseLinkHeaderEntries({
      phase: opts.phase,
      event,
      entries: opts.responseLinkHeaderEntries,
    })
    return
  }

  createResponseLinkHeaderEntries({
    phase: opts.phase,
    hints: opts.hints,
    sentLinks: opts.sentLinks,
    entries: opts.responseLinkHeaderEntries,
  })
}

interface PluginAdaptersEntry {
  hasPluginAdapters: boolean
  pluginSerializationAdapters: Array<AnySerializationAdapter>
}

interface Entries {
  startEntry: StartEntry
  routerEntry: RouterEntry
  pluginAdapters: PluginAdaptersEntry
}

// Cached entries - promises stored immediately to prevent concurrent imports
// that can cause race conditions during module initialization
let entriesPromise: Promise<Entries> | undefined
let baseManifestPromise: Promise<StartManifestWithClientEntry> | undefined

/**
 * Cached final manifest (with client entry script tag). In production,
 * this is computed once and reused for every request when caching is enabled.
 */
let cachedFinalManifestPromise: Promise<Manifest> | undefined

async function loadEntries(): Promise<Entries> {
  const [routerEntry, startEntry, pluginAdapters] = await Promise.all([
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-router-entry'),
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-start-entry'),
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-start-plugin-adapters'),
  ])
  return {
    routerEntry: routerEntry as unknown as RouterEntry,
    startEntry: startEntry as unknown as StartEntry,
    pluginAdapters: pluginAdapters as unknown as PluginAdaptersEntry,
  }
}

function getEntries() {
  if (!entriesPromise) {
    entriesPromise = loadEntries()
  }
  return entriesPromise
}

/**
 * Returns the raw manifest data (without client entry script tag baked in).
 * In dev mode, always returns fresh data. In prod, cached.
 */
function getBaseManifest(
  matchedRoutes?: ReadonlyArray<AnyRoute>,
): Promise<StartManifestWithClientEntry> {
  // In dev mode, always get fresh manifest (no caching) to include route-specific dev styles
  if (process.env.TSS_DEV_SERVER === 'true') {
    return getStartManifest(matchedRoutes)
  }
  // In prod, cache the base manifest
  if (!baseManifestPromise) {
    baseManifestPromise = getStartManifest()
  }
  return baseManifestPromise
}

/**
 * Resolves a final Manifest for a given request.
 *
 * - No transform: builds client entry script tag and returns (cached in prod).
 * - Cached transform: transforms all URLs + builds script tag, caches result.
 * - Per-request transform: deep-clones base manifest, transforms per-request.
 */
async function resolveManifest(
  matchedRoutes: ReadonlyArray<AnyRoute> | undefined,
  transformFn: TransformAssetsFn | undefined,
  cache: boolean,
): Promise<Manifest> {
  const base = await getBaseManifest(matchedRoutes)

  const computeFinalManifest = async () => {
    return transformFn
      ? await transformManifestAssets(base, transformFn, { clone: !cache })
      : buildManifestWithClientEntry(base)
  }

  // In dev, always compute fresh to include route-specific dev styles.
  if (process.env.TSS_DEV_SERVER === 'true') {
    return computeFinalManifest()
  }

  // In prod, cache unless we're explicitly doing per-request transforms.
  if (!transformFn || cache) {
    if (!cachedFinalManifestPromise) {
      cachedFinalManifestPromise = computeFinalManifest()
    }
    return cachedFinalManifestPromise
  }

  // Per-request transform — deep-clone and transform every time.
  return computeFinalManifest()
}

// Pre-computed constants
const ROUTER_BASEPATH = process.env.TSS_ROUTER_BASEPATH || '/'
const SERVER_FN_BASE = process.env.TSS_SERVER_FN_BASE
const IS_PRERENDERING = process.env.TSS_PRERENDERING === 'true'
const IS_SHELL_ENV = process.env.TSS_SHELL === 'true'
const IS_DEV = process.env.NODE_ENV === 'development'

// Reusable error messages
const ERR_NO_RESPONSE = IS_DEV
  ? `It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route.`
  : 'Internal Server Error'

const ERR_NO_DEFER = IS_DEV
  ? `You cannot defer to the app router if there is no component defined on this route.`
  : 'Internal Server Error'

function throwRouteHandlerError(): never {
  throw new Error(ERR_NO_RESPONSE)
}

function throwIfMayNotDefer(): never {
  throw new Error(ERR_NO_DEFER)
}

/**
 * Check if a value is a special response (Response or Redirect)
 */
function isSpecialResponse(value: unknown): value is Response {
  return value instanceof Response || isRedirect(value)
}

/**
 * Normalize middleware result to context shape
 */
function handleCtxResult(result: TODO) {
  if (isSpecialResponse(result)) {
    return { response: result }
  }
  return result
}

/**
 * Execute a middleware chain
 */
function executeMiddleware(middlewares: Array<TODO>, ctx: TODO): Promise<TODO> {
  let index = -1

  const next = async (nextCtx?: TODO): Promise<TODO> => {
    // Merge context if provided using safeObjectMerge for prototype pollution prevention
    if (nextCtx) {
      if (nextCtx.context) {
        ctx.context = safeObjectMerge(ctx.context, nextCtx.context)
      }
      // Copy own properties except context (Object.keys returns only own enumerable properties)
      for (const key of Object.keys(nextCtx)) {
        if (key !== 'context') {
          ctx[key] = nextCtx[key]
        }
      }
    }

    index++
    const middleware = middlewares[index]
    if (!middleware) return ctx

    let result: TODO
    try {
      result = await middleware({ ...ctx, next })
    } catch (err) {
      if (isSpecialResponse(err)) {
        ctx.response = err
        return ctx
      }
      throw err
    }

    const normalized = handleCtxResult(result)
    if (normalized) {
      if (normalized.response !== undefined) {
        ctx.response = normalized.response
      }
      if (normalized.context) {
        ctx.context = safeObjectMerge(ctx.context, normalized.context)
      }
    }

    return ctx
  }

  return next()
}

/**
 * Wrap a route handler as middleware
 */
function handlerToMiddleware(
  handler: RouteMethodHandlerFn<any, AnyRoute, any, any, any, any, any>,
  mayDefer: boolean = false,
): TODO {
  if (mayDefer) {
    return handler
  }
  return async (ctx: TODO) => {
    const response = await handler({ ...ctx, next: throwIfMayNotDefer })
    if (!response) {
      throwRouteHandlerError()
    }
    return response
  }
}

/**
 * Creates the TanStack Start request handler.
 *
 * @example Backwards-compatible usage (handler callback only):
 * ```ts
 * export default createStartHandler(defaultStreamHandler)
 * ```
 *
 * @example With CDN URL rewriting:
 * ```ts
 * export default createStartHandler({
 *   handler: defaultStreamHandler,
 *   transformAssets: 'https://cdn.example.com',
 * })
 * ```
 *
 * @example With per-request URL rewriting:
 * ```ts
 * export default createStartHandler({
 *   handler: defaultStreamHandler,
 *   transformAssets: {
 *     transform: ({ url }) => {
 *       const cdnBase = getRequest().headers.get('x-cdn-base') || ''
 *       return { href: `${cdnBase}${url}` }
 *     },
 *     cache: false,
 *   },
 * })
 * ```
 */
export function createStartHandler<TRegister = Register>(
  cbOrOptions: HandlerCallback<AnyRouter> | CreateStartHandlerOptions,
): RequestHandler<TRegister> {
  // Normalize the overloaded argument
  const cb: HandlerCallback<AnyRouter> =
    typeof cbOrOptions === 'function' ? cbOrOptions : cbOrOptions.handler
  const transformAssetsOption: TransformAssets | undefined =
    typeof cbOrOptions === 'function' ? undefined : cbOrOptions.transformAssets
  const transformAssetUrlsOption: TransformAssetUrls | undefined =
    typeof cbOrOptions === 'function'
      ? undefined
      : cbOrOptions.transformAssetUrls

  const transformOption =
    transformAssetsOption !== undefined
      ? resolveTransformAssetsConfig(transformAssetsOption)
      : transformAssetUrlsOption !== undefined
        ? resolveTransformAssetsConfig(
            adaptTransformAssetUrlsConfigToTransformAssets(
              transformAssetUrlsOption,
            ),
          )
        : undefined

  const warmupTransformManifest =
    (!!transformAssetsOption &&
      typeof transformAssetsOption === 'object' &&
      'warmup' in transformAssetsOption &&
      transformAssetsOption.warmup === true) ||
    (!!transformAssetUrlsOption &&
      typeof transformAssetUrlsOption === 'object' &&
      transformAssetUrlsOption.warmup === true)

  // Pre-resolve the transform function and cache flag
  const resolvedTransformConfig = transformOption
  const cache = resolvedTransformConfig ? resolvedTransformConfig.cache : true
  const shouldCacheCreateTransform =
    cache && process.env.TSS_DEV_SERVER !== 'true'

  // Memoize a single createTransform() result when caching is enabled outside
  // of the dev server.
  let cachedCreateTransformPromise: Promise<TransformAssetsFn> | undefined

  const getTransformFn = async (
    opts: { warmup: true } | { warmup: false; request: Request },
  ): Promise<TransformAssetsFn | undefined> => {
    if (!resolvedTransformConfig) return undefined

    if (resolvedTransformConfig.type === 'createTransform') {
      if (shouldCacheCreateTransform) {
        if (!cachedCreateTransformPromise) {
          cachedCreateTransformPromise = Promise.resolve(
            resolvedTransformConfig.createTransform(opts),
          ).catch((error) => {
            cachedCreateTransformPromise = undefined
            throw error
          })
        }

        return cachedCreateTransformPromise
      }

      return resolvedTransformConfig.createTransform(opts)
    }

    return resolvedTransformConfig.transformFn
  }

  // Background warmup for cached transforms (production only)
  if (
    warmupTransformManifest &&
    cache &&
    process.env.TSS_DEV_SERVER !== 'true' &&
    !cachedFinalManifestPromise
  ) {
    // NOTE: Do not call resolveManifest() here.
    // resolveManifest() reads from cachedFinalManifestPromise, and since we set
    // cachedFinalManifestPromise to this warmup promise, that would create a
    // self-referential promise and hang forever.
    const warmupPromise = (async () => {
      const base = await getBaseManifest(undefined)
      const transformFn = await getTransformFn({ warmup: true })
      return transformFn
        ? await transformManifestAssets(base, transformFn, { clone: false })
        : buildManifestWithClientEntry(base)
    })()
    cachedFinalManifestPromise = warmupPromise
    warmupPromise.catch(() => {
      // If warmup fails, allow the next request to retry.
      if (cachedFinalManifestPromise === warmupPromise) {
        cachedFinalManifestPromise = undefined
      }
      cachedCreateTransformPromise = undefined
    })
  }

  const startRequestResolver: RequestHandler<Register> = async (
    request,
    requestOpts,
  ) => {
    let router: AnyRouter | null = null as AnyRouter | null
    let cbWillCleanup = false as boolean

    try {
      // normalizing and sanitizing the pathname here for server, so we always deal with the same format during SSR.
      // during normalization paths like '//posts' are flattened to '/posts'.
      // in these cases we would prefer to redirect to the new path
      const { url, handledProtocolRelativeURL } = getNormalizedURL(request.url)
      const href = url.pathname + url.search + url.hash
      const origin = getOrigin(request)

      if (handledProtocolRelativeURL) {
        return Response.redirect(url, 308)
      }

      const entries = await getEntries()
      const startOptions: AnyStartInstanceOptions =
        (await entries.startEntry.startInstance?.getOptions()) ||
        ({} as AnyStartInstanceOptions)

      const { hasPluginAdapters, pluginSerializationAdapters } =
        entries.pluginAdapters

      const serializationAdapters = [
        ...(startOptions.serializationAdapters || []),
        ...(hasPluginAdapters ? pluginSerializationAdapters : []),
        ServerFunctionSerializationAdapter,
      ]

      const requestStartOptions = {
        ...startOptions,
        serializationAdapters,
      }

      // Flatten request middlewares once
      const flattenedRequestMiddlewares = startOptions.requestMiddleware
        ? flattenMiddlewares(startOptions.requestMiddleware)
        : []

      // Create set for deduplication
      const executedRequestMiddlewares = new Set<TODO>(
        flattenedRequestMiddlewares,
      )

      // Memoized router getter
      const getRouter = async (): Promise<AnyRouter> => {
        if (router) return router

        router = await entries.routerEntry.getRouter()

        let isShell = IS_SHELL_ENV
        if (IS_PRERENDERING && !isShell) {
          isShell = request.headers.get(HEADERS.TSS_SHELL) === 'true'
        }

        const history = createMemoryHistory({
          initialEntries: [href],
        })

        router.update({
          history,
          isShell,
          isPrerendering: IS_PRERENDERING,
          origin: router.options.origin ?? origin,
          ...{
            defaultSsr: requestStartOptions.defaultSsr,
            serializationAdapters: [
              ...requestStartOptions.serializationAdapters,
              ...(router.options.serializationAdapters || []),
            ],
          },
          basepath: ROUTER_BASEPATH,
        })

        return router
      }

      // Check for server function requests first (early exit)
      if (SERVER_FN_BASE && url.pathname.startsWith(SERVER_FN_BASE)) {
        const serverFnId = url.pathname
          .slice(SERVER_FN_BASE.length)
          .split('/')[0]

        if (!serverFnId) {
          throw new Error('Invalid server action param for serverFnId')
        }

        const serverFnHandler = async ({ context }: TODO) => {
          return runWithStartContext(
            {
              getRouter,
              startOptions: requestStartOptions,
              contextAfterGlobalMiddlewares: context,
              request,
              executedRequestMiddlewares,
              handlerType: 'serverFn',
            },
            () =>
              handleServerAction({
                request,
                context: requestOpts?.context,
                serverFnId,
              }),
          )
        }

        const middlewares = flattenedRequestMiddlewares.map(
          (d) => d.options.server,
        )
        const ctx = await executeMiddleware([...middlewares, serverFnHandler], {
          request,
          pathname: url.pathname,
          context: createNullProtoObject(requestOpts?.context),
        })

        return handleRedirectResponse(ctx.response, request, getRouter)
      }

      // Router execution function
      const executeRouter = async (
        serverContext: TODO,
        matchedRoutes?: ReadonlyArray<AnyRoute>,
      ): Promise<Response> => {
        const acceptHeader = request.headers.get('Accept') || '*/*'
        const acceptParts = acceptHeader.split(',')
        const supportedMimeTypes = ['*/*', 'text/html']

        const isSupported = supportedMimeTypes.some((mimeType) =>
          acceptParts.some((part) => part.trim().startsWith(mimeType)),
        )

        if (!isSupported) {
          return Response.json(
            { error: 'Only HTML requests are supported here' },
            { status: 500 },
          )
        }

        const manifest = await resolveManifest(
          matchedRoutes,
          await getTransformFn({ warmup: false, request }),
          cache,
        )

        const onEarlyHints = requestOpts?.onEarlyHints
        const responseLinkHeader = requestOpts?.responseLinkHeader
        const shouldCollectEarlyHints =
          process.env.TSS_DEV_SERVER !== 'true' &&
          (!!onEarlyHints || !!responseLinkHeader)
        const sentEarlyHintLinks = shouldCollectEarlyHints
          ? new Set<string>()
          : undefined
        const sentEarlyHints = onEarlyHints ? new Array<EarlyHint>() : undefined
        const responseLinkHeaderEntries =
          shouldCollectEarlyHints && responseLinkHeader
            ? new Array<ResponseLinkHeaderEntry>()
            : undefined
        const responseLinkHeaderFilter = shouldCollectEarlyHints
          ? getResponseLinkHeaderFilter(responseLinkHeader)
          : undefined

        if (
          shouldCollectEarlyHints &&
          sentEarlyHintLinks &&
          matchedRoutes?.length
        ) {
          const hints = collectStaticHintsFromManifest(manifest, matchedRoutes)
          handleCollectedEarlyHints({
            phase: 'static',
            hints,
            sentLinks: sentEarlyHintLinks,
            sentHints: sentEarlyHints,
            onEarlyHints,
            responseLinkHeaderEntries,
          })
        }

        const routerInstance = await getRouter()

        attachRouterServerSsrUtils({
          router: routerInstance,
          manifest,
          getRequestAssets: () =>
            getStartContext({ throwIfNotFound: false })?.requestAssets,
          includeUnmatchedRouteAssets: false,
        })

        routerInstance.update({ additionalContext: { serverContext } })
        await routerInstance.load()

        if (routerInstance.state.redirect) {
          return routerInstance.state.redirect
        }

        if (shouldCollectEarlyHints && sentEarlyHintLinks) {
          const loadedMatches = routerInstance.stores.matches.get()
          const hints = collectDynamicHintsFromMatches(loadedMatches)
          handleCollectedEarlyHints({
            phase: 'dynamic',
            hints,
            sentLinks: sentEarlyHintLinks,
            sentHints: sentEarlyHints,
            onEarlyHints,
            responseLinkHeaderEntries,
          })
        }

        // Pass request-scoped assets to dehydrate for manifest injection
        const ctx = getStartContext({ throwIfNotFound: false })
        await routerInstance.serverSsr!.dehydrate({
          requestAssets: ctx?.requestAssets,
        })

        const responseHeaders = getStartResponseHeaders({
          router: routerInstance,
        })
        if (responseLinkHeaderEntries?.length) {
          appendResponseLinkHeaders({
            responseHeaders,
            entries: responseLinkHeaderEntries,
            filter: responseLinkHeaderFilter,
          })
        }
        cbWillCleanup = true

        return cb({
          request,
          router: routerInstance,
          responseHeaders,
        })
      }

      // Main request handler
      const requestHandlerMiddleware = async ({ context }: TODO) => {
        return runWithStartContext(
          {
            getRouter,
            startOptions: requestStartOptions,
            contextAfterGlobalMiddlewares: context,
            request,
            executedRequestMiddlewares,
            handlerType: 'router',
          },
          async () => {
            try {
              return await handleServerRoutes({
                getRouter,
                request,
                url,
                executeRouter,
                context,
                executedRequestMiddlewares,
              })
            } catch (err) {
              if (err instanceof Response) {
                return err
              }
              throw err
            }
          },
        )
      }

      const middlewares = flattenedRequestMiddlewares.map(
        (d) => d.options.server,
      )
      const ctx = await executeMiddleware(
        [...middlewares, requestHandlerMiddleware],
        {
          request,
          pathname: url.pathname,
          context: createNullProtoObject(requestOpts?.context),
        },
      )

      return handleRedirectResponse(ctx.response, request, getRouter)
    } finally {
      if (router && !cbWillCleanup) {
        // Clean up router SSR state if it was set up but won't be cleaned up by the callback
        // (e.g., in redirect cases or early returns before the callback is invoked).
        // When the callback runs, it handles cleanup (either via transformStreamWithRouter
        // for streaming, or directly in renderRouterToString for non-streaming).
        router.serverSsr?.cleanup()
      }
      router = null
    }
  }

  return requestHandler(startRequestResolver)
}

async function handleRedirectResponse(
  response: Response,
  request: Request,
  getRouter: () => Promise<AnyRouter>,
): Promise<Response> {
  if (!isRedirect(response)) {
    return response
  }

  if (isResolvedRedirect(response)) {
    if (request.headers.get('x-tsr-serverFn') === 'true') {
      return Response.json(
        { ...response.options, isSerializedRedirect: true },
        { headers: response.headers },
      )
    }
    return response
  }

  const opts = response.options
  if (opts.to && typeof opts.to === 'string' && !opts.to.startsWith('/')) {
    throw new Error(
      `Server side redirects must use absolute paths via the 'href' or 'to' options. The redirect() method's "to" property accepts an internal path only. Use the "href" property to provide an external URL. Received: ${JSON.stringify(opts)}`,
    )
  }

  if (
    ['params', 'search', 'hash'].some(
      (d) => typeof (opts as TODO)[d] === 'function',
    )
  ) {
    throw new Error(
      `Server side redirects must use static search, params, and hash values and do not support functional values. Received functional values for: ${Object.keys(
        opts,
      )
        .filter((d) => typeof (opts as TODO)[d] === 'function')
        .map((d) => `"${d}"`)
        .join(', ')}`,
    )
  }

  const router = await getRouter()
  const redirect = router.resolveRedirect(response)

  if (request.headers.get('x-tsr-serverFn') === 'true') {
    return Response.json(
      { ...response.options, isSerializedRedirect: true },
      { headers: response.headers },
    )
  }

  return redirect
}

async function handleServerRoutes({
  getRouter,
  request,
  url,
  executeRouter,
  context,
  executedRequestMiddlewares,
}: {
  getRouter: () => Promise<AnyRouter>
  request: Request
  url: URL
  executeRouter: (
    serverContext: any,
    matchedRoutes?: ReadonlyArray<AnyRoute>,
  ) => Promise<Response>
  context: any
  executedRequestMiddlewares: Set<AnyRequestMiddleware>
}): Promise<Response> {
  const router = await getRouter()
  const rewrittenUrl = executeRewriteInput(router.rewrite, url)
  const pathname = rewrittenUrl.pathname
  // this will perform a fuzzy match, however for server routes we need an exact match
  // if the route is not an exact match, executeRouter will handle rendering the app router
  // the match will be cached internally, so no extra work is done during the app router render
  const { matchedRoutes, foundRoute, routeParams } =
    router.getMatchedRoutes(pathname)

  const isExactMatch = foundRoute && routeParams['**'] === undefined

  // Collect and dedupe route middlewares
  const routeMiddlewares: Array<AnyMiddlewareServerFn> = []

  // Collect middleware from matched routes, filtering out those already executed
  // in the request phase
  for (const route of matchedRoutes) {
    const serverMiddleware = route.options.server?.middleware as
      | Array<AnyRequestMiddleware>
      | undefined
    if (serverMiddleware) {
      const flattened = flattenMiddlewares(serverMiddleware)
      for (const m of flattened) {
        if (!executedRequestMiddlewares.has(m)) {
          routeMiddlewares.push(m.options.server)
        }
      }
    }
  }

  // Add handler middleware if exact match
  const server = foundRoute?.options.server
  let isHeadFallback = false
  if (server?.handlers && isExactMatch) {
    const handlers =
      typeof server.handlers === 'function'
        ? server.handlers({ createHandlers: (d: any) => d })
        : server.handlers

    const requestMethod = request.method.toUpperCase() as RouteMethod
    // Per RFC 9110 §9.3.2, HEAD must return the same header fields as GET.
    // Priority for HEAD: explicit HEAD handler → GET → ANY (last resort).
    const handler =
      requestMethod === 'HEAD'
        ? (handlers['HEAD'] ?? handlers['GET'] ?? handlers['ANY'])
        : (handlers[requestMethod] ?? handlers['ANY'])
    isHeadFallback =
      requestMethod === 'HEAD' && handler !== undefined && !handlers['HEAD']

    if (handler) {
      const mayDefer = !!foundRoute.options.component

      if (typeof handler === 'function') {
        routeMiddlewares.push(handlerToMiddleware(handler, mayDefer))
      } else {
        if (handler.middleware?.length) {
          const handlerMiddlewares = flattenMiddlewares(handler.middleware)
          for (const m of handlerMiddlewares) {
            routeMiddlewares.push(m.options.server)
          }
        }
        if (handler.handler) {
          routeMiddlewares.push(handlerToMiddleware(handler.handler, mayDefer))
        }
      }
    }
  }

  // Final middleware: execute router with matched routes for dev styles
  routeMiddlewares.push((ctx: TODO) =>
    executeRouter(ctx.context, matchedRoutes),
  )

  const ctx = await executeMiddleware(routeMiddlewares, {
    request,
    context,
    params: routeParams,
    pathname,
  })

  // RFC 9110 §9.3.2: HEAD must carry the same header fields as GET but no body.
  // Resolve any redirect before stripping so the Location header survives.
  if (isHeadFallback) {
    if (!ctx.response) {
      throwRouteHandlerError()
    }

    const resolved = await handleRedirectResponse(
      ctx.response,
      request,
      getRouter,
    )
    return new Response(null, resolved)
  }

  return ctx.response
}
