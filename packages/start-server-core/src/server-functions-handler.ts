import {
  createRawStreamRPCPlugin,
  invariant,
  isNotFound,
  isRedirect,
} from '@tanstack/router-core'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  getDefaultSerovalPlugins,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import {
  canHaveBody,
  getErrorHeaders,
  getErrorStatus,
  getErrorStatusText,
  getRequest,
  getResponse,
  protectResponseHeaders,
  setProtectedResponseHeader,
} from './internal-request-response'
import { getServerFnById } from './getServerFnById'
import {
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  createMultiplexedStream,
} from './frame-protocol'
import type { LateStreamRegistration } from './frame-protocol'
import type { Plugin as SerovalPlugin } from 'seroval'

// Known FormData 'Content-Type' header values - module-level constant
const FORM_DATA_CONTENT_TYPES = [
  'multipart/form-data',
  'application/x-www-form-urlencoded',
]
const PROTECTED_SERIALIZED_HEADERS = ['content-type', X_TSS_SERIALIZED]

// Maximum payload size for GET requests (1MB)
const MAX_PAYLOAD_SIZE = 1_000_000
export async function createServerFnErrorResponse(
  error: unknown,
  serovalPlugins?: Array<SerovalPlugin<any, any>>,
) {
  const request = getRequest()
  const response = getResponse()
  if (isNotFound(error)) {
    return isNotFoundResponse(error)
  }

  const errorStatus = getErrorStatus(error)
  if (response.status === undefined && errorStatus === undefined) {
    console.error(error)
  }
  const headers = getErrorHeaders(error) ?? new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set(X_TSS_SERIALIZED, 'true')
  const status = response.status ?? errorStatus ?? 500
  const statusText = response.statusText ?? getErrorStatusText(error)
  if (!canHaveBody(request.method, status)) {
    const errorResponse = new Response(null, {
      status,
      statusText,
      headers,
    })
    protectResponseHeaders(errorResponse, PROTECTED_SERIALIZED_HEADERS)
    return errorResponse
  }

  const serializedError = JSON.stringify(
    await toCrossJSONAsync(error, {
      refs: new Map(),
      plugins: serovalPlugins ?? getDefaultSerovalPlugins(),
    }),
  )
  const errorResponse = new Response(serializedError, {
    status,
    statusText,
    headers,
  })
  protectResponseHeaders(errorResponse, PROTECTED_SERIALIZED_HEADERS)
  return errorResponse
}

