import { createMemoryHistory } from '@tanstack/history'
import {
  createCsrfMiddleware,
  createNullProtoObject,
  csrfSymbol,
  flattenMiddlewares,
  mergeHeaders,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import {
  _getRenderedMatches,
  executeRewriteInput,
  isRedirect,
  isResolvedRedirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  bindSsrResponseToRequest,
  disposeSsrResponse,
  getNormalizedURL,
  getOrigin,
  isSsrResponse,
  normalizeSsrResponse,
  replaceSsrResponse,
  stripSsrResponseBody,
  waitForReason,
} from '@tanstack/router-core/ssr/server'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import { requestHandler } from './request-response'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'
import { createEarlyHintsCollector } from './early-hints'
import {
  createCachedBaseManifestLoader,
  createFinalManifestResolver,
} from './finalManifest'

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

type TODO = any

type AnyMiddlewareServerFn =
  | AnyRequestMiddleware['options']['server']
  | AnyFunctionMiddleware['options']['server']

export interface CreateStartHandlerOptions extends FinalManifestOptions {
  handler: HandlerCallback<AnyRouter>
}

function getStartResponseHeaders(opts: { router: AnyRouter }) {
  const headers = mergeHeaders(
    {
      'Content-Type': 'text/html; charset=utf-8',
    },
    ..._getRenderedMatches(opts.router.stores.matches.get()).map((match) => {
      return match.headers
    }),
  )
  return headers
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
  if (!entriesPromise) {
    entriesPromise = loadEntries()
  }
  return entriesPromise
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
 * Normalize middleware result to context shape
 */
function handleCtxResult(result: TODO) {
  if (isSsrResponse(result) || result instanceof Response) {
    return { response: result }
  }
  return result
}

type StreamSsrResponse = Extract<SsrResponse, { serverSsrCleanup: 'stream' }>

type ResponseBody = NonNullable<Response['body']>
type ResponseWithBody = Response & { readonly body: ResponseBody }

interface MiddlewareResponseOwnership {
  response: ResponseWithBody
  sourceBody: ResponseBody
  streamResponse?: StreamSsrResponse
}

const responseBodySources = new WeakMap<Response, Response>()

function disposeLateResponse(result: TODO, signal: AbortSignal): void {
  const response = handleCtxResult(result)?.response
  if (isSsrResponse(response)) {
    responseBodySources.delete(response.response)
    disposeSsrResponse(response, signal.reason)
  } else if (response instanceof Response) {
    responseBodySources.delete(response)
    disposeSsrResponse(response, signal.reason)
  }
}

/**
 * Marks `response` as directly derived from the current `source`.
 * Middleware must consume or cancel any other `clone()` or `tee()` branches.
 */
export function transferResponseBodyOwnership<TResponse extends Response>(
  source: Response,
  response: TResponse,
): TResponse {
  if (!source.body || !response.body) {
    throw new Error('Response body ownership requires two response bodies')
  }
  responseBodySources.set(response, source)
  return response
}

function hasResponseBody(value: unknown): value is ResponseWithBody {
  return value instanceof Response && value.body !== null
}

function inheritsResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  candidate: unknown,
): candidate is ResponseWithBody {
  return (
    candidate === ownership.response ||
    (hasResponseBody(candidate) &&
      (candidate.body === ownership.response.body ||
        responseBodySources.get(candidate) === ownership.response))
  )
}

function disposeResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  reason: unknown,
): void {
  const { response, sourceBody, streamResponse } = ownership
  streamResponse?.dispose(reason)
  if (!streamResponse || response.body !== sourceBody) {
    void response.body.cancel(reason).catch(() => {})
  }
}

function getOwnedResponse(
  ownership: MiddlewareResponseOwnership,
): HandlerCallbackResult {
  const { response, sourceBody, streamResponse } = ownership
  if (!streamResponse) {
    return response
  }
  if (streamResponse.response === response && response.body === sourceBody) {
    return streamResponse
  }
  if (response.body === sourceBody) {
    return { ...streamResponse, response }
  }
  return {
    ...streamResponse,
    response,
    dispose(reason): undefined {
      disposeResponseOwnership(ownership, reason)
    },
  }
}

function createLateResponseDisposer(signal: AbortSignal) {
  return (result: TODO) => disposeLateResponse(result, signal)
}

/**
 * Execute a middleware chain
 */
