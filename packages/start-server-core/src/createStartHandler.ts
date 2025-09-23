import { createMemoryHistory } from '@tanstack/history'
import {
  flattenMiddlewares,
  json,
  mergeHeaders,
} from '@tanstack/start-client-core'
import {
  executeRewriteInput,
  isRedirect,
  isResolvedRedirect,
  joinPaths,
  trimPath,
} from '@tanstack/router-core'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { getResponseHeaders, requestHandler } from './request-response'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'

import { HEADERS } from './constants'
import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type {
  RouteMethod,
  RouteMethodHandlerFn,
} from '@tanstack/start-client-core'
import type { RequestHandler } from './request-response'
import type {
  AnyRoute,
  AnyRouter,
  Awaitable,
  Manifest,
} from '@tanstack/router-core'
import type { HandlerCallback } from '@tanstack/router-core/ssr/server'

type TODO = any

export type CustomizeStartHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => RequestHandler

function getStartResponseHeaders(opts: { router: AnyRouter }) {
  const headers = mergeHeaders(
    getResponseHeaders() as Headers,
    {
      'Content-Type': 'text/html; charset=utf-8',
    },
    ...opts.router.state.matches.map((match) => {
      return match.headers
    }),
  )
  return headers
}

export function createStartHandler<TRouter extends AnyRouter>({
  createRouter,
}: {
  createRouter: () => Awaitable<TRouter>
}): CustomizeStartHandler<TRouter> {
  let startRoutesManifest: Manifest | null = null

  return (cb) => {
    const originalFetch = globalThis.fetch

    const startRequestResolver: RequestHandler = async (request) => {
      function getOrigin() {
        const originHeader = request.headers.get('Origin')
        if (originHeader) {
          return originHeader
        }
        try {
          return new URL(request.url).origin
        } catch (_) {}
        return 'http://localhost'
      }

      // Patching fetch function to use our request resolver
      // if the input starts with `/` which is a common pattern for
      // client-side routing.
      // When we encounter similar requests, we can assume that the
      // user wants to use the same origin as the current request.
      globalThis.fetch = async function (input, init) {
        function resolve(url: URL, requestOptions: RequestInit | undefined) {
          const fetchRequest = new Request(url, requestOptions)
          return startRequestResolver(fetchRequest)
        }

        if (typeof input === 'string' && input.startsWith('/')) {
          // e.g: fetch('/api/data')
          const url = new URL(input, getOrigin())
          return resolve(url, init)
        } else if (
          typeof input === 'object' &&
          'url' in input &&
          typeof input.url === 'string' &&
          input.url.startsWith('/')
        ) {
          // e.g: fetch(new Request('/api/data'))
          const url = new URL(input.url, getOrigin())
          return resolve(url, init)
        }

        // If not, it should just use the original fetch
        return originalFetch(input, init)
      }

      const url = new URL(request.url)
      const href = url.href.replace(url.origin, '')

      // TODO do we remove this?
      const APP_BASE = process.env.TSS_APP_BASE || '/'

      // TODO how does this work with base path? does the router need to be configured the same as APP_BASE?
      const router = await createRouter()

      // Update the client-side router with the history
      const isPrerendering = process.env.TSS_PRERENDERING === 'true'
      // env var is set during dev is SPA mode is enabled
      let isShell = process.env.TSS_SHELL === 'true'
      if (isPrerendering && !isShell) {
        // only read the shell header if we are prerendering
        // to avoid runtime behavior changes by injecting this header
        // the header is set by the prerender plugin
        isShell = request.headers.get(HEADERS.TSS_SHELL) === 'true'
      }
      // insert start specific default serialization adapters
      const serializationAdapters = (
        router.options.serializationAdapters ?? []
      ).concat(ServerFunctionSerializationAdapter)

      // Create a history for the client-side router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      const origin = router.options.origin ?? getOrigin()
      router.update({
        history,
        isShell,
        isPrerendering,
        serializationAdapters,
        origin,
      })

      // TODO make all this one big middleware chain
      // 1. global request middlewares
      // 2. serverFunctionMiddleware, will handle the request if the request path matches
      //  => invoke server function and pass in context from global request middlewares
      // 3. server routes
      // 4. render router
      const response = await runWithStartContext({ router }, async () => {
        try {
          if (!process.env.TSS_SERVER_FN_BASE) {
            throw new Error(
              'tanstack/start-server-core: TSS_SERVER_FN_BASE must be defined in your environment for createStartHandler()',
            )
          }

          // First, let's attempt to handle server functions
          // Add trailing slash to sanitise user defined TSS_SERVER_FN_BASE
          const serverFnBase = joinPaths([
            APP_BASE,
            trimPath(process.env.TSS_SERVER_FN_BASE),
            '/',
          ])
          if (href.startsWith(serverFnBase)) {
            return await handleServerAction({ request })
          }

          const executeRouter = async ({
            serverContext,
          }: {
            serverContext: any
          }) => {
            const requestAcceptHeader = request.headers.get('Accept') || '*/*'
            const splitRequestAcceptHeader = requestAcceptHeader.split(',')

            const supportedMimeTypes = ['*/*', 'text/html']
            const isRouterAcceptSupported = supportedMimeTypes.some(
              (mimeType) =>
                splitRequestAcceptHeader.some((acceptedMimeType) =>
                  acceptedMimeType.trim().startsWith(mimeType),
                ),
            )

            if (!isRouterAcceptSupported) {
              return json(
                {
                  error: 'Only HTML requests are supported here',
                },
                {
                  status: 500,
                },
              )
            }

            // if the startRoutesManifest is not loaded yet, load it once
            if (startRoutesManifest === null) {
              startRoutesManifest = await getStartManifest({
                basePath: APP_BASE,
              })
            }

            attachRouterServerSsrUtils(router, startRoutesManifest)

            router.update({ additionalContext: { serverContext } })
            await router.load()

            // If there was a redirect, skip rendering the page at all
            if (router.state.redirect) {
              return router.state.redirect
            }

            await router.serverSsr!.dehydrate()

            const responseHeaders = getStartResponseHeaders({ router })
            const response = await cb({
              request,
              router,
              responseHeaders,
            })

            return response
          }

          const response = await handleServerRoutes({
            router,
            request,
            executeRouter,
          })

          return response
        } catch (err) {
          if (err instanceof Response) {
            return err
          }

          throw err
        }
      })

      if (isRedirect(response)) {
        if (isResolvedRedirect(response)) {
          if (request.headers.get('x-tsr-redirect') === 'manual') {
            return json(
              {
                ...response.options,
                isSerializedRedirect: true,
              },
              {
                headers: response.headers,
              },
            )
          }
          return response
        }
        if (
          response.options.to &&
          typeof response.options.to === 'string' &&
          !response.options.to.startsWith('/')
        ) {
          throw new Error(
            `Server side redirects must use absolute paths via the 'href' or 'to' options. The redirect() method's "to" property accepts an internal path only. Use the "href" property to provide an external URL. Received: ${JSON.stringify(response.options)}`,
          )
        }

        if (
          ['params', 'search', 'hash'].some(
            (d) => typeof (response.options as any)[d] === 'function',
          )
        ) {
          throw new Error(
            `Server side redirects must use static search, params, and hash values and do not support functional values. Received functional values for: ${Object.keys(
              response.options,
            )
              .filter((d) => typeof (response.options as any)[d] === 'function')
              .map((d) => `"${d}"`)
              .join(', ')}`,
          )
        }

        const redirect = router.resolveRedirect(response)

        if (request.headers.get('x-tsr-redirect') === 'manual') {
          return json(
            {
              ...response.options,
              isSerializedRedirect: true,
            },
            {
              headers: response.headers,
            },
          )
        }

        return redirect
      }

      return response
    }

    return requestHandler(startRequestResolver)
  }
}

