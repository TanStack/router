import {
  encode,
  isNotFound,
  isPlainObject,
  isRedirect,
} from '@tanstack/react-router'
import { startSerializer } from '@tanstack/start-client'
import type { MiddlewareClientFnOptions } from '@tanstack/start-client'

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  const _first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(_first) && _first.method) {
    const first = _first as MiddlewareClientFnOptions<any, any> & {
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
      if (hasBinaryData(first.data)) {
        throw new Error(
          'Cannot send binary data to a GET server function. Please set the method of the server function to POST instead.',
        )
      }

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
    } else if (type === 'payload' && hasBinaryData(first.data)) {
      throw new Error(
        'Binary data cannot be sent within objects. Use FormData instead.',
      )
    }

    if (url.includes('?')) {
      url += `&createServerFn`
    } else {
      url += `?createServerFn`
    }

    const handlerResponse = await handler(url, {
      method: first.method,
      headers,
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

function getFetcherRequestOptions(opts: MiddlewareClientFnOptions<any, any>) {
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

const hasBinaryData = (data: any): boolean => {
  // If it's a file or blob, it's binary data
  if (data instanceof File || data instanceof Blob) return true
  if (data instanceof FormData) {
    // Check if FormData contains any File objects
    for (const value of data.values()) {
      if (hasBinaryData(value)) return true
    }
  }
  if (data instanceof Array) {
    // Check if array contains any File objects (recursively)
    for (const item of data) {
      if (hasBinaryData(item)) return true
    }
  }
  if (typeof data === 'object' && data !== null) {
    // If it's an object, check if it contains any binary data (recursively)
    for (const value of Object.values(data)) {
      if (hasBinaryData(value)) return true
    }
  }
  return false
}
