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

      // If we have a server route tree, then we try matching to see if we have a
      // server route that matches the request.
      if (serverRouteTreeModule) {
        const serverRoute = createServerRouter({
          request,
          url,
          routeTree: serverRouteTreeModule.routeTree,
        })

        // We've found a server route that matches the request, so we can call it.
        // TODO: Get the input type-signature correct
        // TODO: Perform the middlewares?
        // TODO: Error handling? What happens when its `throw redirect()` vs `throw new Error()`?
        // TODO: What happens when its a relative fetch? ie. `loader() { return fetch('/api/users') }`
        /**
         * If we are patching undici, to solve the relative fetch issue, then this would be the code needed.
         * ```sh
         * pnpm add undici
         * ```
         *
         * ```ts
         * import { setGlobalOrigin } from 'undici'
         *
         * setGlobalOrigin('http://localhost:3000') // custom logic can be added here to get the origin
         * using getGlobalOrigin()
         * ```
         */
        if (serverRoute) {
          return serverRoute.handler({
            context: {}, // TODO: Get this should be accumulated context for server routes
            request,
            params: serverRoute.params,
            pathname: url.pathname, // TODO: Should this be without the basepath?
          })
        }
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

function createServerRouter({
  routeTree,
  url,
  request,
}: {
  routeTree: AnyServerRoute
  url: URL
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

  const matches = getMatchedRoutes({
    pathname: url.pathname,
    routePathname: undefined,
    basepath: '/', // TODO: Get this from the router? or from Vite/Nitro?
    caseSensitive: true,
    routesByPath,
    routesById,
    flatRoutes,
  })

  console.debug(
    '[createStartHandler.createServerRouter] matches.routeParams\n',
    matches.routeParams,
  )
  console.debug(
    '[createStartHandler.createServerRouter] matches.foundRoute\n',
    matches.foundRoute,
  )
  console.debug(
    '[createStartHandler.createServerRouter] matches.matchedRoutes\n',
    matches.matchedRoutes,
  )

  if (!matches.foundRoute) {
    return undefined
  }

  const route = matches.foundRoute
  const method = request.method.toUpperCase()

  // TODO: Need to get the types correct here
  // @ts-expect-error
  const routeHandler = route.options?.methods?.[method]

  if (!routeHandler) {
    return undefined
  }

  return { handler: routeHandler, params: matches.routeParams }
}
