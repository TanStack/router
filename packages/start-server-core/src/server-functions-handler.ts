import { isNotFound } from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import { startSerializer } from '@tanstack/start-client-core'
import { getEvent, getResponseStatus } from './h3'
import { VIRTUAL_MODULES } from './virtual-modules'
import { loadVirtualModule } from './loadVirtualModule'

function sanitizeBase(base: string | undefined) {
  if (!base) {
    throw new Error(
      '🚨 process.env.TSS_SERVER_FN_BASE is required in start/server-handler/index',
    )
  }

  return base.replace(/^\/|\/$/g, '')
}

export const handleServerAction = async ({ request }: { request: Request }) => {
  const controller = new AbortController()
  const signal = controller.signal
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort)

  const method = request.method
  const url = new URL(request.url, 'http://localhost:3000')
  // extract the serverFnId from the url as host/_serverFn/:serverFnId
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
  const isRaw = 'raw' in search

  if (typeof serverFnId !== 'string') {
    throw new Error('Invalid server action param for serverFnId: ' + serverFnId)
  }

  const { default: serverFnManifest } = await loadVirtualModule(
    VIRTUAL_MODULES.serverFnManifest,
  )

  const serverFnInfo = serverFnManifest[serverFnId]

  if (!serverFnInfo) {
    console.info('serverFnManifest', serverFnManifest)
    throw new Error('Server function info not found for ' + serverFnId)
  }

  const fnModule = await serverFnInfo.importer()

  if (!fnModule) {
    console.info('serverFnInfo', serverFnInfo)
    throw new Error('Server function module not resolved for ' + serverFnId)
  }

  const action = fnModule[serverFnInfo.functionName]

  if (!action) {
    console.info('serverFnInfo', serverFnInfo)
    console.info('fnModule', fnModule)
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

          return await action(await request.formData(), signal)
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
          return await action(payload, signal)
        }

        // This must be a POST request, likely JSON???
        const jsonPayloadAsString = await request.text()

        // We should probably try to deserialize the payload
        // as JSON, but we'll just pass it through for now.
        const payload = startSerializer.parse(jsonPayloadAsString)

        // If this POST request was created by createServerFn,
        // it's payload will be the only argument
        if (isCreateServerFn) {
          return await action(payload, signal)
        }

        // Otherwise, we'll spread the payload. Need to
        // support `use server` functions that take multiple
        // arguments.
        return await action(...(payload as any), signal)
      })()

      // Any time we get a Response back, we should just
      // return it immediately.
      if (result.result instanceof Response) {
        return result.result
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

      // TODO: RSCs Where are we getting this package?
      // if (isValidElement(result)) {
      //   const { renderToPipeableStream } = await import(
      //     // @ts-expect-error
      //     'react-server-dom/server'
      //   )

      //   const pipeableStream = renderToPipeableStream(result)

      //   setHeaders(event, {
      //     'Content-Type': 'text/x-component',
      //   } as any)

      //   sendStream(event, response)
      //   event._handled = true

      //   return new Response(null, { status: 200 })
      // }

      if (isNotFound(result)) {
        return isNotFoundResponse(result)
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

      if (isNotFound(error)) {
        return isNotFoundResponse(error)
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

  request.signal.removeEventListener('abort', abort)

  if (isRaw) {
    return response
  }

  return response
}

function isNotFoundResponse(error: any) {
  const { headers, ...rest } = error

  return new Response(JSON.stringify(rest), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  })
}
