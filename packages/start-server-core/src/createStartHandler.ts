import path from 'node:path'
import { createMemoryHistory } from '@tanstack/history'
import { eventHandler, getResponseHeaders, toWebRequest } from 'h3'
import { mergeHeaders } from '@tanstack/start-client-core'
import { getMatchedRoutes, processRouteTree } from '@tanstack/router-core'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import { serverFunctionsHandler } from './server-functions-handler'
import { getStartManifest } from './router-manifest'
import type { AnyServerRoute } from './serverRoute'
import type { EventHandlerResponse, H3Event } from 'h3'
import type { AnyRouter } from '@tanstack/router-core'
import type { HandlerCallback } from './handlerCallback'

export type CustomizeStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> = (cb: HandlerCallback<TRouter, TResponse>) => ReturnType<typeof eventHandler>

export function getStartResponseHeaders(opts: {
  event: H3Event
  router: AnyRouter
}) {
  let headers = mergeHeaders(
    getResponseHeaders(opts.event),
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
    return eventHandler(async (event) => {
      const request = toWebRequest(event)

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
        return await serverFunctionsHandler(event)
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

      if (serverRouteTreeModule) {
        console.debug(
          '[createStartHandler.eventHandler] serverRouteTreeModule',
          serverRouteTreeModule.routeTree,
        )
        const router = createServerRouter({
          routeTree: serverRouteTreeModule.routeTree,
        })
      }

      // Handle API routes
      // handleApiRoutes(event)
      // if (event.handled) {
      //   return
      // }

      // If no API routes returned, then fallback to SSR on the router

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

      const responseHeaders = getStartResponseHeaders({ event, router })
      const response = await cb({
        request,
        router,
        responseHeaders,
      })

      return response
    })
  }
}

function createServerRouter({ routeTree }: { routeTree: AnyServerRoute }) {
  const { flatRoutes, routesById, routesByPath } = processRouteTree({
    routeTree,
    initRoute: (route, i) => {
      route.init({
        originalIndex: i,
      })
    },
  })

  const matches = getMatchedRoutes({
    pathname: '/',
    routePathname: '/',
    basepath: '/',
    caseSensitive: true,
    routesByPath,
    routesById,
    flatRoutes,
  })

  console.debug('[createStartHandler.createServerRouter] matches', matches)
}
