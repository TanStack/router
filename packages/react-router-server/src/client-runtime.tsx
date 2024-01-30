import {
  CompiledFetcherFnOptions,
  FetchFn,
  isPlainObject,
} from '@tanstack/react-router'

export function getBaseUrl(base: string | undefined, id: string, name: string) {
  return `${base}/_server?_serverId=${encodeURI(id)}&_serverName=${encodeURI(name)}`
}

export function createServerReference<TPayload, TResponse>(
  _fn: FetchFn<TPayload, TResponse>,
  id: string,
  name: string,
) {
  let base = getBaseUrl(import.meta.env.SERVER_BASE_URL, id, name)

  const proxyFn = (...args: any[]) => handleFetcherArgs(base, args, fetch)

  return Object.assign(proxyFn, {
    url: base,
  })
}

export async function handleFetcherArgs<TPayload>(
  base: string,
  args: any[],
  handler: (request: Request) => Promise<Response>,
) {
  const first = args[0]

  // If a custom fetcher request is passed, use it
  if (isPlainObject(first) && first.method && first.type) {
    const opts = first as CompiledFetcherFnOptions<TPayload>

    // Arrange the headers
    const headers = new Headers({
      'server-action-type': opts.type,
      ...(opts.type === 'payload'
        ? {
            'content-type': 'application/json',
            accept: 'application/json',
          }
        : {}),
      ...opts.requestInit?.headers,
    })

    // If the method is GET, we need to move the payload to the query string
    if (opts.method === 'GET') {
      // If the method is GET, we need to move the payload to the query string
      const query = new URLSearchParams(opts.payload as any)
      base += `&${query.toString()}`
    }

    // Create the request
    const request = new Request(base, {
      ...opts.requestInit,
      headers,
      ...(opts.method === 'POST' && opts.payload
        ? { body: JSON.stringify(opts.payload) }
        : {}),
    })

    // Fetch it
    const response = await handler(request)

    // After handling, return the response itself
    return handleResponse(response)
  }

  // If not a custom fetcher, just proxy the arguments
  // through as a POST request
  const request = new Request(base, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'server-action-type': 'args',
    },
    body: JSON.stringify(args),
  })

  const result = handleResponse(await handler(request))

  // If the response is JSON, return it parsed
  const contentType = result.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return result.json()
  } else {
    // Otherwise, return the text as a fallback
    // If the user wants more than this, they can pass a
    // request instead
    return result.text()
  }
}

function handleResponse(response: Response) {
  if (!response.ok) {
    const err = new Error(`HTTP error! status: ${response.status}`)
    throw Object.assign(err, { response })
  }

  return response
}
