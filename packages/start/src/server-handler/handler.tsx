import { decode, isNotFound, isRedirect } from '@tanstack/react-router'
import invariant from 'vinxi/lib/invariant'
import { getManifest } from 'vinxi/manifest'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '../constants'

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
    console.info()

    const action = (await getManifest('server').chunks[serverFnId]?.import())?.[
      serverFnName
    ] as Function

    const response = await (async () => {
      try {
        const args = await (async () => {
          if (request.headers.get(serverFnPayloadTypeHeader) === 'payload') {
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

          if (request.headers.get(serverFnPayloadTypeHeader) === 'formData') {
            return [
              method.toLowerCase() === 'get'
                ? (() => {
                    const { _serverFnId, _serverFnName, ...rest } = search
                    return rest
                  })()
                : await request.formData(),
              { method, request },
            ] as const
          }

          if (request.headers.get(serverFnPayloadTypeHeader) === 'request') {
            return [request, { method, request }] as const
          }

          // payload type === 'args'
          return (await request.json()) as Array<any>
        })()

        const result = await action(...args)

        if (isRedirect(result) || isNotFound(result)) {
          return redirectOrNotFoundResponse(result)
        }

        if (result instanceof Response) {
          return result
        }

        return new Response(
          result !== undefined ? JSON.stringify(result) : undefined,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              [serverFnReturnTypeHeader]: 'json',
            },
          },
        )
      } catch (error: any) {
        if (error instanceof Response) {
          return error
        }

        // Currently this server-side context has no idea how to
        // build final URLs, so we need to defer that to the client.
        // The client will check for __redirect and __notFound keys,
        // and if they exist, it will handle them appropriately.

        if (isRedirect(error) || isNotFound(error)) {
          return redirectOrNotFoundResponse(error)
        }

        console.error('Server Fn Error!')
        console.error(error)
        console.info()

        return new Response(JSON.stringify(error), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            [serverFnReturnTypeHeader]: 'error',
          },
        })
      }
    })()

    console.info(`ServerFn Response: ${response.status}`)
    if (
      response.status === 200 &&
      response.headers.get('Content-Type') === 'application/json'
    ) {
      const cloned = response.clone()
      const text = await cloned.text()
      const payload = text ? JSON.stringify(JSON.parse(text)) : 'undefined'

      console.info(
        ` - Payload: ${payload.length > 100 ? payload.substring(0, 100) + '...' : payload}`,
      )
    }
    console.info()

    return response
  } else {
    throw new Error('Invalid request')
  }
}

function redirectOrNotFoundResponse(error: any) {
  return new Response(JSON.stringify(error), {
    headers: {
      'Content-Type': 'application/json',
      [serverFnReturnTypeHeader]: 'json',
      ...(error.headers || {}),
    },
  })
}