export const handleServerAction = async ({
  request,
  context,
  serverFnId,
}: {
  request: Request
  context: any
  serverFnId: string
}) => {
  const method = request.method.toUpperCase()
  const url = new URL(request.url)

  const action = await getServerFnById(serverFnId, { origin: 'client' })

  // Early method check: reject mismatched HTTP methods before parsing
  // the request payload (FormData, JSON, query string, etc.)
  if (action.method && method !== action.method) {
    return new Response(`expected ${action.method} method. Got ${method}`, {
      status: 405,
      headers: {
        Allow: action.method,
      },
    })
  }

  const isServerFn = request.headers.get('x-tsr-serverFn') === 'true'

  let serovalPlugins: Array<SerovalPlugin<any, any>> | undefined
  const getRequestSerovalPlugins = () => {
    return (serovalPlugins ??= getDefaultSerovalPlugins())
  }

  const contentType = request.headers.get('Content-Type')

  function parsePayload(payload: any): any {
    return fromJSON(payload, {
      plugins: getRequestSerovalPlugins(),
    })
  }

  async function executeAction() {
    // FormData
    if (
      contentType &&
      FORM_DATA_CONTENT_TYPES.some((type) => contentType.includes(type))
    ) {
      // We don't support GET requests with FormData payloads... that seems impossible
      if (method === 'GET') {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Invariant failed: GET requests with FormData payloads are not supported',
          )
        }

        invariant()
      }
      const formData = await request.formData()
      const serializedContext = formData.get(TSS_FORMDATA_CONTEXT)
      formData.delete(TSS_FORMDATA_CONTEXT)

      const params = {
        context,
        data: formData,
        method,
      }
      if (typeof serializedContext === 'string') {
        try {
          const parsedContext = JSON.parse(serializedContext)
          const deserializedContext = fromJSON(parsedContext, {
            plugins: getRequestSerovalPlugins(),
          })
          if (typeof deserializedContext === 'object' && deserializedContext) {
            params.context = safeObjectMerge(
              deserializedContext as Record<string, unknown>,
              context,
            )
          }
        } catch (e) {
          // Log warning for debugging but don't expose to client
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to parse FormData context:', e)
          }
        }
      }

      return action(params)
    }

    // Get requests use the query string
    if (method === 'GET') {
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
      payload.context = safeObjectMerge(payload.context, context)
      payload.method = method
      // Send it through!
      return action(payload)
    }

    const jsonPayload = contentType?.includes('application/json')
      ? await request.json()
      : undefined

    const payload = jsonPayload ? parsePayload(jsonPayload) : {}
    payload.context = safeObjectMerge(payload.context, context)
    payload.method = method
    return action(payload)
  }

  try {
    let res = await executeAction()

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
      return setProtectedResponseHeader(unwrapped, X_TSS_RAW_RESPONSE, 'true')
    }

    return serializeResult(res)

    function serializeResult(res: unknown): Response {
      const nonStreamingBodies: Array<any> = []

      const alsResponse = getResponse()
      const status = alsResponse.status || 200

      if (!canHaveBody(request.method, status)) {
        const response = new Response(null, {
          status,
          statusText: alsResponse.statusText,
          headers: {
            'Content-Type': 'application/json',
            [X_TSS_SERIALIZED]: 'true',
          },
        })
        protectResponseHeaders(response, PROTECTED_SERIALIZED_HEADERS)
        return response
      }

      if (res !== undefined) {
        // Collect raw streams encountered during initial synchronous serialization
        const rawStreams = new Map<number, ReadableStream<Uint8Array>>()

        // Track whether we're still in the initial synchronous phase
        // After initial phase, new RawStreams go to lateStreamWriter
        let initialPhase = true

        // Late stream registration for RawStreams discovered after initial pass
        // (e.g., from resolved Promises)
        let lateStreamWriter:
          | WritableStreamDefaultWriter<LateStreamRegistration>
          | undefined
        const pendingLateStreams: Array<LateStreamRegistration> = []
        let lateStreamsClosed = false

        const cancelRawStream = (
          stream: ReadableStream<Uint8Array>,
          reason: unknown,
        ) => {
          try {
            stream.cancel(reason).catch(() => {})
          } catch {
            // Ignore locked or already-cancelled streams.
          }
        }

        const cancelPendingLateStreams = (reason: unknown) => {
          for (const registration of pendingLateStreams) {
            cancelRawStream(registration.stream, reason)
          }
          pendingLateStreams.length = 0
        }

        const cancelInitialRawStreams = (reason: unknown) => {
          for (const stream of rawStreams.values()) {
            cancelRawStream(stream, reason)
          }
          rawStreams.clear()
        }

        const writeLateStream = (registration: LateStreamRegistration) => {
          if (lateStreamsClosed || !lateStreamWriter) {
            cancelRawStream(
              registration.stream,
              'Late raw stream channel is closed',
            )
            return
          }

          lateStreamWriter.write(registration).catch(() => {
            cancelRawStream(
              registration.stream,
              'Late raw stream channel write failed',
            )
          })
        }

        const rawStreamPlugin = createRawStreamRPCPlugin(
          (id: number, stream: ReadableStream<Uint8Array>) => {
            if (initialPhase) {
              rawStreams.set(id, stream)
              return
            }

            if (lateStreamWriter) {
              // Late stream - write to the late stream channel
              writeLateStream({ id, stream })
              return
            }

            if (lateStreamsClosed) {
              cancelRawStream(stream, 'Late raw stream channel is closed')
              return
            }

            // Discovered after initial phase but before writer exists.
            pendingLateStreams.push({ id, stream })
          },
        )

        // Build plugins with RawStreamRPCPlugin first (before default SSR plugin)
        const plugins = [rawStreamPlugin, ...getRequestSerovalPlugins()]

        // first run without the stream in case `result` does not need streaming
        let done = false as boolean
        const callbacks: {
          onParse: (value: any) => void
          onDone: () => void
          onError: (error: any) => void
        } = {
          onParse: (value) => {
            nonStreamingBodies.push(value)
          },
          onDone: () => {
            done = true
          },
          onError: (error) => {
            throw error
          },
        }
        try {
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
        } catch (error) {
          cancelInitialRawStreams(error)
          cancelPendingLateStreams(error)
          throw error
        }

        // End of initial synchronous phase - any new RawStreams are "late"
        initialPhase = false

        // If any RawStreams are discovered after this point but before the
        // late-stream writer exists, we buffer them and flush once the writer
        // is ready. This avoids an occasional missed-stream race.

        // If no raw streams and done synchronously, return simple JSON
        if (done && rawStreams.size === 0) {
          if (nonStreamingBodies.length > 1) {
            throw new Error(
              'Expected Seroval to emit one synchronous root value.',
            )
          }
          lateStreamsClosed = true
          cancelPendingLateStreams(
            'Response serialization completed without framed stream',
          )
          const response = new Response(
            nonStreamingBodies.length === 1
              ? JSON.stringify(nonStreamingBodies[0])
              : undefined,
            {
              status,
              statusText: alsResponse.statusText,
              headers: {
                'Content-Type': 'application/json',
                [X_TSS_SERIALIZED]: 'true',
              },
            },
          )
          protectResponseHeaders(response, PROTECTED_SERIALIZED_HEADERS)
          return response
        }

        // Not done synchronously or has raw streams - use framed protocol
        // This supports late RawStreams from resolved Promises
        const { readable: lateStreamReadable, writable } =
          new TransformStream<LateStreamRegistration>()
        lateStreamWriter = writable.getWriter()

        // Flush any late streams that were discovered in the small window
        // between end of initial serialization and writer setup.
        for (const registration of pendingLateStreams) {
          writeLateStream(registration)
        }
        pendingLateStreams.length = 0

        // Create a stream of JSON chunks
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
              // Close late stream writer when JSON serialization is done
              // Any RawStreams not yet discovered won't be sent
              lateStreamsClosed = true
              cancelPendingLateStreams('Response serialization completed')
              lateStreamWriter
                ?.close()
                .catch(() => {
                  // Ignore close errors
                })
                .finally(() => {
                  lateStreamWriter = undefined
                })
            }

            callbacks.onError = (error) => {
              controller.error(error)
              lateStreamsClosed = true
              cancelPendingLateStreams(error)
              lateStreamWriter
                ?.abort(error)
                .catch(() => {
                  // Ignore abort errors
                })
                .finally(() => {
                  lateStreamWriter = undefined
                })
            }

            // Emit initial body if we have one
            for (const nonStreamingBody of nonStreamingBodies) {
              callbacks.onParse(nonStreamingBody)
            }
            // If serialization already completed synchronously, close now
            // This handles the case where onDone was called during toCrossJSONStream
            // before we overwrote callbacks.onDone
            if (done) {
              callbacks.onDone()
            }
          },
          cancel() {
            lateStreamsClosed = true
            cancelPendingLateStreams('Response stream cancelled')
            lateStreamWriter?.abort().catch(() => {})
            lateStreamWriter = undefined
          },
        })

        // Create multiplexed stream with JSON, initial raw streams, and late streams
        const multiplexedStream = createMultiplexedStream(
          jsonStream,
          rawStreams,
          lateStreamReadable,
        )

        const response = new Response(multiplexedStream, {
          status,
          statusText: alsResponse.statusText,
          headers: {
            'Content-Type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
            [X_TSS_SERIALIZED]: 'true',
          },
        })
        protectResponseHeaders(response, PROTECTED_SERIALIZED_HEADERS)
        return response
      }

      const response = new Response(undefined, {
        status,
        statusText: alsResponse.statusText,
      })
      return response
    }
  } catch (error: any) {
    if (error instanceof Response) {
      return error
    }

    // Currently this server-side context has no idea how to
    // build final URLs, so we need to defer that to the client.
    // The client will check for __redirect and __notFound keys,
    // and if they exist, it will handle them appropriately.

    return createServerFnErrorResponse(error, serovalPlugins)
  }
}

function isNotFoundResponse(error: any) {
  const { headers, ...rest } = error
  const responseHeaders = new Headers(headers || {})
  responseHeaders.set('Content-Type', 'application/json')

  const response = new Response(JSON.stringify(rest), {
    status: 404,
    headers: responseHeaders,
  })
  protectResponseHeaders(response, PROTECTED_SERIALIZED_HEADERS)
  return response
}
