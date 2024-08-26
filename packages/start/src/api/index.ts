import { eventHandler, toWebRequest } from 'vinxi/http'
import vinxiFileRoutes from 'vinxi/routes'
import type { Manifest, ResolveParams } from '@tanstack/react-router'

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
] as const
export type HTTP_API_METHOD = (typeof HTTP_API_METHODS)[number]

export function createStartAPIHandler(cb: StartAPIHandlerCallback) {
  return eventHandler(async (event) => {
    const request = toWebRequest(event)
    const res = await cb({ request })
    return res
  })
}

type ApiRouteReturnType = ReturnType<ReturnType<typeof createAPIFileRoute>>

interface CustomizedVinxiFileRoute {
  path: string
  filePath: string
  $APIRoute?: {
    src: string
    import: () => Promise<{
      Route: ApiRouteReturnType
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
 * @returns {Array<{ path: string; route: CustomizedVinxiFileRoute }>} An array of tuples where the first element is the path, the second element is the params, and the third element is the route object
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
): Array<{ path: string; route: CustomizedVinxiFileRoute }> {
  const pairs: Array<{ path: string; route: CustomizedVinxiFileRoute }> = []

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

    pairs.push({ path: `/${path}`, route })
  })

  return pairs
}

/**
 * This function takes a URL object and a list of routes and finds the route that matches the URL.
 *
 * @param url URL object
 * @param routes List of routes parsed from the vinxi routes into the TSR format
 */
function findRoute(
  url: URL,
  routes: Array<{ path: string; route: CustomizedVinxiFileRoute }>,
):
  | {
      path: string
      params: Record<string, string>
      route: CustomizedVinxiFileRoute
    }
  | undefined {
  const urlSegments = url.pathname.split('/').filter(Boolean)

  for (const route of routes) {
    const routeSegments = route.path.split('/').filter(Boolean)
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
      return { path: route.path, params, route: route.route }
    }
  }

  return undefined
}

export async function defaultAPIFileRouteHandler({
  request,
}: {
  request: Request
  getRouterManifest: () => Manifest
}): Promise<Response> {
  // Simple early abort if there are no routes
  if (!vinxiRoutes.length) {
    return new Response('No routes found', { status: 404 })
  }

  if (!HTTP_API_METHODS.includes(request.method as HTTP_API_METHOD)) {
    return new Response('Method not allowed', { status: 405 })
  }

  const routes = toTSRFileBasedRoutes(vinxiRoutes)
  // console.debug('handleApiFileRoute.routes\n', routes)

  // // TODO: Confirm with Tanner if we still need this API-manifest stuff anymore
  // // --- API Manifest Stuff ---
  // // We don't actually need this anymore, since we're using the vinxi routes
  // // I'm leaving this in for now, but we should probably remove it before release
  // // and make sure we take out its counterparts in the `config` and `generator`
  // // that read from the manifest in the generated route-tree file
  // const manifest = getRouterManifest()

  // const apiBase = manifest.apiBase || '/api'
  // console.debug('handleApiFileRoute.apiBase\n', apiBase)
  // console.debug('')
  // --- API Manifest Stuff ---

  const url = new URL(request.url, 'http://localhost:3000')

  // 1. Split routes on '/'
  // 2. Multi-sort routes by length, special rules for $param routes and $ (catch-all) routes
  // 3. Search for a route that matches the request pattern
  // 4. Extract the route params from the request
  // 5. Import the route file
  // 6. Call the route file's handler function with the request and route params

  // Loop through the manifest and find the route that matches the request
  // Dynamically import the route file and process the request to the right verb export

  // Find the route that file that matches the request by the request URL
  const match = findRoute(url, routes)

  // If we don't have a route that could possibly handle the request, return a 404
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  let action: ApiRouteReturnType | undefined = undefined

  try {
    // We can guarantee that action is defined since we filtered for it earlier
    action = await match.route.$APIRoute!.import().then((m) => m.Route)
  } catch (err) {
    // If we can't import the route file, return a 500
    console.error('Error importing route file:', err)
    return new Response('Internal server error', { status: 500 })
  }

  // If we don't have an action, return a 500
  if (!action) {
    return new Response('Internal server error', { status: 500 })
  }

  // Params need to be extracted from the request and put in here by their key
  // This currently has the params seeded with empty string values by
  // the toTSRFileBasedRoutes function
  const params = match.params

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

  return handler({ request, params })
}

export function createAPIFileRoute<TPath extends string>(filePath: TPath) {
  return function createAPIRouteFn(
    methods: Partial<Record<HTTP_API_METHOD, StartAPIMethodCallback<TPath>>>,
  ) {
    return {
      filePath,
      methods,
    }
  }
}
