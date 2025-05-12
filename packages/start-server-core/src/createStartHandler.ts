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
}: {
  createRouter: () => TRouter
}): CustomizeStartHandler<TRouter> {
  return (cb) => {
    return requestHandler(async ({ request }) => {
      const url = new URL(request.url)
      const href = url.href.replace(url.origin, '')

      // Create a history for the client-side router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      // Create the client-side router
      const router = createRouter()

      // Attach the server-side SSR utils to the client-side router
      attachRouterServerSsrUtils(router, getStartManifest())

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
            '/',
            trimPath(process.env.TSS_SERVER_FN_BASE),
            '/',
          ])
          if (href.startsWith(serverFnBase)) {
            return await handleServerAction({ request })
          }

          // Then move on to attempting to load server routes
          const serverRouteTreeModule = await (async () => {
            try {
              // @ts-expect-error
              return (await import('tanstack:server-routes')) as {
                routeTree: AnyServerRoute
              }
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
    })
  }
}

async function handleServerRoutes({
  routeTree,
  request,
}: {
  routeTree: AnyServerRouteWithTypes
  request: Request
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
      basepath: '/',
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
  return async ({ next, ...rest }: TODO) => ({
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
