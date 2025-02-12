import { isNotFound, isRedirect } from '@tanstack/react-router'
import invariant from 'tiny-invariant'
import {
  eventHandler,
  getEvent,
  getHeaders,
  getResponseStatus,
  toWebRequest,
} from '@tanstack/start-server'
import { startSerializer } from '@tanstack/start-client'
// @ts-expect-error
import _serverFnManifest from 'tsr:server-fn-manifest'
import type { H3Event } from '@tanstack/start-server'

// NOTE: This is a dummy export to silence warnings about
// only having a default export.
export const dummy = 1

export default eventHandler(handleServerAction)

const serverFnManifest = _serverFnManifest as Record<
  string,
  {
    functionName: string
    extractedFilename: string
    importer: () => Promise<any>
  }
>

async function handleServerAction(event: H3Event) {
  const request = toWebRequest(event)!
  const response = await handleServerRequest(request, event)

  // NOTE: I'm not sure if nitro should be handling this or if Vinxi was
  // handling it for us, but not all headers were being returned with the
  // response from the h3 utils. So we merge the headers from h3 and
  // the headers from the response and set them on the response.
  Object.entries(getHeaders()).forEach(([key, value]) => {
    if (
      key &&
      value &&
      (!response.headers.has(key) || !response.headers.get(key)) &&
      // For some reason, content-length is being set by h3, but doesn't
      // match the actual content length of the response.
      key.toLowerCase() !== 'content-length'
    ) {
      response.headers.set(key, value)
    }
  })

  return response
}

function sanitizeBase(base: string | undefined) {
  if (!base) {
    throw new Error(
      '🚨 process.env.TSS_SERVER_FN_BASE is required in start/server-handler/index',
    )
  }

  return base.replace(/^\/|\/$/g, '')
}

