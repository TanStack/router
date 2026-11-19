import { createServerHistory } from '@tanstack/history'
import {
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  createCsrfMiddleware,
  createNullProtoObject,
  csrfSymbol,
  flattenMiddlewares,
  mergeHeaders,
} from '@tanstack/start-client-core'
import {
  _getRenderedMatches,
  isDangerousProtocol,
  isPromise,
  isRedirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  bindSsrResponseToRequest,
  disposeSsrResponse,
  getNormalizedURL,
  normalizeSsrResponse,
  stripSsrResponseBody,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import {
  createFinalizedResponse,
  finalizeResponse,
  reconcileResponse,
  transferResponseMetadata,
  withStartRequest,
} from './internal-request-response'
import { getStartManifest } from './router-manifest'
import {
  createLateResponseDisposer,
  disposeResponseResult,
  executeMiddleware,
  throwIfMayNotDefer,
} from './request-middleware'
import {
  createServerFnErrorResponse,
  handleServerAction,
} from './server-functions-handler'
import { createEarlyHintsCollector } from './early-hints'
import {
  createCachedBaseManifestLoader,
  createFinalManifestResolver,
} from './finalManifest'

import { HEADERS } from './constants'
import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type { DeferredResponse } from './server-functions-handler'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AnyStartInstanceOptions,
  RouteMethod,
  RouteMethodHandlerFn,
  RouterEntry,
  StartEntry,
} from '@tanstack/start-client-core'
import type { RequestHandler, RequestOptions } from './request-handler'
import type { StartEvent } from './internal-request-response'
import type {
  AnyRoute,
  AnyRouter,
  AnySerializationAdapter,
  Register,
} from '@tanstack/router-core'
import type {
  HandlerCallback,
  HandlerCallbackResult,
  SsrResponse,
} from '@tanstack/router-core/ssr/server'
import type { FinalManifestOptions } from './finalManifest'
import type { PipelineContext } from './request-middleware'

type TODO = any

type AnyMiddlewareServerFn =
  | AnyRequestMiddleware['options']['server']
  | AnyFunctionMiddleware['options']['server']

export interface CreateStartHandlerOptions extends FinalManifestOptions {
  handler: HandlerCallback<AnyRouter>
}

function getStartResponseHeaders(router: AnyRouter) {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' })
  const matches = _getRenderedMatches(router.stores.matches.get())
  // Most matches set no headers; merge only when one does.
  return matches.some((match) => match.headers)
    ? mergeHeaders(headers, ...matches.map((match) => match.headers))
    : headers
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

// Share initialization, then reuse the loaded entries without a promise wait.
let cachedEntries: Entries | Promise<Entries> | undefined
let hasWarnedMissingCsrfMiddleware = false
const defaultCsrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const getCachedBaseManifest = createCachedBaseManifestLoader(() =>
  getStartManifest(),
)
const getProdBaseManifest: typeof getStartManifest = () =>
  getCachedBaseManifest()
const getBaseManifest =
  process.env.TSS_DEV_SERVER === 'true' ? getStartManifest : getProdBaseManifest
const createEarlyHintsForRequest: typeof createEarlyHintsCollector =
  process.env.TSS_DEV_SERVER === 'true'
    ? () => undefined
    : createEarlyHintsCollector

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
  if (!cachedEntries) {
    cachedEntries = loadEntries().then((entries) => {
      cachedEntries = entries
      return entries
    })
  }
  return cachedEntries
}

function hasCsrfMiddleware(
  middlewares: Array<AnyRequestMiddleware | AnyFunctionMiddleware>,
): boolean {
  return middlewares.some((middleware) => csrfSymbol in middleware)
}

