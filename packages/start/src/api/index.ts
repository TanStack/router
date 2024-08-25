import { eventHandler, toWebRequest } from 'vinxi/http'
import vinxiFileRoutes from 'vinxi/routes'
import type { Manifest, ResolveParams } from '@tanstack/react-router'

export type APIHandlerCallback = (ctx: {
  request: Request
}) => Response | Promise<Response>

export type APIMethodCallback<TPath extends string> = (ctx: {
  request: Request
  params: ResolveParams<TPath>
}) => Response | Promise<Response>

const API_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const
export type APIMethodName = (typeof API_METHODS)[number]

export function createAPIHandler(cb: APIHandlerCallback) {
  return eventHandler(async (event) => {
    const request = toWebRequest(event)
    const res = await cb({ request })
    return res
  })
}

interface CustomizedVinxiFileRoute {
  path: string
  filePath: string
  $APIRoute?: {
    src: string
    import: () => Promise<{
      Route: {
        filePath: string
        methods: Partial<Record<APIMethodName, APIMethodCallback<any>>>
      }
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
 * @returns {Array<[string, Record<string, string>, CustomizedVinxiFileRoute]>} An array of tuples where the first element is the path, the second element is the params, and the third element is the route object
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
 *   [
 *    '/api/boo/$id/name/$',
 *    { id: '', _splat: '' },
 *    {
 *      path: '/api/boo/:$id?/name/*splat',
 *      filePath: '..../code/tanstack/router/examples/react/start-basic/app/routes/api.boo.$id.name.$.tsx',
 *     '$APIRoute': [Object]
 *    }
 *   ]
 * ]
 * ```
 */
function toTSRFileBasedRoutes(
  routes: Array<CustomizedVinxiFileRoute>,
): Array<[string, Record<string, string>, CustomizedVinxiFileRoute]> {
  const pairs: Array<
    [string, Record<string, string>, CustomizedVinxiFileRoute]
  > = []

  routes.forEach((route) => {
    const parts = route.path.split('/').filter(Boolean)
    const params: Record<string, string> = {}
    const path = parts
      .map((part) => {
        if (part === '*splat') {
          params._splat = ''
          return '$'
        }
        if (part.startsWith(':$') && part.endsWith('?')) {
          params[part.slice(2, -1)] = ''
          return part.slice(1, -1)
        }
        return part
      })
      .join('/')

    pairs.push([`/${path}`, params, route])
  })

  return pairs
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleAPIFileRoute({
  request,
  getRouterManifest,
}: {
  request: Request
  getRouterManifest: () => Manifest
}): Promise<Response> {
  // Simple early abort if there are no routes
  if (!vinxiRoutes.length) {
    return new Response('No routes found', { status: 404 })
  }

  if (!API_METHODS.includes(request.method as APIMethodName)) {
    return new Response('Method not allowed', { status: 405 })
  }

  const routes = toTSRFileBasedRoutes(vinxiRoutes)
  console.debug('handleApiFileRoute.routes\n', routes)

  // TODO: Confirm with Tanner if we still need this API-manifest stuff anymore
  // --- API Manifest Stuff ---
  // We don't actually need this anymore, since we're using the vinxi routes
  // I'm leaving this in for now, but we should probably remove it before release
  // and make sure we take out its counterparts in the `config` and `generator`
  // that read from the manifest in the generated route-tree file
  const manifest = getRouterManifest()

  const apiBase = manifest.apiBase || '/api'
  console.debug('handleApiFileRoute.apiBase\n', apiBase)
  console.debug('')
  // --- API Manifest Stuff ---

  const pathname = new URL(request.url, 'http://localhost:3000').pathname

  // 1. Split routes on '/'
  // 2. Multi-sort routes by length, special rules for $param routes and $ (catch-all) routes
  // 3. Search for a route that matches the request pattern
  // 4. Extract the route params from the request
  // 5. Import the route file
  // 6. Call the route file's handler function with the request and route params

  // Loop through the manifest and find the route that matches the request
  // Dynamically import the route file and process the request to the right verb export

  // Find the route that file that matches the request by the pathname,
  // Tanner's multi-sort logic should be implemented here
  const route = routes.find((r) => r[0] === pathname)

  // If we don't have a route that could possibly handle the request, return a 404
  if (!route) {
    return new Response('Not found', { status: 404 })
  }

  // We can guarantee that action is defined since we filtered for it earlier
  const action = await route[2].$APIRoute!.import().then((m) => m.Route)

  // Params need to be extracted from the request and put in here by their key
  // This currently has the params seeded with empty string values by
  // the toTSRFileBasedRoutes function
  const params = route[1]

  const method = request.method as APIMethodName

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

export function createAPIRoute<TPath extends string>(filePath: TPath) {
  return function createAPIRouteFn(
    methods: Partial<Record<APIMethodName, APIMethodCallback<TPath>>>,
  ) {
    return {
      filePath,
      methods,
    }
  }
}
