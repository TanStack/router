import {
  encode,
  isNotFound,
  isPlainObject,
  isRedirect,
} from '@tanstack/router-core'
import { startSerializer } from '@tanstack/start-client-core'
import type { MiddlewareClientFnOptions } from '@tanstack/start-client-core'

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  const _first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(_first) && _first.method) {
    const first = _first as MiddlewareClientFnOptions<any, any, any> & {
      headers: HeadersInit
    }
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
        : first.headers),
    })

    // If the method is GET, we need to move the payload to the query string
    if (first.method === 'GET') {
      // If the method is GET, we need to move the payload to the query string
      const encodedPayload = encode({
        payload: startSerializer.stringify({
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

    if (url.includes('?')) {
      url += `&createServerFn`
    } else {
      url += `?createServerFn`
    }
    if (first.response === 'raw') {
      url += `&raw`
    }

    const handlerResponse = await handler(url, {
      method: first.method,
      headers,
      signal: first.signal,
      ...getFetcherRequestOptions(first),
    })

    const response = await handleResponseErrors(handlerResponse)

    // Check if the response is JSON
    if (response.headers.get('content-type')?.includes('application/json')) {
      // Even though the response is JSON, we need to decode it
      // because the server may have transformed it
      const json = startSerializer.decode(await response.json())

      // If the response is a redirect or not found, throw it
      // for the router to handle
      if (isRedirect(json) || isNotFound(json) || json instanceof Error) {
        throw json
      }

      return json
    }

    // Must be a raw response
    return response
  }

  // If not a custom fetcher, it was probably
  // a `use server` function, so just proxy the arguments
  // through as a POST request
  const response = await handleResponseErrors(
    await handler(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    }),
  )

  // If the response is JSON, return it parsed
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return startSerializer.decode(await response.json())
  } else {
    // Otherwise, return the text as a fallback
    // If the user wants more than this, they can pass a
    // request instead
    return response.text()
  }
}

function getFetcherRequestOptions(
  opts: MiddlewareClientFnOptions<any, any, any>,
) {
  if (opts.method === 'POST') {
    if (opts.data instanceof FormData) {
      opts.data.set('__TSR_CONTEXT', startSerializer.stringify(opts.context))
      return {
        body: opts.data,
      }
    }

    return {
      body: startSerializer.stringify({
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

    if (isJson) {
      throw startSerializer.decode(await response.json())
    }

    throw new Error(await response.text())
  }

  return response
}
