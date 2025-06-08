import { createMemoryHistory } from '@tanstack/history'
import {
  flattenMiddlewares,
  json,
  mergeHeaders,
} from '@tanstack/start-client-core'
import {
  getMatchedRoutes,
  isRedirect,
  isResolvedRedirect,
  joinPaths,
  processRouteTree,
  rootRouteId,
  trimPath,
} from '@tanstack/router-core'
import { getResponseHeaders, requestHandler } from './h3'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'
import type { AnyServerRoute, AnyServerRouteWithTypes } from './serverRoute'
import type { RequestHandler } from './h3'
import type { AnyRouter } from '@tanstack/router-core'
import type { HandlerCallback } from './handlerCallback'

type TODO = any

export type CustomizeStartHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => RequestHandler

export function getStartResponseHeaders(opts: { router: AnyRouter }) {
  let headers = mergeHeaders(
    getResponseHeaders(),
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...opts.router.state.matches.map((match) => {
      return match.headers
    }),
  )
  // Handle Redirects
  const { redirect } = opts.router.state

  if (redirect) {
    headers = mergeHeaders(headers, redirect.headers)
  }
  return headers
}

export function createStartHandler<TRouter extends AnyRouter>({
  createRouter,
  RootDocument,
}: {
  createRouter: () => TRouter
  RootDocument?: any
}): CustomizeStartHandler<TRouter> {
  return (cb) => {
    const originalFetch = globalThis.fetch

    const startRequestResolver: RequestHandler = async ({ request }) => {
      // Patching fetch function to use our request resolver
      // if the input starts with `/` which is a common pattern for
      // client-side routing.
      // When we encounter similar requests, we can assume that the
      // user wants to use the same origin as the current request.
      globalThis.fetch = async function (input, init) {
        function resolve(url: URL, requestOptions: RequestInit | undefined) {
          const fetchRequest = new Request(url, requestOptions)
          return startRequestResolver({ request: fetchRequest })
        }

        function getOrigin() {
          return (
            request.headers.get('Origin') ||
            request.headers.get('Referer') ||
            'http://localhost'
          )
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

      // Create a history for the client-side router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      const APP_BASE = process.env.TSS_APP_BASE || '/'

      // Create the client-side router
      const router = createRouter()

      // Attach the server-side SSR utils to the client-side router
      const startRoutesManifest = await getStartManifest({ basePath: APP_BASE })
      attachRouterServerSsrUtils(router, startRoutesManifest)

      // Update the client-side router with the history and context
      router.update({
        history,
      })

      const response = await (async () => {
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

          // Then move on to attempting to load server routes
          const serverRouteTreeModule = await (async () => {
            try {
              return (await import(
                // @ts-expect-error
                'tanstack-start-server-routes-manifest:v'
              )) as { routeTree: AnyServerRoute }
            } catch (e) {
              console.log(e)
              return undefined
            }
          })()

          // If we have a server route tree, then we try matching to see if we have a
          // server route that matches the request.
          if (serverRouteTreeModule) {
            const [_matchedRoutes, response] = await handleServerRoutes({
              routeTree: serverRouteTreeModule.routeTree,
              request,
              basePath: APP_BASE,
            })

            if (response) return response
          }

          const requestAcceptHeader = request.headers.get('Accept') || '*/*'
          const splitRequestAcceptHeader = requestAcceptHeader.split(',')

          const supportedMimeTypes = ['*/*', 'text/html']
          const isRouterAcceptSupported = supportedMimeTypes.some((mimeType) =>
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

          // If no Server Routes were found, so fallback to normal SSR matching using
          // the router

          await router.load()

          // If there was a redirect, skip rendering the page at all
          if (router.state.redirect) return router.state.redirect

          dehydrateRouter(router)

          const responseHeaders = getStartResponseHeaders({ router })
          const response = await cb({
            request,
            router,
            responseHeaders,
            RootDocument,
          })

          return response
        } catch (err) {
          if (err instanceof Response) {
            return err
          }

          throw err
        }
      })()

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
            `Server side redirects must use absolute paths via the 'href' or 'to' options. Received: ${JSON.stringify(response.options)}`,
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
  routeTree,
  request,
  basePath,
}: {
  routeTree: AnyServerRouteWithTypes
  request: Request
  basePath: string
}) {
  const { flatRoutes, routesById, routesByPath } = processRouteTree({
    routeTree,
    initRoute: (route, i) => {
      route.init({
        originalIndex: i,
      })
    },
  })

  const url = new URL(request.url)
  const pathname = url.pathname

  const history = createMemoryHistory({
    initialEntries: [pathname],
  })

  const { matchedRoutes, foundRoute, routeParams } =
    getMatchedRoutes<AnyServerRouteWithTypes>({
      pathname: history.location.pathname,
      basepath: basePath,
      caseSensitive: true,
      routesByPath,
      routesById,
      flatRoutes,
    })

  let response: Response | undefined

  if (foundRoute && foundRoute.id !== rootRouteId) {
    // We've found a server route that matches the request, so we can call it.
    // TODO: Get the input type-signature correct
    // TODO: Perform the middlewares?
    // TODO: Error handling? What happens when its `throw redirect()` vs `throw new Error()`?

    const method = Object.keys(foundRoute.options.methods).find(
      (method) => method.toLowerCase() === request.method.toLowerCase(),
    )

    if (method) {
      const handler = foundRoute.options.methods[method]

      if (handler) {
        const middlewares = flattenMiddlewares(
          matchedRoutes.flatMap((r) => r.options.middleware).filter(Boolean),
        ).map((d) => d.options.server)

        middlewares.push(handlerToMiddleware(handler) as TODO)

        // TODO: This is starting to feel too much like a server function
        // Do generalize the existing middleware execution? Or do we need to
        // build a new middleware execution system for server routes?
        const ctx = await executeMiddleware(middlewares, {
          request,
          context: {},
          params: routeParams,
          pathname: history.location.pathname,
        })

        response = ctx.response
      }
    }
  }

  // We return the matched routes too so if
  // the app router happens to match the same path,
  // it can use any request middleware from server routes
  return [matchedRoutes, response] as const
}

function handlerToMiddleware(
  handler: AnyServerRouteWithTypes['options']['methods'][string],
) {
  return async ({ next: _next, ...rest }: TODO) => ({
    response: await handler(rest),
  })
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
        const nextResult = await next({ ...ctx, ...nextCtx })

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