async function executeMiddleware(
  middlewares: Array<TODO>,
  ctx: TODO,
  signal: AbortSignal,
): Promise<HandlerCallbackResult> {
  let index = -1
  let responseOwnership: MiddlewareResponseOwnership | undefined
  const disposeAbandonedResult = createLateResponseDisposer(signal)

  const setResponse = (response: TODO) => {
    const streamResponse =
      isSsrResponse(response) && response.serverSsrCleanup === 'stream'
        ? response
        : undefined
    const exposed = isSsrResponse(response) ? response.response : response
    const current = responseOwnership

    if (current && inheritsResponseOwnership(current, exposed)) {
      responseBodySources.delete(exposed)
      current.response = exposed
      current.streamResponse ??= streamResponse
    } else {
      if (current) {
        disposeResponseOwnership(current, 'middleware response replaced')
      }
      if (hasResponseBody(exposed)) {
        responseOwnership = {
          response: exposed,
          sourceBody: exposed.body,
          streamResponse,
        }
      } else {
        responseOwnership = undefined
      }
    }
    ctx.response = exposed
  }

  const reconcileCtxResponse = () => {
    if (ctx.response !== responseOwnership?.response) {
      setResponse(ctx.response)
    }
  }

  const getFinalResponse = (): HandlerCallbackResult => {
    const response = ctx.response
    if (!response) {
      throwRouteHandlerError()
    }

    reconcileCtxResponse()

    return responseOwnership ? getOwnedResponse(responseOwnership) : response
  }

  let nextPromise: Promise<TODO> | undefined

  function next(nextCtx?: TODO): Promise<TODO> {
    const result = runNext(nextCtx)
    nextPromise = result
    return result
  }

  async function runNext(nextCtx?: TODO): Promise<TODO> {
    signal.throwIfAborted()

    // Merge context if provided using safeObjectMerge for prototype pollution prevention
    if (nextCtx) {
      if (nextCtx.context) {
        ctx.context = safeObjectMerge(ctx.context, nextCtx.context)
      }
      // Copy own properties except context (Object.keys returns only own enumerable properties)
      for (const key of Object.keys(nextCtx)) {
        if (key === 'response') {
          setResponse(nextCtx.response)
        } else if (key !== 'context') {
          ctx[key] = nextCtx[key]
        }
      }
    }

    index++
    const middleware = middlewares[index]
    if (!middleware) return ctx

    let result: TODO
    try {
      const pending = middleware({ ...ctx, next })
      // A directly returned next() promise already propagates request aborts.
      if (pending === nextPromise) {
        nextPromise = undefined
        result = await pending
        if (signal.aborted) {
          throw signal.reason
        }
      } else {
        result = await waitForReason(
          pending,
          signal,
          disposeAbandonedResult,
          disposeAbandonedResult,
        )
      }
    } catch (err) {
      reconcileCtxResponse()
      if (signal.aborted) {
        if (err !== signal.reason) {
          disposeAbandonedResult(err)
        }
        throw signal.reason
      }
      if (err instanceof Response) {
        setResponse(err)
        return ctx
      }
      throw err
    }

    const normalized = handleCtxResult(result)
    reconcileCtxResponse()
    if (normalized) {
      if (normalized.response !== undefined) {
        setResponse(normalized.response)
      }
      if (normalized.context) {
        ctx.context = safeObjectMerge(ctx.context, normalized.context)
      }
    }

    return ctx
  }

  try {
    await runNext()
    const response = getFinalResponse()
    if (signal.aborted) {
      throw signal.reason
    }
    return response
  } catch (err) {
    if (responseOwnership) {
      disposeResponseOwnership(
        responseOwnership,
        signal.aborted ? signal.reason : err,
      )
    }
    throw err
  }
}

/**
 * Wrap a route handler as middleware
 */
