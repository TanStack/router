/// <reference types="vinxi/types/server" />
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { eventHandler, toWebRequest } from 'vinxi/http'
import invariant from 'vinxi/lib/invariant'
import { getManifest } from 'vinxi/manifest'

export default eventHandler(handleServerAction)

export async function handleServerAction(event: any) {
  const request = toWebRequest(event) as Request
  return await handleServerRequest(request)
}

export async function handleServerRequest(request: Request) {
  const method = request.method
  const url = new URL(request.url, 'http://localhost')
  const search = new URLSearchParams(url.search)

  const serverId = search.get('_serverId')

  if (serverId) {
    invariant(typeof serverId === 'string', 'Invalid server action')

    // This is the client-side case
    const [filepath, name] = serverId.split('#')

    const action = (
      await getManifest(import.meta.env.ROUTER_NAME).chunks[filepath].import()
    )[name] as Function

    // If the request is a

    try {
      const args = await (async () => {
        if (request.headers.get('server-action-type') === 'payload') {
          return [await request.json(), { method, request }] as const
        }

        if (request.headers.get('server-action-type') === 'request') {
          return [request, { method, request }] as const
        }

        // if (request.headers.get('server-action-type') === 'args') {
        return (await request.json()) as any[]
        // }
      })()

      const response = await action.call(null, args)

      if (response instanceof Response) {
        return response
      }

      return new Response(JSON.stringify(response ?? null), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error: any) {
      // Currently this server-side context has no idea how to
      // build final URLs, so we need to defer that to the client.
      // The client will check for __redirect and __notFound keys,
      // and if they exist, it will handle them appropriately.

      if (isRedirect(error)) {
        // TODO: Use a common variable for the __redirect key
        return new Response(JSON.stringify({ __redirect: error }))
      }
      if (isNotFound(error)) {
        // TODO: Use a common variable for the __notFound key
        return new Response(JSON.stringify({ __notFound: error }))
      }

      console.error(error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'server-function': 'error',
        },
      })
    }
  } else {
    throw new Error('Invalid request')
  }
}