function warnMissingCsrfMiddlewareOnce() {
  if (hasWarnedMissingCsrfMiddleware) return
  hasWarnedMissingCsrfMiddleware = true

  console.warn(`TanStack Start server functions are not protected by the CSRF middleware.

Server functions are same-origin RPC endpoints and should be protected from cross-site requests.

Add the CSRF middleware in src/start.ts:

  const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === 'serverFn',
  })

  export const startInstance = createStart(() => ({
    requestMiddleware: [csrfMiddleware],
  }))

If you intentionally handle CSRF another way, disable this warning:

  tanstackStart({
    serverFns: {
      disableCsrfMiddlewareWarning: true,
    },
  })`)
}

// Pre-computed constants
const ROUTER_BASEPATH = process.env.TSS_ROUTER_BASEPATH || '/'
const SERVER_FN_BASE = process.env.TSS_SERVER_FN_BASE
const IS_PRERENDERING = process.env.TSS_PRERENDERING === 'true'
const IS_SHELL_ENV = process.env.TSS_SHELL === 'true'

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
  const handlerOptions: FinalManifestOptions =
    typeof cbOrOptions === 'function' ? {} : cbOrOptions
  const cb: HandlerCallback<AnyRouter> =
    typeof cbOrOptions === 'function' ? cbOrOptions : cbOrOptions.handler
  const finalManifestResolver = createFinalManifestResolver({
    ...handlerOptions,
    cacheCreateTransform: process.env.TSS_DEV_SERVER !== 'true',
  })
  const resolveManifestForRequest =
    process.env.TSS_DEV_SERVER === 'true'
      ? finalManifestResolver.resolveUncached
      : finalManifestResolver.resolveCached

  if (process.env.TSS_DEV_SERVER !== 'true') {
    finalManifestResolver.warmup({
      getBaseManifest: () => getBaseManifest(undefined),
    })
  }

  const startRequestResolver = async (
    request: Request,
    requestOpts: RequestOptions<Register> | undefined,
    event: StartEvent,
  ): Promise<Response> => {
    const signal = request.signal
    let router: AnyRouter | undefined
    let routerPromise: Promise<AnyRouter> | undefined
    let responseOwnsCleanup = false
    let response: Response | undefined

    try {
      signal.throwIfAborted()
      // The Start event already parsed and validated the request URL; reuse
      // it instead of re-parsing. The memoized URL must not be mutated.
      const requestUrl = event.requestUrl
      let url = requestUrl
      const pathname = url.pathname
      // Plain RPC paths need no routing normalization. Their payload is read
      // from the original query; normalize only if they later request a router.
      if (
        !SERVER_FN_BASE ||
        !pathname.startsWith(SERVER_FN_BASE) ||
        pathname.includes('%') ||
        pathname.startsWith('//')
      ) {
        const normalized = getNormalizedURL(requestUrl)
        url = normalized.url
        if (normalized.handledProtocolRelativeURL) {
          return finalizeResponse(Response.redirect(url, 308), event)
        }
      }

      const pendingEntries = getEntries()
      const entries = isPromise(pendingEntries)
        ? await waitForRequest(pendingEntries, signal)
        : pendingEntries
      const isServerFnRequest =
        !!SERVER_FN_BASE && url.pathname.startsWith(SERVER_FN_BASE)
      const startInstance = entries.startEntry.startInstance
      let startOptions: AnyStartInstanceOptions
      if (startInstance) {
        const pendingStartOptions = startInstance.getOptions()
        startOptions = isPromise(pendingStartOptions)
          ? await waitForRequest(pendingStartOptions, signal)
          : pendingStartOptions
        signal.throwIfAborted()
      } else {
        startOptions = {} as AnyStartInstanceOptions
      }

      const { hasPluginAdapters, pluginSerializationAdapters } =
        entries.pluginAdapters

      const serializationAdapters = [
        ...(startOptions.serializationAdapters || []),
        ...(hasPluginAdapters ? pluginSerializationAdapters : []),
        ServerFunctionSerializationAdapter,
      ]

      const requestStartOptions = {
        ...startOptions,
        requestMiddleware: startInstance
          ? startOptions.requestMiddleware
          : isServerFnRequest
            ? [defaultCsrfMiddleware]
            : undefined,
        serializationAdapters,
      }

      const requestMiddleware = requestStartOptions.requestMiddleware
      let executedRequestMiddlewares: Set<TODO> | undefined
      let flattenedRequestMiddlewares: ReturnType<typeof flattenMiddlewares> =
        []
      if (requestMiddleware?.length) {
        // Reuse the flattening set for request middleware deduplication.
        executedRequestMiddlewares = new Set()
        flattenedRequestMiddlewares = flattenMiddlewares(
          requestMiddleware,
          undefined,
          executedRequestMiddlewares,
        )
      }

      // Memoized router getter
      const getRouter = (): Promise<AnyRouter> => {
        routerPromise ??= (async () => {
          signal.throwIfAborted()
          const routerUrl = url === requestUrl ? getNormalizedURL(url).url : url
          const pendingRouter = entries.routerEntry.getRouter()
          const requestRouter = isPromise(pendingRouter)
            ? await waitForRequest(pendingRouter, signal)
            : pendingRouter

          let isShell = IS_SHELL_ENV
          if (IS_PRERENDERING && !isShell) {
            isShell = request.headers.get(HEADERS.TSS_SHELL) === 'true'
          }

          const history = createServerHistory(
            routerUrl.pathname + routerUrl.search + routerUrl.hash,
          )

          requestRouter.update({
            history,
            isShell,
            isPrerendering: IS_PRERENDERING,
            origin: requestRouter.options.origin ?? routerUrl.origin,
            // Start-owned options that RouterConstructorOptions omits.
            ...{
              defaultSsr: requestStartOptions.defaultSsr,
              serializationAdapters: requestRouter.options.serializationAdapters
                ?.length
                ? [
                    ...requestStartOptions.serializationAdapters,
                    ...requestRouter.options.serializationAdapters,
                  ]
                : requestStartOptions.serializationAdapters,
            },
            basepath: ROUTER_BASEPATH,
          })

          router = requestRouter
          return requestRouter
        })()

        return routerPromise
      }

      const handlerType = isServerFnRequest
        ? ('serverFn' as const)
        : ('router' as const)
      const startContext = {
        getRouter,
        startOptions: requestStartOptions,
        request,
        executedRequestMiddlewares,
        handlerType,
      }
      let terminal: (
        ctx: PipelineContext,
      ) => Promise<HandlerCallbackResult | DeferredResponse>

      if (isServerFnRequest) {
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING !== 'true' &&
          !hasCsrfMiddleware(flattenedRequestMiddlewares)
        ) {
          warnMissingCsrfMiddlewareOnce()
        }

        const serverFnId = url.pathname
          .slice(SERVER_FN_BASE.length)
          .split('/')[0]

        if (!serverFnId) {
          throw new Error('Invalid server action param for serverFnId')
        }

        terminal = ({ context }) =>
          runWithStartContext(
            { ...startContext, contextAfterGlobalMiddlewares: context },
            () =>
              handleServerAction({
                request,
                serverFnId,
              }),
          )
      } else {
        // Runs as the route pipeline's terminal, which waits on the request
        // signal and disposes a result that settles after an abort.
        const executeRouter = async (
          serverContext: TODO,
          matchedRoutes: ReadonlyArray<AnyRoute>,
          routerInstance: AnyRouter,
        ): Promise<SsrResponse> => {
          if (
            !/(^|,)\s*(\*\/\*|text\/html)/.test(
              request.headers.get('Accept') || '*/*',
            )
          ) {
            return normalizeSsrResponse(
              Response.json(
                { error: 'Only HTML requests are supported here' },
                { status: 406 },
              ),
            )
          }

          const pendingManifest = resolveManifestForRequest({
            request,
            requestInlineCss: requestOpts?.inlineCss,
            getBaseManifest: () => getBaseManifest(matchedRoutes),
          })
          const manifest = isPromise(pendingManifest)
            ? await waitForRequest(pendingManifest, signal)
            : pendingManifest

          const earlyHints = createEarlyHintsForRequest(requestOpts)

          earlyHints?.collectStatic({ manifest, matchedRoutes })

          // The request's stored context, not the resolver's template: RSC
          // adds request assets to it, so read them at call time.
          const storedStartContext = getStartContext({ throwIfNotFound: false })
          attachRouterServerSsrUtils({
            router: routerInstance,
            manifest,
            getRequestAssets: () => storedStartContext?.requestAssets,
          })

          // `additionalContext` is request-scoped and only read from router.options
          // during load; avoid a full router.update() and redundant location parse.
          routerInstance.options.additionalContext = { serverContext }
          await routerInstance.load({
            _signal: signal,
            _skipLocationUpdate: true,
          })
          signal.throwIfAborted()

          if (routerInstance._serverResult?.type === 'redirect') {
            return normalizeSsrResponse(routerInstance._serverResult.redirect)
          }

          earlyHints?.collectDynamic(
            _getRenderedMatches(routerInstance.stores.matches.get()),
          )

          // Pass request-scoped assets to dehydrate for manifest injection
          await routerInstance.serverSsr!.dehydrate({
            requestAssets: storedStartContext?.requestAssets,
            signal,
          })
          signal.throwIfAborted()

          const responseHeaders = getStartResponseHeaders(routerInstance)
          earlyHints?.appendResponseHeaders(responseHeaders)
          signal.throwIfAborted()
          return normalizeSsrResponse(
            await cb({
              request,
              router: routerInstance,
              responseHeaders,
            }),
          )
        }

        terminal = ({ context }) =>
          runWithStartContext(
            { ...startContext, contextAfterGlobalMiddlewares: context },
            () =>
              handleServerRoutes({
                getRouter,
                request,
                executeRouter,
                context,
                executedRequestMiddlewares,
                signal,
                event,
              }),
          )
      }

      const middlewareCtx: PipelineContext = {
        request,
        pathname: url.pathname,
        handlerType,
        context: createNullProtoObject(requestOpts?.context),
      }
      let middlewareResponse: HandlerCallbackResult
      try {
        if (!isServerFnRequest && flattenedRequestMiddlewares.length === 0) {
          // An empty global pipeline has no additional middleware to run. The
          // route pipeline already reconciles responses, owns cleanup, and
          // waits on the request signal for every pending result. Only
          // server-function terminals can defer JSON construction.
          middlewareResponse = await (terminal(
            middlewareCtx,
          ) as Promise<HandlerCallbackResult>)
        } else {
          middlewareResponse = await executeMiddleware(
            flattenedRequestMiddlewares.map((d) => d.options.server),
            terminal,
            middlewareCtx,
            signal,
            event,
          )
        }
      } catch (error) {
        if (signal.aborted) {
          throw error
        }
        if (error instanceof Response) {
          middlewareResponse = reconcileResponse(error, event)
        } else if (!isServerFnRequest) {
          throw error
        } else {
          // Request middleware can throw before the server function runs.
          const disposeLate = createLateResponseDisposer(signal)
          middlewareResponse = await waitForRequest(
            runWithStartContext(
              {
                ...startContext,
                contextAfterGlobalMiddlewares: middlewareCtx.context,
              },
              () => createServerFnErrorResponse(error),
            ),
            signal,
            disposeLate,
            disposeLate,
          )
          middlewareResponse = reconcileResponse(middlewareResponse, event)
        }
      }

      let result: SsrResponse
      try {
        result = normalizeSsrResponse(middlewareResponse)
        if (isRedirect(result.response)) {
          result = await handleRedirectResponse(
            result,
            getRouter,
            signal,
            isServerFnRequest &&
              request.headers.get('x-tsr-serverFn') === 'true',
            event,
          )
        }
        // Request middleware can read a HEAD body, for example to compute an
        // ETag, so it is stripped only when the response leaves the pipeline.
        if (request.method === 'HEAD' && result.response.body !== null) {
          const source = result.response
          result = stripSsrResponseBody(result, 'HEAD body stripped')
          transferResponseMetadata(source, result.response)
        }
      } catch (error) {
        disposeResponseResult(
          middlewareResponse,
          signal.aborted ? signal.reason : error,
        )
        throw error
      }
      bindSsrResponseToRequest(router, result, signal)
      signal.throwIfAborted()
      responseOwnsCleanup = result.serverSsrCleanup === 'stream'
      response = result.response
    } finally {
      if (router?.serverSsr && !responseOwnsCleanup) {
        // Stream disposal already publishes its cleanup writes at the pipeline
        // boundary. Only live eager SSR state can still add response helpers.
        router.serverSsr.cleanup()
        if (response) {
          response = finalizeResponse(response, event)
        }
      }
      // `routerPromise` stays memoized: a streamed Suspense boundary or a late
      // server function may still ask for this request's router.
    }
    return response
  }

  return withStartRequest(startRequestResolver)
}

