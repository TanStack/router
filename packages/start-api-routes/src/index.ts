import { eventHandler, toWebRequest } from '@tanstack/start-server-core'
import vinxiFileRoutes from 'vinxi/routes'
import type { ResolveParams } from '@tanstack/router-core'

export type StartAPIHandlerCallback = (ctx: {
  request: Request
}) => Response | Promise<Response>

export type StartAPIMethodCallback<TPath extends string> = (ctx: {
  request: Request
  params: ResolveParams<TPath>
}) => Response | Promise<Response>

const HTTP_API_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const
export type HTTP_API_METHOD = (typeof HTTP_API_METHODS)[number]

/**
 *
 * @param cb The callback function that will be called when the API handler is invoked
 * @returns The response from the callback function
 */
export function createStartAPIHandler(cb: StartAPIHandlerCallback) {
  return eventHandler(async (event) => {
    const request = toWebRequest(event)!
    const res = await cb({ request })
    return res
  })
}

type APIRoute<TPath extends string> = {
  path: TPath
  methods: Partial<Record<HTTP_API_METHOD, StartAPIMethodCallback<TPath>>>
}

type CreateAPIRouteFn<TPath extends string> = (
  methods: Partial<Record<HTTP_API_METHOD, StartAPIMethodCallback<TPath>>>,
) => APIRoute<TPath>

type CreateAPIRoute = <TPath extends string>(
  path: TPath,
) => CreateAPIRouteFn<TPath>

type APIRouteReturnType = ReturnType<ReturnType<CreateAPIRoute>>

/**
 * This function is used to create an API route that will be listening on a specific path when you are not using the file-based routes.
 *
 * @param path The path that the API route will be listening on. You need to make sure that this is a valid TanStack Router path in order for the route to be matched. This means that you can use the following syntax:
 * /api/foo/$bar/name/$
 * - The `$bar` is a parameter that will be extracted from the URL and passed to the handler
 * - The `$` is a wildcard that will match any number of segments in the URL
 * @returns A function that takes the methods that the route will be listening on and returns the API route object
 */
export const createAPIRoute: CreateAPIRoute = (path) => (methods) => ({
  path,
  methods,
})

/**
 * This function is used to create an API route that will be listening on a specific path when you are using the file-based routes.
 *
 * @param filePath The path that the API file route will be listening on. This filePath should automatically be generated by the TSR plugin and should be a valid TanStack Router path
 * @returns A function that takes the methods that the route will be listening on and returns the API route object
 */
export const createAPIFileRoute: CreateAPIRoute = (filePath) => (methods) => ({
  path: filePath,
  methods,
})

/**
 * This function takes a URL object and a list of routes and finds the route that matches the URL.
 *
 * @param url URL object
 * @param entryRoutes List of routes entries in the TSR format to find the current match by the URL
 * @returns Returns the route that matches the URL or undefined if no route matches
 */
function findRoute<TPayload = unknown>(
  url: URL,
  entryRoutes: Array<{ routePath: string; payload: TPayload }>,
):
  | {
      routePath: string
      params: Record<string, string>
      payload: TPayload
    }
  | undefined {
  const urlSegments = url.pathname.split('/').filter(Boolean)

  const routes = entryRoutes
    .sort((a, b) => {
      const aParts = a.routePath.split('/').filter(Boolean)
      const bParts = b.routePath.split('/').filter(Boolean)

      return bParts.length - aParts.length
    })
    .filter((r) => {
      const routeSegments = r.routePath.split('/').filter(Boolean)
      return urlSegments.length >= routeSegments.length
    })

  for (const route of routes) {
    const routeSegments = route.routePath.split('/').filter(Boolean)
    const params: Record<string, string> = {}
    let matches = true
    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i] as string
      const urlSegment = urlSegments[i] as string
      if (routeSegment.startsWith('$')) {
        if (routeSegment === '$') {
          const wildcardValue = urlSegments.slice(i).join('/')
          if (wildcardValue !== '') {
            params['*'] = wildcardValue
            params['_splat'] = wildcardValue
          } else {
            matches = false
            break
          }
        } else {
          const paramName = routeSegment.slice(1)
          params[paramName] = urlSegment
        }
      } else if (routeSegment !== urlSegment) {
        matches = false
        break
      }
    }
    if (matches) {
      return { routePath: route.routePath, params, payload: route.payload }
    }
  }

  return undefined
}

/**
 * You should only be using this function if you are not using the file-based routes.
 *
 *
 * @param opts - A map of TSR routes with the values being the route handlers
 * @returns The handler for the incoming request
 *
 * @example
 * ```ts
 * // app/foo.ts
 * import { createAPIRoute } from '@tanstack/start-api-routes'
 * const fooBarRoute = createAPIRoute('/api/foo/$bar')({
 *  GET: ({ params }) => {
 *   return new Response(JSON.stringify({ params }))
 *  }
 * })
 *
 * // app/api.ts
 * import {
 *    createStartAPIHandler,
 *    defaultAPIRoutesHandler
 * } from '@tanstack/start-api-routes'
 *
 * export default createStartAPIHandler(
 *  defaultAPIRoutesHandler({
 *   '/api/foo/$bar': fooBarRoute
 *  })
 * )
 * ```
 */
