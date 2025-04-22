import path from 'node:path'
import { setGlobalOrigin } from 'undici'
import { createMemoryHistory } from '@tanstack/history'
import { json, mergeHeaders } from '@tanstack/start-client-core'
import {
  getMatchedRoutes,
  processRouteTree,
  rootRouteId,
} from '@tanstack/router-core'
import { getResponseHeaders, requestHandler } from './h3'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'
import type { AnyServerRoute, AnyServerRouteWithTypes } from './serverRoute'
import type { EventHandlerResponse, RequestHandler } from './h3'
import type { AnyRouter } from '@tanstack/router-core'
import type { HandlerCallback } from './handlerCallback'

export type CustomizeStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> = (cb: HandlerCallback<TRouter, TResponse>) => RequestHandler

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
    headers = mergeHeaders(headers, redirect.headers, {
      Location: redirect.href,
    })
  }
  return headers
}

export function createStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
>({
  createRouter,
}: {
  createRouter: () => TRouter
}): CustomizeStartHandler<TRouter, TResponse> {
  return (cb) => {
    return requestHandler(async ({ request }) => {
      setGlobalOrigin(getAbsoluteUrl(request))

      const url = new URL(request.url)
      const href = url.href.replace(url.origin, '')

      if (!process.env.TSS_SERVER_FN_BASE) {
        throw new Error(
          'tanstack/start-server-core: TSS_SERVER_FN_BASE must be defined in your environment for createStartHandler()',
        )
      }

      // Handle server functions
      if (
        href.startsWith(path.join('/', process.env.TSS_SERVER_FN_BASE, '/'))
      ) {
        return await handleServerAction({ request })
      }

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
        const response = await handleServerRoutes({
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

      // Create a history for the router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      const router = createRouter()

      attachRouterServerSsrUtils(router, getStartManifest())

      // Update the router with the history and context
      router.update({
        history,
      })

      await router.load()

      dehydrateRouter(router)

      const responseHeaders = getStartResponseHeaders({ router })
      const response = await cb({
        request,
        router,
        responseHeaders,
      })

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
        return await handler({
          request,
          context: {},
          params: routeParams,
          pathname: history.location.pathname,
        })
      }
    }
  }

  return
}

function getAbsoluteUrl(
  req: Request,
  options: { trustProxy: boolean } = { trustProxy: false },
) {
  const headers = req.headers

  const host = options.trustProxy
    ? headers.get('x-forwarded-host') || headers.get('host')
    : headers.get('host')

  const protocol = options.trustProxy
    ? headers.get('x-forwarded-proto') || 'http'
    : 'http'

  if (!host) throw new Error('Cannot determine host from request headers')

  return `${protocol}://${host}`
}