async function handleServerRequest(request: Request, _event?: H3Event) {
  const method = request.method
  const url = new URL(request.url, 'http://localhost:3000')
  // extract the serverFnId from the url as host/_server/:serverFnId
  // Define a regex to match the path and extract the :thing part
  const regex = new RegExp(
    `${sanitizeBase(process.env.TSS_SERVER_FN_BASE)}/([^/?#]+)`,
  )

  // Execute the regex
  const match = url.pathname.match(regex)
  const serverFnId = match ? match[1] : null
  const search = Object.fromEntries(url.searchParams.entries()) as {
    payload?: any
    createServerFn?: boolean
  }

  const isCreateServerFn = 'createServerFn' in search

  if (typeof serverFnId !== 'string') {
    throw new Error('Invalid server action param for serverFnId: ' + serverFnId)
  }

  const serverFnInfo = serverFnManifest[serverFnId]

  if (!serverFnInfo) {
    console.log('serverFnManifest', serverFnManifest)
    throw new Error('Server function info not found for ' + serverFnId)
  }

  if (process.env.NODE_ENV === 'development')
    console.info(`\nServerFn Request: ${serverFnId}`)

  let fnModule: undefined | { [key: string]: any }

  if (process.env.NODE_ENV === 'development') {
    fnModule = await (globalThis as any).app
      .getRouter('server')
      .internals.devServer.ssrLoadModule(serverFnInfo.extractedFilename)
  } else {
    fnModule = await serverFnInfo.importer()
  }

  if (!fnModule) {
    console.log('serverFnManifest', serverFnManifest)
    throw new Error('Server function module not resolved for ' + serverFnId)
  }

  const action = fnModule[serverFnInfo.functionName]

  if (!action) {
    console.log('serverFnManifest', serverFnManifest)
    console.log('fnModule', fnModule)
    throw new Error(
      `Server function module export not resolved for serverFn ID: ${serverFnId}`,
    )
  }

  // Known FormData 'Content-Type' header values
  const formDataContentTypes = [
    'multipart/form-data',
    'application/x-www-form-urlencoded',
  ]

  const response = await (async () => {
    try {
      let result = await (async () => {
        // FormData
        if (
          request.headers.get('Content-Type') &&
          formDataContentTypes.some((type) =>
            request.headers.get('Content-Type')?.includes(type),
          )
        ) {
          // We don't support GET requests with FormData payloads... that seems impossible
          invariant(
            method.toLowerCase() !== 'get',
            'GET requests with FormData payloads are not supported',
          )

          return await action(await request.formData())
        }

        // Get requests use the query string
        if (method.toLowerCase() === 'get') {
          // By default the payload is the search params
          let payload: any = search

          // If this GET request was created by createServerFn,
          // then the payload will be on the payload param
          if (isCreateServerFn) {
            payload = search.payload
          }

          // If there's a payload, we should try to parse it
          payload = payload ? startSerializer.parse(payload) : payload

          // Send it through!
          return await action(payload)
        }

        // This must be a POST request, likely JSON???
        const jsonPayloadAsString = await request.text()

        // We should probably try to deserialize the payload
        // as JSON, but we'll just pass it through for now.
        const payload = startSerializer.parse(jsonPayloadAsString)

        // If this POST request was created by createServerFn,
        // it's payload will be the only argument
        if (isCreateServerFn) {
          return await action(payload)
        }

        // Otherwise, we'll spread the payload. Need to
        // support `use server` functions that take multiple
        // arguments.
        return await action(...(payload as any))
      })()

      // Any time we get a Response back, we should just
      // return it immediately.
      if (result instanceof Response) {
        return result
      }

      // If this is a non createServerFn request, we need to
      // pull out the result from the result object
      if (!isCreateServerFn) {
        result = result.result

        // The result might again be a response,
        // and if it is, return it.
        if (result instanceof Response) {
          return result
        }
      }

      // if (!search.createServerFn) {
      //   result = result.result
      // }

      // else if (
      //   isPlainObject(result) &&
      //   'result' in result &&
      //   result.result instanceof Response
      // ) {
      //   return result.result
      // }

      // TODO: RSCs
      // if (isValidElement(result)) {
      //   const { renderToPipeableStream } = await import(
      //     // @ts-expect-error
      //     '@vinxi/react-server-dom/server'
      //   )

      //   const pipeableStream = renderToPipeableStream(result)

      //   setHeaders(event, {
      //     'Content-Type': 'text/x-component',
      //   } as any)

      //   sendStream(event, response)
      //   event._handled = true

      //   return new Response(null, { status: 200 })
      // }

      if (isRedirect(result) || isNotFound(result)) {
        return redirectOrNotFoundResponse(result)
      }

      return new Response(
        result !== undefined ? startSerializer.stringify(result) : undefined,
        {
          status: getResponseStatus(getEvent()),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    } catch (error: any) {
      if (error instanceof Response) {
        return error
      }
      // else if (
      //   isPlainObject(error) &&
      //   'result' in error &&
      //   error.result instanceof Response
      // ) {
      //   return error.result
      // }

      // Currently this server-side context has no idea how to
      // build final URLs, so we need to defer that to the client.
      // The client will check for __redirect and __notFound keys,
      // and if they exist, it will handle them appropriately.

      if (isRedirect(error) || isNotFound(error)) {
        return redirectOrNotFoundResponse(error)
      }

      console.info()
      console.info('Server Fn Error!')
      console.info()
      console.error(error)
      console.info()

      return new Response(startSerializer.stringify(error), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  })()

  if (process.env.NODE_ENV === 'development')
    console.info(`ServerFn Response: ${response.status}`)

  if (response.headers.get('Content-Type') === 'application/json') {
    const cloned = response.clone()
    const text = await cloned.text()
    const payload = text ? JSON.stringify(JSON.parse(text)) : 'undefined'

    if (process.env.NODE_ENV === 'development')
      console.info(
        ` - Payload: ${payload.length > 100 ? payload.substring(0, 100) + '...' : payload}`,
      )
  }
  if (process.env.NODE_ENV === 'development') console.info()

  return response
}

function redirectOrNotFoundResponse(error: any) {
  const { headers, ...rest } = error

  return new Response(JSON.stringify(rest), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  })
}
