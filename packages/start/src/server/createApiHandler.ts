import { eventHandler, toWebRequest } from 'vinxi/http'
import type { ResolveParams } from '../../../react-router/dist/esm/route'
import type { Manifest, ParsePathParams } from '@tanstack/react-router'

export type ApiHandlerCallback = (ctx: {
  request: Request
}) => Response | Promise<Response>

export type ApiMethodCallback<TPath extends string> = (ctx: {
  request: Request
  params: ResolveParams<TPath>
}) => Response | Promise<Response>

export type ApiMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export function createApiHandler(cb: ApiHandlerCallback) {
  return eventHandler(async (event) => {
    const request = toWebRequest(event)
    const res = await cb({ request })
    return res
  })
}

export async function handleApiFileRoute({
  request,
  getRouterManifest,
}: {
  request: Request
  getRouterManifest: () => Manifest
}): Promise<Response> {
  const manifest = getRouterManifest()

  const apiBase = manifest.apiBase || '/api'
  const apiRoutes = manifest.apiRoutes || {}

  // 1. Split routes on '/'
  // 2. Multi-sort routes by length, special rules for $param routes and $ (catch-all) routes
  // 3. Search for a route that matches the request pattern
  // 4. Extract the route params from the request
  // 5. Import the route file
  // 6. Call the route file's handler function with the request and route params

  // Loop through the manifest and find the route that matches the request
  // Dynamically import the route file and process the request to the right verb export

  return new Response('Hello, world!')
}

export function createApiRoute<TPath extends string>(filePath: TPath) {
  return function createApiRouteFn(
    methods: Partial<Record<ApiMethodName, ApiMethodCallback<TPath>>>,
  ) {
    return {
      filePath,
      methods,
    }
  }
}
