import {
  defaultStringifySearch,
  isNotFound,
  isPlainObject,
  isRedirect,
} from '@tanstack/react-router'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '../constants'
import type { CompiledFetcherFnOptions } from '../client'

export async function fetcher<TPayload>(
  base: string,
  args: Array<any>,
  handler: (request: Request) => Promise<Response>,
) {
  const first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(first) && first.method) {
    const opts = first as CompiledFetcherFnOptions<TPayload>
    const type =
      opts.payload instanceof FormData
        ? 'formData'
        : opts.payload instanceof Request
          ? 'request'
          : 'payload'

    // Arrange the headers
    const headers = new Headers({
      [serverFnPayloadTypeHeader]: type,
      ...(type === 'payload'
        ? {
            'content-type': 'application/json',
            accept: 'application/json',
          }
        : {}),
      ...(opts.requestInit?.headers instanceof Headers
        ? Object.fromEntries(opts.requestInit.headers.entries())
        : opts.requestInit?.headers || {}),
    })

    // If the method is GET, we need to move the payload to the query string
    if (opts.method === 'GET') {
      // If the method is GET, we need to move the payload to the query string
      const encodedPayload =
        opts.payload !== undefined
          ? defaultStringifySearch({
              payload: opts.payload,
            }).substring(1)
          : ''

      if (encodedPayload) base += `&${encodedPayload}`
    }

    // Create the request
    const request = new Request(base, {
      ...opts.requestInit,
      method: opts.method,
      headers,
      ...(opts.method === 'POST'
        ? {
            body:
              type === 'formData'
                ? opts.payload
                : (JSON.stringify(opts.payload ?? null) as any),
          }
        : {}),
    })

    const handlerResponse = await handler(request)

    const response = await handleResponseErrors(handlerResponse)

    if (['rsc'].includes(response.headers.get(serverFnReturnTypeHeader)!)) {
      return response.body
    }

    if (['json'].includes(response.headers.get(serverFnReturnTypeHeader)!)) {
      const text = await response.text()
      const json = text ? JSON.parse(text) : undefined

      // If the response is a redirect or not found, throw it
      // for the router to handle
      if (isRedirect(json) || isNotFound(json)) {
        throw json
      }

      return json
    }

    return response
  }

  // If not a custom fetcher, just proxy the arguments
  // through as a POST request
  const request = new Request(base, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      [serverFnPayloadTypeHeader]: 'args',
    },
    body: JSON.stringify(args),
  })

  const response = await handleResponseErrors(await handler(request))

  // If the response is JSON, return it parsed
  const contentType = response.headers.get('content-type')
  const text = await response.text()
  if (contentType && contentType.includes('application/json')) {
    return text ? JSON.parse(text) : undefined
  } else {
    // Otherwise, return the text as a fallback
    // If the user wants more than this, they can pass a
    // request instead
    return text
  }
}

async function handleResponseErrors(response: Response) {
  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')

    const body = await (async () => {
      if (isJson) {
        return await response.json()
      }
      return await response.text()
    })()

    const message = `Request failed with status ${response.status}`

    if (isJson) {
      throw new Error(
        JSON.stringify({
          message,
          body,
        }),
      )
    } else {
      throw new Error(
        [message, `${JSON.stringify(body, null, 2)}`].join('\n\n'),
      )
    }
  }

  return response
}
