import {
  CompiledFetcherFnOptions,
  encode,
  isNotFound,
  isPlainObject,
  isRedirect,
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '@tanstack/react-router'

export async function fetcher<TPayload>(
  base: string,
  args: any[],
  handler: (request: Request) => Promise<Response>,
) {
  const first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(first) && first.method) {
    const opts = first as CompiledFetcherFnOptions<TPayload>
    const type = opts.payload instanceof Request ? 'request' : 'payload'

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
      const encodedPayload = encode(opts.payload)
      if (encodedPayload) base += `&${encode(opts.payload)}`
    }

    // Create the request
    const request = new Request(base, {
      ...opts.requestInit,
      headers,
      ...(opts.method === 'POST' ? { body: JSON.stringify(opts.payload) } : {}),
    })

    // Fetch it
    const handlerResponse = await handler(request)

    let response = await handleResponseErrors(handlerResponse)

    if (['json'].includes(response.headers.get(serverFnReturnTypeHeader)!)) {
      const json = await response.json()

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
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  } else {
    // Otherwise, return the text as a fallback
    // If the user wants more than this, they can pass a
    // request instead
    return response.text()
  }
}
async function handleResponseErrors(response: Response) {
  if (!response.ok) {
    const body = await (async () => {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      }
      return await response.text()
    })()

    throw new Error(
      [
        `Request failed with status ${response.status}`,
        `${JSON.stringify(body, null, 2)}`,
      ].join('\n\n'),
    )
  }

  return response
}
