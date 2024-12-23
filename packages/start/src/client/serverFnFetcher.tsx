import {
  defaultTransformer,
  encode,
  isNotFound,
  isPlainObject,
  isRedirect,
} from '@tanstack/react-router'
import type { MiddlewareOptions } from './createServerFn'

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (request: Request) => Promise<Response>,
) {
  const _first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(_first) && _first.method) {
    const first = _first as MiddlewareOptions
    const type = first.data instanceof FormData ? 'formData' : 'payload'

    // Arrange the headers
    const headers = new Headers({
      ...(type === 'payload'
        ? {
            'content-type': 'application/json',
            accept: 'application/json',
          }
        : {}),
      ...(first.headers instanceof Headers
        ? Object.fromEntries(first.headers.entries())
        : first.headers || {}),
    })

    // If the method is GET, we need to move the payload to the query string
    if (first.method === 'GET') {
      // If the method is GET, we need to move the payload to the query string
      const encodedPayload = encode({
        payload: defaultTransformer.stringify({
          data: first.data,
          context: first.context,
        }),
      })

      if (encodedPayload) {
        if (url.includes('?')) {
          url += `&${encodedPayload}`
        } else {
          url += `?${encodedPayload}`
        }
      }
    }

    // Create the request
    const request = new Request(url, {
      method: first.method,
      headers,
      ...getFetcherRequestOptions(first),
    })

    const handlerResponse = await handler(request)

    const response = await handleResponseErrors(handlerResponse)

    // Check if the response is JSON
    if (response.headers.get('content-type')?.includes('application/json')) {
      const text = await response.text()
      const json = text ? defaultTransformer.parse(text) : undefined

      // If the response is a redirect or not found, throw it
      // for the router to handle
      if (isRedirect(json) || isNotFound(json)) {
        throw json
      }

      return json
    }

    // Must be a raw response
    return response
  }

  // If not a custom fetcher, just proxy the arguments
  // through as a POST request
  const request = new Request(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
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

function getFetcherRequestOptions(opts: MiddlewareOptions) {
  if (opts.method === 'POST') {
    if (opts.data instanceof FormData) {
      opts.data.set('__TSR_CONTEXT', defaultTransformer.stringify(opts.context))
      return {
        body: opts.data,
      }
    }

    return {
      body: defaultTransformer.stringify({
        data: opts.data ?? null,
        context: opts.context,
      }),
    }
  }

  return {}
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