function handlerToMiddleware(
  handler: RouteMethodHandlerFn<any, AnyRoute, any, any, any, any, any>,
  mayDefer: boolean,
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

  const startRequestResolver: RequestHandler<Register> = async (
    request,
    requestOpts,
  ) => {
    const signal = request.signal
    let router: AnyRouter | undefined
    let routerPromise: Promise<AnyRouter> | undefined
    let responseOwnsCleanup = false

    try {
      signal.throwIfAborted()
      // normalizing and sanitizing the pathname here for server, so we always deal with the same format during SSR.
      // during normalization paths like '//posts' are flattened to '/posts'.
      // in these cases we would prefer to redirect to the new path
      const { url, handledProtocolRelativeURL } = getNormalizedURL(request.url)
      const href = url.pathname + url.search + url.hash
      const origin = getOrigin(request)

      if (handledProtocolRelativeURL) {
        return Response.redirect(url, 308)
      }

      const entries = await waitForReason(getEntries(), signal)
      const hasStartInstance = !!entries.startEntry.startInstance
      const startOptions: AnyStartInstanceOptions =
        (await waitForReason(
          entries.startEntry.startInstance?.getOptions(),
          signal,
        )) || ({} as AnyStartInstanceOptions)

      const { hasPluginAdapters, pluginSerializationAdapters } =
        entries.pluginAdapters

      const serializationAdapters = [
        ...(startOptions.serializationAdapters || []),
        ...(hasPluginAdapters ? pluginSerializationAdapters : []),
        ServerFunctionSerializationAdapter,
      ]

      const requestStartOptions = {
        ...startOptions,
        requestMiddleware: hasStartInstance
          ? startOptions.requestMiddleware
          : [defaultCsrfMiddleware],
        serializationAdapters,
      }

      // Flatten request middlewares once
      const flattenedRequestMiddlewares = requestStartOptions.requestMiddleware
        ? flattenMiddlewares(requestStartOptions.requestMiddleware)
        : []

      // Create set for deduplication
      const executedRequestMiddlewares = new Set<TODO>(
        flattenedRequestMiddlewares,
      )

      // Memoized router getter
      const getRouter = (): Promise<AnyRouter> => {
        routerPromise ??= (async () => {
          signal.throwIfAborted()
          const requestRouter = await waitForReason(
            entries.routerEntry.getRouter(),
            signal,
          )

          let isShell = IS_SHELL_ENV
          if (IS_PRERENDERING && !isShell) {
            isShell = request.headers.get(HEADERS.TSS_SHELL) === 'true'
          }

          const history = createMemoryHistory({
            initialEntries: [href],
          })

          requestRouter.update({
            history,
            isShell,
            isPrerendering: IS_PRERENDERING,
            origin: requestRouter.options.origin ?? origin,
            ...{
              defaultSsr: requestStartOptions.defaultSsr,
              serializationAdapters: [
                ...requestStartOptions.serializationAdapters,
                ...(requestRouter.options.serializationAdapters || []),
              ],
            },
            basepath: ROUTER_BASEPATH,
          })

          router = requestRouter
          return requestRouter
        })()

        return routerPromise
      }

      // Check for server function requests first (early exit)
      if (SERVER_FN_BASE && url.pathname.startsWith(SERVER_FN_BASE)) {
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
        const middlewareResponse = await executeMiddleware(
          [...middlewares, serverFnHandler],
          {
            request,
            pathname: url.pathname,
            handlerType: 'serverFn',
            context: createNullProtoObject(requestOpts?.context),
          },
          signal,
        )

        const result = finalizeResponseForRequest(
          await handleRedirectResponse(middlewareResponse, request, getRouter),
          request,
        )
        bindSsrResponseToRequest(router, result, signal)
        signal.throwIfAborted()
        responseOwnsCleanup = result.serverSsrCleanup === 'stream'
        return result.response
      }

      // Router execution function
      const executeRouter = async (
        serverContext: TODO,
        matchedRoutes?: ReadonlyArray<AnyRoute>,
      ): Promise<SsrResponse> => {
        const acceptHeader = request.headers.get('Accept') || '*/*'
        const acceptParts = acceptHeader.split(',')
        const supportedMimeTypes = ['*/*', 'text/html']

        const isSupported = supportedMimeTypes.some((mimeType) =>
          acceptParts.some((part) => part.trim().startsWith(mimeType)),
        )

        if (!isSupported) {
          return normalizeSsrResponse(
            Response.json(
              { error: 'Only HTML requests are supported here' },
              { status: 500 },
            ),
          )
        }

        const manifest = await waitForReason(
          resolveManifestForRequest({
            request,
            requestInlineCss: requestOpts?.inlineCss,
            getBaseManifest: () => getBaseManifest(matchedRoutes),
          }),
          signal,
        )

        const earlyHints = createEarlyHintsForRequest({
          onEarlyHints: requestOpts?.onEarlyHints,
          responseLinkHeader: requestOpts?.responseLinkHeader,
        })

        earlyHints?.collectStatic({ manifest, matchedRoutes })

        const routerInstance = await getRouter()

        attachRouterServerSsrUtils({
          router: routerInstance,
          manifest,
          getRequestAssets: () =>
            getStartContext({ throwIfNotFound: false })?.requestAssets,
        })

        // `additionalContext` is request-scoped and only read from router.options
        // during load; avoid a full router.update() and redundant location parse.
        routerInstance.options.additionalContext = { serverContext }
        await routerInstance.load({ _signal: signal })
        signal.throwIfAborted()

        if (routerInstance._serverResult?.type === 'redirect') {
          return normalizeSsrResponse(routerInstance._serverResult.redirect)
        }

        earlyHints?.collectDynamic(
          _getRenderedMatches(routerInstance.stores.matches.get()),
        )

        // Pass request-scoped assets to dehydrate for manifest injection
        const ctx = getStartContext({ throwIfNotFound: false })
        await routerInstance.serverSsr!.dehydrate({
          requestAssets: ctx?.requestAssets,
          signal,
        })
        signal.throwIfAborted()

        const responseHeaders = getStartResponseHeaders({
          router: routerInstance,
        })
        earlyHints?.appendResponseHeaders(responseHeaders)
        signal.throwIfAborted()
        const disposeLate = createLateResponseDisposer(signal)
        const response = await waitForReason(
          cb({
            request,
            router: routerInstance,
            responseHeaders,
          }),
          signal,
          disposeLate,
          disposeLate,
        )
        return normalizeSsrResponse(response)
      }

      // Main request handler
      const requestHandlerMiddleware = ({ context }: TODO) => {
        return runWithStartContext(
          {
            getRouter,
            startOptions: requestStartOptions,
            contextAfterGlobalMiddlewares: context,
            request,
            executedRequestMiddlewares,
            handlerType: 'router',
          },
          () =>
            handleServerRoutes({
              getRouter,
              request,
              url,
              executeRouter,
              context,
              executedRequestMiddlewares,
            }),
        )
      }

      const middlewares = flattenedRequestMiddlewares.map(
        (d) => d.options.server,
      )
      const middlewareResponse = await executeMiddleware(
        [...middlewares, requestHandlerMiddleware],
        {
          request,
          pathname: url.pathname,
          handlerType: 'router',
          context: createNullProtoObject(requestOpts?.context),
        },
        signal,
      )

      const response = finalizeResponseForRequest(
        await handleRedirectResponse(middlewareResponse, request, getRouter),
        request,
      )
      bindSsrResponseToRequest(router, response, signal)
      signal.throwIfAborted()
      responseOwnsCleanup = response.serverSsrCleanup === 'stream'
      return response.response
    } finally {
      if (router?.serverSsr && !responseOwnsCleanup) {
        // Clean up router SSR state if it was set up but won't be cleaned up by the callback
        // (e.g., in redirect cases or early returns before the callback is invoked).
        // Transformed streaming response bodies clean up when consumed/cancelled.
        router.serverSsr.cleanup()
      }
      router = undefined
      routerPromise = undefined
    }
  }

  return requestHandler(startRequestResolver)
}

