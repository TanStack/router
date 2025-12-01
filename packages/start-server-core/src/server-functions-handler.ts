import { isNotFound } from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  getDefaultSerovalPlugins,
} from '@tanstack/start-client-core'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import { getResponse } from './request-response'
import { getServerFnById } from './getServerFnById'

let regex: RegExp | undefined = undefined

export const handleServerAction = async ({
  request,
  context,
}: {
  request: Request
  context: any
}) => {
  const controller = new AbortController()
  const signal = controller.signal
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort)

  if (regex === undefined) {
    regex = new RegExp(`${process.env.TSS_SERVER_FN_BASE}([^/?#]+)`)
  }

  const method = request.method
  const url = new URL(request.url, 'http://localhost:3000')
  // extract the serverFnId from the url as host/_serverFn/:serverFnId
  // Define a regex to match the path and extract the :thing part

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

  const action = await getServerFnById(serverFnId)

  // Known FormData 'Content-Type' header values
  const formDataContentTypes = [
    'multipart/form-data',
    'application/x-www-form-urlencoded',
  ]

  const contentType = request.headers.get('Content-Type')
  const serovalPlugins = getDefaultSerovalPlugins()

  function parsePayload(payload: any) {
    const parsedPayload = fromJSON(payload, { plugins: serovalPlugins })
    return parsedPayload as any
  }

  const response = await (async () => {
    try {
      let result = await (async () => {
        // FormData
        if (
          formDataContentTypes.some(
            (type) => contentType && contentType.includes(type),
          )
        ) {
          // We don't support GET requests with FormData payloads... that seems impossible
          invariant(
            method.toLowerCase() !== 'get',
            'GET requests with FormData payloads are not supported',
          )
          const formData = await request.formData()
          const serializedContext = formData.get(TSS_FORMDATA_CONTEXT)
          formData.delete(TSS_FORMDATA_CONTEXT)

          const params = {
            context,
            data: formData,
          }
          if (typeof serializedContext === 'string') {
            try {
              const parsedContext = JSON.parse(serializedContext)
              const deserializedContext = fromJSON(parsedContext, {
                plugins: serovalPlugins,
              })
              if (
                typeof deserializedContext === 'object' &&
                deserializedContext
              ) {
                params.context = { ...context, ...deserializedContext }
              }
            } catch {}
          }

          return await action(params, signal)
        }

        // Get requests use the query string
        if (method.toLowerCase() === 'get') {
          invariant(
            isCreateServerFn,
            'expected GET request to originate from createServerFn',
          )
          // By default the payload is the search params
          let payload: any = search.payload
          // If there's a payload, we should try to parse it
          payload = payload ? parsePayload(JSON.parse(payload)) : {}
          payload.context = { ...context, ...payload.context }
          // Send it through!
          return await action(payload, signal)
        }

        if (method.toLowerCase() !== 'post') {
          throw new Error('expected POST method')
        }

        let jsonPayload
        if (contentType?.includes('application/json')) {
          jsonPayload = await request.json()
        }

        // If this POST request was created by createServerFn,
        // its payload  will be the only argument
        if (isCreateServerFn) {
          const payload = jsonPayload ? parsePayload(jsonPayload) : {}
          payload.context = { ...payload.context, ...context }
          return await action(payload, signal)
        }

        // Otherwise, we'll spread the payload. Need to
        // support `use server` functions that take multiple
        // arguments.
        return await action(...jsonPayload)
      })()

      // Any time we get a Response back, we should just
      // return it immediately.
      if (result.result instanceof Response) {
        result.result.headers.set(X_TSS_RAW_RESPONSE, 'true')
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

      const response = getResponse()
      let nonStreamingBody: any = undefined

      if (result !== undefined) {
        // first run without the stream in case `result` does not need streaming
        let done = false as boolean
        const callbacks: {
          onParse: (value: any) => void
          onDone: () => void
          onError: (error: any) => void
        } = {
          onParse: (value) => {
            nonStreamingBody = value
          },
          onDone: () => {
            done = true
          },
          onError: (error) => {
            throw error
          },
        }
        toCrossJSONStream(result, {
          refs: new Map(),
          plugins: serovalPlugins,
          onParse(value) {
            callbacks.onParse(value)
          },
          onDone() {
            callbacks.onDone()
          },
          onError: (error) => {
            callbacks.onError(error)
          },
        })
        if (done) {
          return new Response(
            nonStreamingBody ? JSON.stringify(nonStreamingBody) : undefined,
            {
              status: response?.status,
              statusText: response?.statusText,
              headers: {
                'Content-Type': 'application/json',
                [X_TSS_SERIALIZED]: 'true',
              },
            },
          )
        }

        // not done yet, we need to stream
        const stream = new ReadableStream({
          start(controller) {
            callbacks.onParse = (value) =>
              controller.enqueue(JSON.stringify(value) + '\n')
            callbacks.onDone = () => {
              try {
                controller.close()
              } catch (error) {
                controller.error(error)
              }
            }
            callbacks.onError = (error) => controller.error(error)
            // stream the initial body
            if (nonStreamingBody !== undefined) {
              callbacks.onParse(nonStreamingBody)
            }
          },
        })
        return new Response(stream, {
          status: response?.status,
          statusText: response?.statusText,
          headers: {
            'Content-Type': 'application/x-ndjson',
            [X_TSS_SERIALIZED]: 'true',
          },
        })
      }

      return new Response(undefined, {
        status: response?.status,
        statusText: response?.statusText,
      })
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

      const serializedError = JSON.stringify(
        await Promise.resolve(
          toCrossJSONAsync(error, {
            refs: new Map(),
            plugins: serovalPlugins,
          }),
        ),
      )
      const response = getResponse()
      return new Response(serializedError, {
        status: response?.status ?? 500,
        statusText: response?.statusText,
        headers: {
          'Content-Type': 'application/json',
          [X_TSS_SERIALIZED]: 'true',
        },
      })
    }
  })()

  request.signal.removeEventListener('abort', abort)

  return response
}

function isNotFoundResponse(error: any) {
  const { headers, ...rest } = error

  return new Response(JSON.stringify(rest), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  })
}
