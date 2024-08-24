import { eventHandler, toWebRequest } from 'vinxi/http'
import { getManifest } from 'vinxi/manifest'
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

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleAPIFileRoute({
  request,
  getRouterManifest,
}: {
  request: Request
  getRouterManifest: () => Manifest
}): Promise<Response> {
  const manifest = getRouterManifest()

  const apiBase = manifest.apiBase || '/api'
  const apiRoutes = manifest.apiRoutes || {}
  console.debug('handleApiFileRoute.apiRoutes\n', apiRoutes)

  const pathname = new URL(request.url, 'http://localhost:3000').pathname
  const withoutBase = pathname.startsWith(apiBase)
    ? pathname.slice(apiBase.length)
    : pathname
  const requestParts = withoutBase.split('/').filter(Boolean)
  console.debug('handleApiFileRoute.requestParts\n', requestParts)

  // 1. Split routes on '/'
  // 2. Multi-sort routes by length, special rules for $param routes and $ (catch-all) routes
  // 3. Search for a route that matches the request pattern
  // 4. Extract the route params from the request
  // 5. Import the route file
  // 6. Call the route file's handler function with the request and route params

  // Loop through the manifest and find the route that matches the request
  // Dynamically import the route file and process the request to the right verb export

  return new Response('Hello, world! ' + request.url)
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