function finalizeResponseForRequest(
  response: SsrResponse,
  request: Request,
): SsrResponse {
  return request.method === 'HEAD'
    ? stripSsrResponseBody(response, 'HEAD body stripped')
    : response
}

async function handleRedirectResponse(
  response: HandlerCallbackResult,
  request: Request,
  getRouter: () => Promise<AnyRouter>,
): Promise<SsrResponse> {
  const signal = request.signal
  signal.throwIfAborted()
  const ssrResponse = normalizeSsrResponse(response)
  if (!isRedirect(ssrResponse.response)) {
    return ssrResponse
  }

  if (isResolvedRedirect(ssrResponse.response)) {
    if (request.headers.get('x-tsr-serverFn') === 'true') {
      return replaceSsrResponse(
        ssrResponse,
        Response.json(
          { ...ssrResponse.response.options, isSerializedRedirect: true },
          { headers: ssrResponse.response.headers },
        ),
        'redirect response replaced',
      )
    }
    return ssrResponse
  }

  const opts = ssrResponse.response.options
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

  signal.throwIfAborted()
  const router = await getRouter()
  signal.throwIfAborted()
  const redirect = router.resolveRedirect(ssrResponse.response)

  if (request.headers.get('x-tsr-serverFn') === 'true') {
    return replaceSsrResponse(
      ssrResponse,
      Response.json(
        { ...ssrResponse.response.options, isSerializedRedirect: true },
        { headers: ssrResponse.response.headers },
      ),
      'redirect response replaced',
    )
  }

  return replaceSsrResponse(ssrResponse, redirect, 'redirect response replaced')
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
  ) => Promise<SsrResponse>
  context: any
  executedRequestMiddlewares: Set<AnyRequestMiddleware>
}): Promise<SsrResponse> {
  const router = await getRouter()
  const rewrittenUrl = executeRewriteInput(router.rewrite, url)
  const pathname = rewrittenUrl.pathname
  // this will perform a fuzzy match, however for server routes we need an exact match
  // if the route is not an exact match, executeRouter will handle rendering the app router
  // the match will be cached internally, so no extra work is done during the app router render
  const [matchedRoutes, rawParams, foundRoute] =
    router.getMatchedRoutes(pathname)

  const isExactMatch = foundRoute && rawParams['**'] === undefined

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
  routeMiddlewares.push(((ctx: TODO) =>
    executeRouter(ctx.context, matchedRoutes)) as TODO)

  const response = await executeMiddleware(
    routeMiddlewares,
    {
      request,
      context,
      params: rawParams,
      pathname,
      handlerType: 'router',
    },
    request.signal,
  )

  return normalizeSsrResponse(response)
}