export const defaultAPIRoutesHandler: (opts: {
  routes: { [TPath in string]: APIRoute<TPath> }
}) => StartAPIHandlerCallback = (opts) => {
  return async ({ request }) => {
    if (!HTTP_API_METHODS.includes(request.method as HTTP_API_METHOD)) {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(request.url, 'http://localhost:3000')

    const routes = Object.entries(opts.routes).map(([routePath, route]) => ({
      routePath,
      payload: route,
    }))

    // Find the route that matches the request by the request URL
    const match = findRoute(url, routes)

    // If we don't have a route that could possibly handle the request, return a 404
    if (!match) {
      return new Response('Not found', { status: 404 })
    }

    // If the route path doesn't match the payload path, return a 404
    if (match.routePath !== match.payload.path) {
      console.error(
        `Route path mismatch: ${match.routePath} !== ${match.payload.path}. Please make sure that the route path in \`createAPIRoute\` matches the path in the handler map in \`defaultAPIRoutesHandler\``,
      )
      return new Response('Not found', { status: 404 })
    }

    const method = request.method as HTTP_API_METHOD

    // Get the handler for the request method based on the Request Method
    const handler = match.payload.methods[method]

    // If the handler is not defined, return a 405
    if (!handler) {
      return new Response('Method not allowed', { status: 405 })
    }

    return await handler({ request, params: match.params })
  }
}

interface CustomizedVinxiFileRoute {
  path: string // this path adheres to the h3 router path format
  filePath: string // this is the file path on the system
  $APIRoute?: {
    src: string // this is the path to the source file
    import: () => Promise<{
      APIRoute: APIRouteReturnType
    }>
  }
}

/**
 * This is populated by the work done in the config file using the tsrFileRouter
 */
const vinxiRoutes = (
  vinxiFileRoutes as unknown as Array<CustomizedVinxiFileRoute>
).filter((route) => route['$APIRoute'])

/**
 * This function takes the vinxi routes and interpolates them into a format that can be worked with in the API handler
 *
 * @param routes The vinxi routes that have been filtered to only include those with a $APIRoute property
 * @returns An array of objects where the path `key` is interpolated to a valid TanStack Router path, with the `payload` being the original route object
 *
 * @example
 * ```
 * const input = [
 *  {
 *    path: '/api/boo/:$id?/name/*splat',
 *    filePath: '..../code/tanstack/router/examples/react/start-basic/app/routes/api.boo.$id.name.$.tsx',
 *   '$APIRoute': [Object]
 *  }
 * ]
 *
 * toTSRFileBasedRoutes(input)
 * [
 *  {
 *     path: '/api/boo/$id/name/$',
 *     route: {
 *       path: '/api/boo/:$id?/name/*splat',
 *       filePath: '..../code/tanstack/router/examples/react/start-basic/app/routes/api.boo.$id.name.$.tsx',
 *      '$APIRoute': [Object]
 *     }
 *  }
 * ]
 * ```
 */
function toTSRFileBasedRoutes(
  routes: Array<CustomizedVinxiFileRoute>,
): Array<{ routePath: string; payload: CustomizedVinxiFileRoute }> {
  const pairs: Array<{
    routePath: string
    payload: CustomizedVinxiFileRoute
  }> = []

  routes.forEach((route) => {
    const parts = route.path.split('/').filter(Boolean)

    const path = parts
      .map((part) => {
        if (part === '*splat') {
          return '$'
        }

        if (part.startsWith(':$') && part.endsWith('?')) {
          return part.slice(1, -1)
        }

        return part
      })
      .join('/')

    pairs.push({ routePath: `/${path}`, payload: route })
  })

  return pairs
}

/**
 * This function is the default handler for the API routes when using file-based routes.
 *
 * @param StartAPIHandlerCallbackContext
 * @returns The handler for the incoming request
 *
 * @example
 * ```ts
 * // app/api.ts
 * import {
 *    createStartAPIHandler,
 *    defaultAPIFileRouteHandler
 * } from '@tanstack/start-api-routes'
 *
 * export default createStartAPIHandler(defaultAPIFileRouteHandler)
 * ```
 */
export const defaultAPIFileRouteHandler: StartAPIHandlerCallback = async ({
  request,
}) => {
  // Simple early abort if there are no routes
  if (!vinxiRoutes.length) {
    return new Response('No routes found', { status: 404 })
  }

  if (!HTTP_API_METHODS.includes(request.method as HTTP_API_METHOD)) {
    return new Response('Method not allowed', { status: 405 })
  }

  const routes = toTSRFileBasedRoutes(vinxiRoutes)

  const url = new URL(request.url, 'http://localhost:3000')

  // Find the route that file that matches the request by the request URL
  const match = findRoute(url, routes)

  // If we don't have a route that could possibly handle the request, return a 404
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  // Writing the matched route path to the request allows observability tools to group requests by the parameterized route.
  Object.defineProperty(request, '_matchedRoutePath', {
    value: match.routePath,
    writable: true,
    configurable: true,
  })

  // The action is the route file that we need to import
  // which contains the possible handlers for the incoming request
  let action: APIRouteReturnType | undefined = undefined

  try {
    // We can guarantee that action is defined since we filtered for it earlier
    action = await match.payload.$APIRoute!.import().then((m) => m.APIRoute)
  } catch (err) {
    // If we can't import the route file, return a 500
    console.error('Error importing route file:', err)
    return new Response('Internal server error', { status: 500 })
  }

  // If we don't have an action, return a 500
  if (!action) {
    return new Response('Internal server error', { status: 500 })
  }

  const method = request.method as HTTP_API_METHOD

  // Get the handler for the request method based on the Request Method
  const handler = action.methods[method]

  // If the handler is not defined, return a 405
  // What this means is that we have a route that matches the request
  // but we don't have a handler for the request method
  // i.e we have a route that matches /api/foo/$ but we don't have a POST handler
  if (!handler) {
    return new Response('Method not allowed', { status: 405 })
  }

  return await handler({ request, params: match.params })
}
