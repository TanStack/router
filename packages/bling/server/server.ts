import {
  ContentTypeHeader,
  JSONResponseType,
  LocationHeader,
  XBlingContentTypeHeader,
  XBlingLocationHeader,
  XBlingOrigin,
  XBlingResponseTypeHeader,
  isRedirectResponse,
} from './responses'
import type {
  CreateServerFunction,
  Deserializer,
  ServerFunctionEvent,
} from './types'

const deserializers: Deserializer[] = []

export const server$: CreateServerFunction = ((_fn: any) => {
  throw new Error('Should be compiled away')
}) as unknown as CreateServerFunction

server$.addDeserializer = (deserializer: Deserializer) => {
  deserializers.push(deserializer)
}

server$.parseRequest = async function (event: ServerFunctionEvent) {
  let request = event.request
  let contentType = request.headers.get(ContentTypeHeader)
  let name = new URL(request.url).pathname,
    args = []

  if (contentType) {
    if (contentType === JSONResponseType) {
      let text = await request.text()
      try {
        args = JSON.parse(text, (key: string, value: any) => {
          if (!value) {
            return value
          }

          let deserializer = deserializers.find((d) => d.apply(value))
          if (deserializer) {
            return deserializer.deserialize(value, event)
          }
          return value
        })
      } catch (e) {
        throw new Error(`Error parsing request body: ${text}`)
      }
    } else if (contentType.includes('form')) {
      let formData = await request.clone().formData()
      args = [formData, event]
    }
  }
  return [name, args]
}

server$.respondWith = function (
  { request }: ServerFunctionEvent,
  data: Response | Error | string | object,
  responseType: 'throw' | 'return',
) {
  if (data instanceof Response) {
    if (
      isRedirectResponse(data) &&
      request.headers.get(XBlingOrigin) === 'client'
    ) {
      let headers = new Headers(data.headers)
      headers.set(XBlingOrigin, 'server')
      headers.set(XBlingLocationHeader, data.headers.get(LocationHeader)!)
      headers.set(XBlingResponseTypeHeader, responseType)
      headers.set(XBlingContentTypeHeader, 'response')
      return new Response(null, {
        status: 204,
        statusText: 'Redirected',
        headers: headers,
      })
    } else if (data.status === 101) {
      // this is a websocket upgrade, so we don't want to modify the response
      return data
    } else {
      let headers = new Headers(data.headers)
      headers.set(XBlingOrigin, 'server')
      headers.set(XBlingResponseTypeHeader, responseType)
      headers.set(XBlingContentTypeHeader, 'response')

      return new Response(data.body, {
        status: data.status,
        statusText: data.statusText,
        headers,
      })
    }
  } else if (data instanceof Error) {
    console.error(data)
    return new Response(
      JSON.stringify({
        error: {
          stack: `This error happened inside a server function and you didn't handle it. So the client will receive an Internal Server Error. You can catch the error and throw a ServerError that makes sense for your UI. In production, the user will have no idea what the error is: \n\n${data.stack}`,
          status: (data as any).status,
        },
      }),
      {
        status: (data as any).status || 500,
        headers: {
          [XBlingResponseTypeHeader]: responseType,
          [XBlingContentTypeHeader]: 'error',
        },
      },
    )
  } else if (
    typeof data === 'object' ||
    typeof data === 'string' ||
    typeof data === 'number' ||
    typeof data === 'boolean'
  ) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        [ContentTypeHeader]: 'application/json',
        [XBlingResponseTypeHeader]: responseType,
        [XBlingContentTypeHeader]: 'json',
      },
    })
  }

  return new Response('null', {
    status: 200,
    headers: {
      [ContentTypeHeader]: 'application/json',
      [XBlingContentTypeHeader]: 'json',
      [XBlingResponseTypeHeader]: responseType,
    },
  })
}

export async function handleEvent(event: ServerFunctionEvent) {
  const url = new URL(event.request.url)

  if (server$.hasHandler(url.pathname)) {
    try {
      let [name, args] = await server$.parseRequest(event)
      let handler = server$.getHandler(name)
      if (!handler) {
        throw {
          status: 404,
          message: 'Handler Not Found for ' + name,
        }
      }
      const data = await handler.call(
        event,
        ...(Array.isArray(args) ? args : [args]),
      )
      return server$.respondWith(event, data, 'return')
    } catch (error) {
      return server$.respondWith(event, error as Error, 'throw')
    }
  }

  return null
}

server$.normalizeArgs = (
  path: string,
  that: ServerFunctionEvent | any,
  args: any[],
  meta: any,
) => {
  let ctx: any | undefined
  if (typeof that === 'object') {
    ctx = that
  }

  return [ctx, args]
}

const handlers = new Map()
// server$.requestContext = null;
server$.createHandler = (impl, route, meta) => {
  let serverFunction: any = function (
    this: ServerFunctionEvent | any,
    ...args: any[]
  ) {
    let [normalizedThis, normalizedArgs] = server$.normalizeArgs(
      route,
      this,
      args,
      meta,
    )

    const execute = async () => {
      console.log('Executing', route)
      if (normalizedArgs) console.log(`  Payload: ${normalizedArgs}`)
      try {
        return impl.call(normalizedThis, ...normalizedArgs)
      } catch (e) {
        if (e instanceof Error && /[A-Za-z]+ is not defined/.test(e.message)) {
          const error = new Error(
            e.message +
              '\n' +
              ' You probably are using a variable defined in a closure in your server function.',
          )
          error.stack = e.stack ?? ''
          throw error
        }
        throw e
      }
    }

    return execute()
  }

  serverFunction.url = route
  serverFunction.action = function (...args: any[]) {
    return serverFunction.call(this, ...args)
  }

  return serverFunction
}

server$.registerHandler = function (route, handler) {
  console.log('Registering handler', route)
  handlers.set(route, handler)
}

server$.getHandler = function (route) {
  return handlers.get(route)
}

server$.hasHandler = function (route) {
  return handlers.has(route)
}

// used to fetch from an API route on the server or client, without falling into
// fetch problems on the server
server$.fetch = fetch
