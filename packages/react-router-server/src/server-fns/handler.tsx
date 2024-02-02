import { decode, isNotFound, isRedirect } from '@tanstack/react-router'
import invariant from 'vinxi/lib/invariant'
import { getManifest } from 'vinxi/manifest'
import { serverFnReturnTypeHeader } from './fetcher'

export async function handleRequest(request: Request) {
  const method = request.method
  const url = new URL(request.url, 'http://localhost:3000')
  const search = decode(url.search, '?') as {
    _serverFnId?: string
    _serverFnName?: string
  }

  const serverFnId = search._serverFnId
  const serverFnName = search._serverFnName

  if (serverFnId && serverFnName) {
    invariant(typeof serverFnId === 'string', 'Invalid server action')

    console.info(`ServerFn Request: ${serverFnId} - ${serverFnName}`)

    const action = (
      await getManifest('server').chunks[serverFnId!]?.import?.()
    )?.[serverFnName!] as Function

    try {
      const args = await (async () => {
        if (request.headers.get('server-action-type') === 'payload') {
          return [
            method.toLowerCase() === 'get'
              ? (() => {
                  const { _serverFnId, _serverFnName, ...rest } = search
                  return rest
                })()
              : await request.json(),
            { method, request },
          ] as const
        }

        if (request.headers.get('server-action-type') === 'request') {
          return [request, { method, request }] as const
        }

        // if (request.headers.get('server-action-type') === 'args') {
        return (await request.json()) as any[]
        // }
      })()

      console.info(`  Payload: ${JSON.stringify(args, null, 2)}`)

      let result = await action.apply(null, args)

      if (result instanceof Response) {
        return result
      }

      const response = new Response(JSON.stringify(result ?? null), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          [serverFnReturnTypeHeader]: 'json',
        },
      })

      return response
    } catch (error: any) {
      // Currently this server-side context has no idea how to
      // build final URLs, so we need to defer that to the client.
      // The client will check for __redirect and __notFound keys,
      // and if they exist, it will handle them appropriately.

      if (isRedirect(error)) {
        // TODO: Use a common variable for the __redirect key
        return new Response(JSON.stringify(error), {
          headers: {
            'Content-Type': 'application/json',
            [serverFnReturnTypeHeader]: 'json',
          },
        })
      }

      if (isNotFound(error)) {
        // TODO: Use a common variable for the __notFound key
        return new Response(JSON.stringify(error), {
          headers: {
            'Content-Type': 'application/json',
            [serverFnReturnTypeHeader]: 'json',
          },
        })
      }

      console.error('Server Fn Error!')
      console.error(error)

      return new Response(JSON.stringify(error), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          [serverFnReturnTypeHeader]: 'error',
        },
      })
    }
  } else {
    throw new Error('Invalid request')
  }
}