async function handleServerRoutes({
  router,
  request,
  executeRouter,
}: {
  router: AnyRouter
  request: Request
  executeRouter: ({
    serverContext,
  }: {
    serverContext: any
  }) => Promise<Response>
}) {
  let url = new URL(request.url)
  url = executeRewriteInput(router.rewrite, url)
  const pathname = url.pathname
  const { matchedRoutes, foundRoute, routeParams } = router.getMatchedRoutes(
    pathname,
    undefined,
  )

  // TODO: Error handling? What happens when its `throw redirect()` vs `throw new Error()`?

  const middlewares = flattenMiddlewares(
    matchedRoutes.flatMap((r) => r.options.server?.middleware).filter(Boolean),
  ).map((d) => d.options.server)

  const server = foundRoute?.options.server

  if (server) {
    if (server.handlers) {
      const handlers =
        typeof server.handlers === 'function'
          ? server.handlers({
              createHandlers: (d: any) => d,
            })
          : server.handlers

      const requestMethod = request.method.toLowerCase()

      // Attempt to find the method in the handlers
      let method = Object.keys(handlers).find(
        (method) => method.toLowerCase() === requestMethod,
      )

      // If no method is found, attempt to find the 'all' method
      if (!method) {
        method = Object.keys(handlers).find(
          (method) => method.toLowerCase() === 'all',
        )
          ? 'all'
          : undefined
      }

      // If a method is found, execute the handler
      if (method) {
        const handler = handlers[method as RouteMethod]
        if (handler) {
          const mayDefer = !!foundRoute.options.component
          if (typeof handler === 'function') {
            middlewares.push(handlerToMiddleware(handler, mayDefer))
          } else {
            const { middleware } = handler
            if (middleware && middleware.length) {
              middlewares.push(
                ...flattenMiddlewares(middleware).map((d) => d.options.server),
              )
            }
            if (handler.handler) {
              middlewares.push(handlerToMiddleware(handler.handler, mayDefer))
            }
          }
        }
      }
    }
  }

  // eventually, execute the router
  middlewares.push(
    handlerToMiddleware(
      (ctx) => executeRouter({ serverContext: ctx.context }),
      false,
    ),
  )

  // TODO: This is starting to feel too much like a server function
  // Do generalize the existing middleware execution? Or do we need to
  // build a new middleware execution system for server routes?
  const ctx = await executeMiddleware(middlewares, {
    request,
    context: {},
    params: routeParams,
    pathname,
  })

  const response: Response = ctx.response

  return response
}

