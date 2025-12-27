import {
  createRawStreamRPCPlugin,
  isNotFound,
  isRedirect,
} from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  getDefaultSerovalPlugins,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import { getResponse } from './request-response'
import { getServerFnById } from './getServerFnById'
import {
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  createMultiplexedStream,
} from './frame-protocol'
import type { Plugin as SerovalPlugin } from 'seroval'

// Cache serovalPlugins at module level to avoid repeated calls
let serovalPlugins: Array<SerovalPlugin<any, any>> | undefined = undefined

// Cache TextEncoder for NDJSON serialization
const textEncoder = new TextEncoder()

// Known FormData 'Content-Type' header values - module-level constant
const FORM_DATA_CONTENT_TYPES = [
  'multipart/form-data',
  'application/x-www-form-urlencoded',
]

// Maximum payload size for GET requests (1MB)
const MAX_PAYLOAD_SIZE = 1_000_000

export const handleServerAction = async ({
  request,
  context,
  serverFnId,
}: {
  request: Request
  context: any
  serverFnId: string
}) => {
  const controller = new AbortController()
  const signal = controller.signal
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort)

  const method = request.method
  const methodLower = method.toLowerCase()
  const url = new URL(request.url)

  const action = await getServerFnById(serverFnId, { fromClient: true })

  const isServerFn = request.headers.get('x-tsr-serverFn') === 'true'

  // Initialize serovalPlugins lazily (cached at module level)
  if (!serovalPlugins) {
    serovalPlugins = getDefaultSerovalPlugins()
  }

  const contentType = request.headers.get('Content-Type')

  function parsePayload(payload: any) {
    const parsedPayload = fromJSON(payload, { plugins: serovalPlugins })
    return parsedPayload as any
  }

  const response = await (async () => {
    try {
      let res = await (async () => {
        // FormData
        if (
          FORM_DATA_CONTENT_TYPES.some(
            (type) => contentType && contentType.includes(type),
          )
        ) {
          // We don't support GET requests with FormData payloads... that seems impossible
          invariant(
            methodLower !== 'get',
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
                params.context = safeObjectMerge(
                  context,
                  deserializedContext as Record<string, unknown>,
                )
              }
            } catch (e) {
              // Log warning for debugging but don't expose to client
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to parse FormData context:', e)
              }
            }
          }

          return await action(params, signal)
        }

        // Get requests use the query string
        if (methodLower === 'get') {
          // Get payload directly from searchParams
          const payloadParam = url.searchParams.get('payload')
          // Reject oversized payloads to prevent DoS
          if (payloadParam && payloadParam.length > MAX_PAYLOAD_SIZE) {
            throw new Error('Payload too large')
          }
          // If there's a payload, we should try to parse it
          const payload: any = payloadParam
            ? parsePayload(JSON.parse(payloadParam))
            : {}
          payload.context = safeObjectMerge(context, payload.context)
          // Send it through!
          return await action(payload, signal)
        }

        if (methodLower !== 'post') {
          throw new Error('expected POST method')
        }

        let jsonPayload
        if (contentType?.includes('application/json')) {
          jsonPayload = await request.json()
        }

        const payload = jsonPayload ? parsePayload(jsonPayload) : {}
        payload.context = safeObjectMerge(payload.context, context)
        return await action(payload, signal)
      })()

      const unwrapped = res.result || res.error

      if (isNotFound(res)) {
        res = isNotFoundResponse(res)
      }

      if (!isServerFn) {
        return unwrapped
      }

      if (unwrapped instanceof Response) {
        if (isRedirect(unwrapped)) {
          return unwrapped
        }
        unwrapped.headers.set(X_TSS_RAW_RESPONSE, 'true')
        return unwrapped
      }

      return serializeResult(res)

      function serializeResult(res: unknown): Response {
        let nonStreamingBody: any = undefined

        const alsResponse = getResponse()
        if (res !== undefined) {
          // Collect raw streams encountered during serialization
          const rawStreams = new Map<number, ReadableStream<Uint8Array>>()
          const rawStreamPlugin = createRawStreamRPCPlugin(
            (id: number, stream: ReadableStream<Uint8Array>) => {
              rawStreams.set(id, stream)
            },
          )

          // Build plugins with RawStreamRPCPlugin first (before default SSR plugin)
          const plugins = [rawStreamPlugin, ...(serovalPlugins || [])]

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
          toCrossJSONStream(res, {
            refs: new Map(),
            plugins,
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

          // If no raw streams and done synchronously, return simple JSON
          if (done && rawStreams.size === 0) {
            return new Response(
              nonStreamingBody ? JSON.stringify(nonStreamingBody) : undefined,
              {
                status: alsResponse.status,
                statusText: alsResponse.statusText,
                headers: {
                  'Content-Type': 'application/json',
                  [X_TSS_SERIALIZED]: 'true',
                },
              },
            )
          }

          // If we have raw streams, use framed protocol
          if (rawStreams.size > 0) {
            // Create a stream of JSON chunks (NDJSON style)
            const jsonStream = new ReadableStream<string>({
              start(controller) {
                callbacks.onParse = (value) => {
                  controller.enqueue(JSON.stringify(value) + '\n')
                }
                callbacks.onDone = () => {
                  try {
                    controller.close()
                  } catch {
                    // Already closed
                  }
                }
                callbacks.onError = (error) => controller.error(error)
                // Emit initial body if we have one
                if (nonStreamingBody !== undefined) {
                  callbacks.onParse(nonStreamingBody)
                }
              },
            })

            // Create multiplexed stream with JSON and raw streams
            const multiplexedStream = createMultiplexedStream(
              jsonStream,
              rawStreams,
            )

            return new Response(multiplexedStream, {
              status: alsResponse.status,
              statusText: alsResponse.statusText,
              headers: {
                'Content-Type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
                [X_TSS_SERIALIZED]: 'true',
              },
            })
          }

          // No raw streams but not done yet - use standard NDJSON streaming
          const stream = new ReadableStream({
            start(controller) {
              callbacks.onParse = (value) =>
                controller.enqueue(
                  textEncoder.encode(JSON.stringify(value) + '\n'),
                )
              callbacks.onDone = () => {
                try {
                  controller.close()
                } catch (error) {
                  controller.error(error)
                }
              }
              callbacks.onError = (error) => controller.error(error)
              // stream initial body
              if (nonStreamingBody !== undefined) {
                callbacks.onParse(nonStreamingBody)
              }
            },
          })
          return new Response(stream, {
            status: alsResponse.status,
            statusText: alsResponse.statusText,
            headers: {
              'Content-Type': 'application/x-ndjson',
              [X_TSS_SERIALIZED]: 'true',
            },
          })
        }

        return new Response(undefined, {
          status: alsResponse.status,
          statusText: alsResponse.statusText,
        })
      }
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
        status: response.status ?? 500,
        statusText: response.statusText,
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
