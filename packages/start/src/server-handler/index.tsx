/// <reference types="vinxi/types/server" />
import { eventHandler, sendStream, setHeaders, toWebRequest } from 'vinxi/http'
import invariant from 'vinxi/lib/invariant'
import { getManifest } from 'vinxi/manifest'
import { isValidElement } from 'react'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '../constants'
import type { H3Event } from 'vinxi/server'

export default eventHandler(handleServerAction) as any

async function handleServerAction(event: H3Event) {
  const request = toWebRequest(event)
  const method = request.method
  const url = new URL(request.url, 'http://localhost:3000')
  const search = Object.fromEntries(
    new URLSearchParams(url.search).entries(),
  ) as {
    _serverFnId?: string
    _serverFnName?: string
    payload?: any
  }

  const serverFnId = search._serverFnId
  const serverFnName = search._serverFnName

  if (serverFnId && serverFnName) {
    invariant(typeof serverFnId === 'string', 'Invalid server action')

    if (process.env.NODE_ENV === 'development')
      console.info(`ServerFn Request: ${serverFnId} - ${serverFnName}`)
    if (process.env.NODE_ENV === 'development') console.info()

    const action = (await getManifest('server').chunks[serverFnId]?.import())?.[
      serverFnName
    ] as Function

    console.log(action)

    const response = await (async () => {
      try {
        const args = await (async () => {
          if (request.headers.get(serverFnPayloadTypeHeader) === 'payload') {
            return [
              method.toLowerCase() === 'get'
                ? (() => {
                    const { _serverFnId, _serverFnName, payload } = search
                    return payload
                  })()
                : await request.json(),
              { method, request },
            ] as const
          }

          if (
            request.headers.get(serverFnPayloadTypeHeader) === 'formData' ||
            request.headers.get('Content-Type')?.includes('multipart/form-data')
          ) {
            return [
              method.toLowerCase() === 'get'
                ? (() => {
                    const { _serverFnId, _serverFnName, payload } = search
                    return payload
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

        // if (isRedirect(result) || isNotFound(result)) {
        //   return redirectOrNotFoundResponse(result)
        // }

        if (result instanceof Response) {
          return result
        }

        if (isValidElement(result)) {
          const { renderToPipeableStream } = await import(
            // @ts-expect-error
            '@vinxi/react-server-dom/server'
          )

          const pipeableStream = renderToPipeableStream(result)

          setHeaders(event, {
            'Content-Type': 'text/x-component',
            [serverFnReturnTypeHeader]: 'rsc',
          } as any)

          sendStream(event, pipeableStream)

          event._handled = true

          return new Response(null, {
            status: 200,
            headers: {
              'Content-Type': 'text/x-component',
              [serverFnReturnTypeHeader]: 'rsc',
            },
          })
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

        // if (isRedirect(error) || isNotFound(error)) {
        //   return redirectOrNotFoundResponse(error)
        // }

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

    if (process.env.NODE_ENV === 'development')
      console.info(`ServerFn Response: ${response.status}`)

    if (
      response.status === 200 &&
      response.headers.get('Content-Type') === 'application/json'
    ) {
      const cloned = response.clone()
      const text = await cloned.text()
      const payload = text ? JSON.stringify(JSON.parse(text)) : 'undefined'

      if (process.env.NODE_ENV === 'development')
        console.info(
          ` - Payload: ${payload.length > 100 ? payload.substring(0, 100) + '...' : payload}`,
        )
    }
    if (process.env.NODE_ENV === 'development') console.info()

    if (event._handled === true) {
      return undefined
    }

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