function throwRouteHandlerError() {
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      `It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route.`,
    )
  }
  throw new Error('Internal Server Error')
}

function throwIfMayNotDefer() {
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      `You cannot defer to the app router if there is no component defined on this route.`,
    )
  }
  throw new Error('Internal Server Error')
}
function handlerToMiddleware(
  handler: RouteMethodHandlerFn<AnyRoute, any, any, any, any>,
  mayDefer: boolean,
) {
  if (mayDefer) {
    return handler as TODO
  }
  return async ({ next: _next, ...rest }: TODO) => {
    const response = await handler({ ...rest, next: throwIfMayNotDefer })
    if (!response) {
      throwRouteHandlerError()
    }
    return response
  }
}

function executeMiddleware(middlewares: TODO, ctx: TODO) {
  let index = -1

  const next = async (ctx: TODO) => {
    index++
    const middleware = middlewares[index]
    if (!middleware) return ctx

    const result = await middleware({
      ...ctx,
      // Allow the middleware to call the next middleware in the chain
      next: async (nextCtx: TODO) => {
        // Allow the caller to extend the context for the next middleware
        const nextResult = await next({
          ...ctx,
          ...nextCtx,
          context: {
            ...ctx.context,
            ...(nextCtx?.context || {}),
          },
        })

        // Merge the result into the context\
        return Object.assign(ctx, handleCtxResult(nextResult))
      },
      // Allow the middleware result to extend the return context
    }).catch((err: TODO) => {
      if (isSpecialResponse(err)) {
        return {
          response: err,
        }
      }

      throw err
    })

    // Merge the middleware result into the context, just in case it
    // returns a partial context
    return Object.assign(ctx, handleCtxResult(result))
  }

  return handleCtxResult(next(ctx))
}

function handleCtxResult(result: TODO) {
  if (isSpecialResponse(result)) {
    return {
      response: result,
    }
  }

  return result
}

function isSpecialResponse(err: TODO) {
  return isResponse(err) || isRedirect(err)
}

function isResponse(response: Response): response is Response {
  return response instanceof Response
}
