import {
  encode,
  isNotFound,
  isPlainObject,
  isRedirect,
  parseRedirect,
} from '@tanstack/router-core'
import { startSerializer } from '@tanstack/start-client-core'
import type { FunctionMiddlewareClientFnOptions } from '@tanstack/start-client-core'

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  const _first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(_first) && _first.method) {
    const first = _first as FunctionMiddlewareClientFnOptions<any, any, any> & {
      headers: HeadersInit
    }
    const type = first.data instanceof FormData ? 'formData' : 'payload'

    // Arrange the headers
    const headers = new Headers({
      'x-tsr-redirect': 'manual',
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

    return await getResponse(() =>
      handler(url, {
        method: first.method,
        headers,
        signal: first.signal,
        ...getFetcherRequestOptions(first),
      }),
    )
  }

  // If not a custom fetcher, it was probably
  // a `use server` function, so just proxy the arguments
  // through as a POST request
  return await getResponse(() =>
    handler(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      redirect: 'manual',
    }),
  )
}

function getFetcherRequestOptions(
  opts: FunctionMiddlewareClientFnOptions<any, any, any>,
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

/**
 * Retrieves a response from a given function and manages potential errors
 * and special response types including redirects and not found errors.
 *
 * @param fn - The function to execute for obtaining the response.
 * @returns The processed response from the function.
 * @throws If the response is invalid or an error occurs during processing.
 */
async function getResponse(fn: () => Promise<Response>) {
  const response = await (async () => {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof Response) {
        return error
      }

      throw error
    }
  })()

  // If the response is not ok, throw an error
  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')

    if (isJson) {
      // If it's JSON, decode it and throw it
      throw startSerializer.decode(await response.json())
    }

    throw new Error(await response.text())
  }

  // Check if the response is JSON
  if (response.headers.get('content-type')?.includes('application/json')) {
    // Even though the response is JSON, we need to decode it
    // because the server may have transformed it
    let json = startSerializer.decode(await response.json())

    const redirect = parseRedirect(json)

    if (redirect) json = redirect

    // If the response is a redirect or not found, throw it
    // for the router to handle
    if (isRedirect(json) || isNotFound(json) || json instanceof Error) {
      throw json
    }

    return json
  }

  return response
}
