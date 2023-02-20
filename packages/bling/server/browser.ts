import {
  ContentTypeHeader,
  JSONResponseType,
  LocationHeader,
  redirect,
  XBlingContentTypeHeader,
  XBlingOrigin,
  XBlingResponseTypeHeader,
} from './responses'

import type { CreateServerFunction, Serializer, ServerFunction } from './types'

export const server$: CreateServerFunction = ((_fn: any) => {
  throw new Error('Should be compiled away')
}) as unknown as CreateServerFunction

server$.parseResponse = async (request: Request, response: Response) => {
  const contentType =
    response.headers.get(XBlingContentTypeHeader) ||
    response.headers.get(ContentTypeHeader) ||
    ''
  if (contentType.includes('json')) {
    return await response.json()
  } else if (contentType.includes('text')) {
    return await response.text()
  } else if (contentType.includes('error')) {
    const data = await response.json()
    const error = new Error(data.error.message)
    if (data.error.stack) {
      error.stack = data.error.stack
    }
    return error
  } else if (contentType.includes('response')) {
    if (response.status === 204 && response.headers.get(LocationHeader)) {
      return redirect(response.headers.get(LocationHeader)!)
    }
    return response
  } else {
    if (response.status === 200) {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {}
    }
    if (response.status === 204 && response.headers.get(LocationHeader)) {
      return redirect(response.headers.get(LocationHeader)!)
    }
    return response
  }
}

let serializers: Serializer[] = []

server$.addSerializer = ({ apply, serialize }: Serializer) => {
  serializers.push({ apply, serialize })
}

server$.createRequestInit = function (
  route,
  that,
  args: any[],
  meta,
): RequestInit {
  let body,
    headers: Record<string, string> = {
      [XBlingOrigin]: 'client',
    }

  if (args[0] instanceof FormData) {
    body = args[0]
  } else {
    body = JSON.stringify(args, (key, value) => {
      let serializer = serializers.find(({ apply }) => apply(value))
      if (serializer) {
        return serializer.serialize(value)
      }
      return value
    })
    headers[ContentTypeHeader] = JSONResponseType
  }

  return {
    method: 'POST',
    body: body,
    headers: new Headers({
      ...headers,
    }),
  }
}

type ServerCall = (route: string, init: RequestInit) => Promise<Response>

server$.createFetcher = (route, meta) => {
  let fetcher: any = function (this: any, ...args: any[]) {
    const requestInit = server$.createRequestInit(route, this, args, meta)
    // request body: json, formData, or string
    return (server$.call as ServerCall)(route, requestInit)
  }

  fetcher.url = route
  fetcher.fetch = (init: RequestInit) =>
    (server$.call as ServerCall)(route, init)
  return fetcher as ServerFunction<any, any>
}

server$.call = async function (route: string, init: RequestInit) {
  const request = new Request(new URL(route, window.location.href).href, init)

  const response = await fetch(request)

  // // throws response, error, form error, json object, string
  if (response.headers.get(XBlingResponseTypeHeader) === 'throw') {
    throw await server$.parseResponse(request, response)
  } else {
    return await server$.parseResponse(request, response)
  }
} as any

// used to fetch from an API route on the server or client, without falling into
// fetch problems on the server
server$.fetch = async function (route: string | URL, init: RequestInit) {
  if (route instanceof URL || route.startsWith('http')) {
    return await fetch(route, init)
  }
  const request = new Request(new URL(route, window.location.href).href, init)
  return await fetch(request)
}