const relativeRedirectProtocols = new Set<string>()
const SERIALIZED_REDIRECT_HEADERS: ReadonlyMap<string, string | null> = new Map(
  [
    ['content-type', 'application/json'],
    ['location', null],
    [X_TSS_RAW_RESPONSE, null],
    [X_TSS_SERIALIZED, null],
  ],
)

async function handleRedirectResponse(
  ssrResponse: SsrResponse,
  getRouter: () => Promise<AnyRouter>,
  signal: AbortSignal,
  serializeRedirect: boolean,
  event: StartEvent,
): Promise<SsrResponse> {
  signal.throwIfAborted()
  const redirect = ssrResponse.response
  if (!isRedirect(redirect)) {
    return ssrResponse
  }

  const opts = redirect.options
  const href = redirect.headers.get('Location') || opts.href
  if (
    !href &&
    opts.to &&
    typeof opts.to === 'string' &&
    !opts.to.startsWith('/')
  ) {
    throw new Error(
      `Server side redirects must use absolute paths via the 'href' or 'to' options. The redirect() method's "to" property accepts an internal path only. Use the "href" property to provide an external URL. Received: ${JSON.stringify(opts)}`,
    )
  }

  if (
    !href &&
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

  signal.throwIfAborted()
  // Unambiguous relative hrefs need no route resolution or protocol policy.
  // Every scheme falls back to the router to honor its custom allowlist.
  if (href && !isDangerousProtocol(href, relativeRedirectProtocols)) {
    opts.href = href
    redirect.headers.set('Location', href)
  } else {
    const router = await getRouter()
    signal.throwIfAborted()
    // Resolves `redirect` in place.
    router.resolveRedirect(redirect)
  }

  if (serializeRedirect) {
    const redirectOptions = { ...(opts as TODO) }
    delete redirectOptions.headers
    redirectOptions.isSerializedRedirect = true
    const responseHeaders = new Headers(redirect.headers)
    responseHeaders.set('content-type', 'application/json')
    // The client follows the href in this JSON envelope. An HTTP Location
    // would let fetch follow it first if a response helper selected 3xx.
    responseHeaders.delete('location')
    responseHeaders.delete(X_TSS_RAW_RESPONSE)
    responseHeaders.delete(X_TSS_SERIALIZED)
    // A caller-supplied toJSON can return undefined despite the library type.
    const body = JSON.stringify(redirectOptions) as string | undefined
    if (body === undefined) {
      throw new TypeError('Value is not JSON serializable')
    }
    // Both serialization and disposal can write helpers. Construct the envelope
    // afterward with its final state instead of reconciling a temporary response.
    disposeSsrResponse(ssrResponse, 'redirect response replaced')
    return {
      response: createFinalizedResponse(
        body,
        responseHeaders,
        SERIALIZED_REDIRECT_HEADERS,
        event,
      ),
      serverSsrCleanup: 'none',
    }
  }

  ssrResponse.response = finalizeResponse(redirect, event)
  return ssrResponse
}

function withParsedParams(
  handler: RouteMethodHandlerFn<any, AnyRoute, any, any, any, any, any>,
  matchedRoutes: ReadonlyArray<AnyRoute>,
): TODO {
  if (
    !matchedRoutes.some(
      (route) => route.options.params?.parse ?? route.options.parseParams,
    )
  ) {
    return handler
  }

  return (ctx: TODO) => {
    // Parse inside the pipeline so middleware can catch errors. Keep the raw
    // params for app-router validation when the handler defers to rendering.
    const params = Object.assign(Object.create(null), ctx.params)
    for (const route of matchedRoutes) {
      const parse = route.options.params?.parse ?? route.options.parseParams
      if (parse) {
        Object.assign(params, parse(params))
      }
    }
    return handler({ ...ctx, params })
  }
}

async function handleServerRoutes({
  getRouter,
  request,
  executeRouter,
  context,
  executedRequestMiddlewares,
  signal,
  event,
}: {
  getRouter: () => Promise<AnyRouter>
  request: Request
  executeRouter: (
    serverContext: any,
    matchedRoutes: ReadonlyArray<AnyRoute>,
    router: AnyRouter,
  ) => Promise<SsrResponse>
  context: any
  executedRequestMiddlewares: Set<AnyRequestMiddleware> | undefined
  signal: AbortSignal
  event: StartEvent
}): Promise<SsrResponse> {
  const router = await getRouter()
  const { pathname } = router.latestLocation
  // this will perform a fuzzy match, however for server routes we need an exact match
  // if the route is not an exact match, executeRouter will handle rendering the app router
  // The cached match avoids another route-tree traversal during the app router render.
  const [matchedRoutes, rawParams, foundRoute] =
    router.getMatchedRoutes(pathname)

  const isExactMatch = foundRoute && rawParams['**'] === undefined

  // Collect and dedupe route middlewares
  const routeMiddlewares: Array<AnyMiddlewareServerFn> = []
  let terminalHandler: TODO = (ctx: TODO) =>
    executeRouter(ctx.context, matchedRoutes, router)
  let terminalNext: TODO

  // Collect middleware from matched routes, filtering out those already executed
  // in the request phase
  for (const route of matchedRoutes) {
    const serverMiddleware = route.options.server?.middleware as
      | Array<AnyRequestMiddleware>
      | undefined
    if (serverMiddleware) {
      const flattened = flattenMiddlewares(serverMiddleware)
      for (const m of flattened) {
        if (!executedRequestMiddlewares?.has(m)) {
          routeMiddlewares.push(m.options.server)
        }
      }
    }
  }

  // Add handler middleware if exact match
  const server = foundRoute?.options.server
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
    if (handler) {
      const mayDefer = !!foundRoute.options.component

      if (typeof handler !== 'function') {
        if (handler.middleware?.length) {
          const handlerMiddlewares = flattenMiddlewares(handler.middleware)
          for (const m of handlerMiddlewares) {
            routeMiddlewares.push(m.options.server)
          }
        }
      }
      const routeHandler =
        typeof handler === 'function' ? handler : handler.handler
      if (routeHandler) {
        const parsedHandler = withParsedParams(routeHandler, matchedRoutes)
        if (!mayDefer) {
          terminalHandler = parsedHandler
          terminalNext = throwIfMayNotDefer
        } else {
          routeMiddlewares.push(parsedHandler)
        }
      }
    }
  }

  const response = await executeMiddleware(
    routeMiddlewares,
    terminalHandler,
    {
      request,
      context,
      params: rawParams,
      pathname,
      handlerType: 'router',
    },
    signal,
    event,
    terminalNext,
  )

  return normalizeSsrResponse(response)
}
