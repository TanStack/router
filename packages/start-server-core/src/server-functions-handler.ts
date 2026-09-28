import { invariant, isNotFound, isRedirect } from '@tanstack/router-core'
import {
  createRawStreamRPCPlugin,
  defaultSerovalDeserializerPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core/ssr/server'
import {
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  getSerovalPlugins,
} from '@tanstack/start-client-core'
import {
  MAX_FRAMED_STREAMS,
  MAX_FRAME_PAYLOAD_SIZE,
} from '@tanstack/start-client-core/client-rpc'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import {
  createFinalizedResponse,
  getErrorHeaders,
  getParsedRequestUrl,
  getSerializedResponseState,
  protectResponseHeaders,
  resolveErrorResponseStatus,
  setProtectedResponseHeaders,
} from './internal-request-response'
import { getServerFnById } from './getServerFnById'
import { createMultiplexedStream } from './frame-protocol'
import type {
  LateStreamRegistration,
  MultiplexedStreamOptions,
  MultiplexedStreamRecord,
} from './frame-protocol'
import type { Plugin as SerovalPlugin } from 'seroval'
import type { StartEvent } from './internal-request-response'

// Serialized replies are decoded by the client from their body. With a
// helper-selected 3xx status, a Location would let fetch follow it first.
const SERIALIZED_JSON_HEADERS: ReadonlyMap<string, string | null> = new Map([
  ['content-type', 'application/json'],
  [X_TSS_SERIALIZED, 'true'],
  [X_TSS_RAW_RESPONSE, null],
  ['location', null],
])
// A shared template the Response constructor copies. Never mutate it.
const SERIALIZED_JSON_HEADER_INIT = new Headers({
  'content-type': 'application/json',
  [X_TSS_SERIALIZED]: 'true',
})

/** Completed bytes own no stream until the request pipeline accepts them. */
export class DeferredResponse {
  constructor(private readonly body: Uint8Array) {}

  createResponse(event: StartEvent): Response {
    return createFinalizedResponse(
      this.body,
      SERIALIZED_JSON_HEADER_INIT,
      SERIALIZED_JSON_HEADERS,
      event,
    )
  }
}

const SERIALIZED_FRAMED_HEADERS: ReadonlyMap<string, string | null> = new Map([
  ['content-type', TSS_CONTENT_TYPE_FRAMED_VERSIONED],
  [X_TSS_SERIALIZED, 'true'],
  [X_TSS_RAW_RESPONSE, null],
  ['location', null],
])
const NOT_FOUND_HEADERS: ReadonlyMap<string, string | null> = new Map([
  ['content-type', 'application/json'],
  [X_TSS_SERIALIZED, null],
  [X_TSS_RAW_RESPONSE, null],
  ['location', null],
])
const RAW_RESPONSE_HEADERS: ReadonlyMap<string, string | null> = new Map([
  [X_TSS_RAW_RESPONSE, 'true'],
])
// A Response the server function threw. The client rethrows it.
const THROWN_RESPONSE_HEADERS: ReadonlyMap<string, string | null> = new Map([
  [X_TSS_RAW_RESPONSE, 'thrown'],
])

// Maximum payload size for GET requests (1MB)
const MAX_PAYLOAD_SIZE = 1_000_000
const MAX_PENDING_SERIALIZATION_RECORDS = 1024
const MAX_PENDING_SERIALIZATION_BYTES = 32 * 1024 * 1024
const textEncoder = new TextEncoder()

function encodeSerializationRecord(value: unknown) {
  return textEncoder.encode(JSON.stringify(value))
}

function exceedsPendingSerializationLimit(
  record: Uint8Array,
  recordCount: number,
  pendingBytes: number,
) {
  return (
    recordCount >= MAX_PENDING_SERIALIZATION_RECORDS ||
    pendingBytes + record.byteLength > MAX_PENDING_SERIALIZATION_BYTES
  )
}

function runSerializationCleanup(dispose: () => void) {
  try {
    dispose()
  } catch {}
}

function cancelRawStream(stream: ReadableStream<Uint8Array>, reason?: unknown) {
  void stream.cancel(reason).catch(() => {})
}

/**
 * Marks a Response thrown during a server-function request so the client
 * rejects the call with it. Redirects keep their own protocol.
 */
export function toThrownServerFnResponse(response: Response): Response {
  return isRedirect(response)
    ? response
    : setProtectedResponseHeaders(response, THROWN_RESPONSE_HEADERS)
}

/**
 * Builds the reply for a server-function request that failed outside the
 * function, such as in request middleware. Like a failed call, it carries
 * only the thrown value under an `error` key, so the client rethrows it.
 */
export async function createServerFnErrorResponse(
  error: unknown,
  serovalPlugins?: Array<SerovalPlugin<any, any>>,
) {
  if (isNotFound(error)) {
    return isNotFoundResponse(error)
  }

  // Header getters and reporting hooks can write helpers before the status
  // is resolved. Error statuses are always body-bearing, as the client needs.
  const headers = getErrorHeaders(error) ?? new Headers()
  const { status, statusText } = resolveErrorResponseStatus(error)
  headers.set('Content-Type', 'application/json')
  headers.set(X_TSS_SERIALIZED, 'true')
  headers.delete(X_TSS_RAW_RESPONSE)
  headers.delete('location')

  const plugins =
    serovalPlugins ?? getSerovalPlugins(routerDefaultSerovalPlugins)
  let serializedError: string
  try {
    serializedError = JSON.stringify(
      await toCrossJSONAsync({ error }, { refs: new Map(), plugins }),
    )
  } catch (serializationError) {
    // Like a result that cannot be serialized, the call rejects with the
    // serialization error instead of the value it could not send.
    serializedError = JSON.stringify(
      await toCrossJSONAsync(
        { error: serializationError },
        { refs: new Map(), plugins },
      ),
    )
  }
  const errorResponse = new Response(serializedError, {
    status,
    statusText,
    headers,
  })
  protectResponseHeaders(errorResponse, SERIALIZED_JSON_HEADERS)
  return errorResponse
}

// The action merges the client context with the trusted server context
// (__executeServer), so the client context is passed through unmerged.
export const handleServerAction = async ({
  request,
  serverFnId,
}: {
  request: Request
  serverFnId: string
}) => {
  const methodUpper = request.method.toUpperCase()
  const action = await getServerFnById(serverFnId, { origin: 'client' })

  // Early method check: reject mismatched HTTP methods before parsing
  // the request payload (FormData, JSON, query string, etc.)
  if (action.method && methodUpper !== action.method) {
    return new Response(
      `expected ${action.method} method. Got ${methodUpper}`,
      {
        status: 405,
        headers: {
          Allow: action.method,
        },
      },
    )
  }

  const headers = request.headers
  const isServerFn = headers.get('x-tsr-serverfn') === 'true'
  let serovalPlugins: Array<SerovalPlugin<any, any>> | undefined
  const getRequestSerovalPlugins = () => {
    return (serovalPlugins ??= getSerovalPlugins(routerDefaultSerovalPlugins))
  }
  const contentType = headers.get('content-type')

  try {
    let res: any
    if (
      contentType &&
      (contentType.includes('multipart/form-data') ||
        contentType.includes('application/x-www-form-urlencoded'))
    ) {
      // We don't support GET requests with FormData payloads... that seems impossible
      if (methodUpper === 'GET') {
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

      const params: { context?: unknown; data: FormData; method: string } = {
        data: formData,
        method: methodUpper,
      }
      if (typeof serializedContext === 'string') {
        try {
          const parsedContext = JSON.parse(serializedContext)
          const deserializedContext = fromJSON(parsedContext, {
            plugins: getRequestSerovalPlugins(),
          })
          if (typeof deserializedContext === 'object' && deserializedContext) {
            params.context = deserializedContext
          }
        } catch (e) {
          // Log warning for debugging but don't expose to client
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to parse FormData context:', e)
          }
        }
      }

      res = await action(params)
    } else {
      let json: any
      if (methodUpper === 'GET') {
        // Get payload directly from searchParams
        const payloadParam =
          getParsedRequestUrl(request).searchParams.get('payload')
        // Reject oversized payloads to prevent DoS
        if (payloadParam && payloadParam.length > MAX_PAYLOAD_SIZE) {
          throw new Error('Payload too large')
        }
        json = payloadParam ? JSON.parse(payloadParam) : undefined
      } else if (contentType?.includes('application/json')) {
        json = await request.json()
      }
      const payload: any =
        json === undefined
          ? {}
          : fromJSON(json, { plugins: getRequestSerovalPlugins() })
      // Pass only the fields a client sends, so a crafted `error` or
      // `result` key cannot decide the outcome of the call.
      res = await action({
        data: payload.data,
        context: payload.context,
        method: methodUpper,
      })
    }

    const failed = 'error' in res
    const unwrapped = failed ? res.error : res.result

    if (!isServerFn) {
      return unwrapped
    }

    if (unwrapped instanceof Response) {
      if (failed) {
        return toThrownServerFnResponse(unwrapped)
      }
      if (isRedirect(unwrapped)) {
        return unwrapped
      }
      return setProtectedResponseHeaders(unwrapped, RAW_RESPONSE_HEADERS)
    }

    return serializeResult(res, request, getRequestSerovalPlugins())
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

/**
 * Serializes a server-function result. A result that Seroval completes
 * synchronously without RawStreams becomes plain JSON; everything else is a
 * framed response whose records and raw streams are multiplexed in order.
 */
function serializeResult(
  res: unknown,
  request: Request,
  plugins: Array<SerovalPlugin<any, any>>,
): Response | DeferredResponse {
  const initialRecords: Array<Uint8Array> = []
  let initialBytes = 0
  const pendingRawStreams: Array<LateStreamRegistration> = []

  // Seroval replays synchronously discovered work before returning. Collect
  // that first pass so a complete result can skip framing entirely.
  let done = false as boolean
  let initialParsed = false
  let serializationFailure: [unknown] | undefined
  let disposeSerialization: (() => void) | undefined
  let onParse = (value: any, initial: boolean) => {
    if (serializationFailure) {
      return
    }
    initialParsed ||= initial
    const record = encodeSerializationRecord(value)
    if (
      exceedsPendingSerializationLimit(
        record,
        initialRecords.length,
        initialBytes,
      )
    ) {
      serializationFailure = [
        new Error(
          'Server function serialization exceeded its pending output limit',
        ),
      ]
      return
    }
    initialRecords.push(record)
    initialBytes += record.byteLength
  }
  let onDone = () => {
    if (initialParsed) {
      done = true
    }
  }
  let onError = (error: any) => {
    serializationFailure ??= [error]
  }
  const rawStreamPlugin = createRawStreamRPCPlugin(
    (id: number, stream: ReadableStream<Uint8Array>) => {
      if (serializationFailure) {
        cancelRawStream(stream, serializationFailure[0])
        return
      }
      if (id > MAX_FRAMED_STREAMS) {
        const error = new Error(
          `Too many raw streams in framed response (max ${MAX_FRAMED_STREAMS})`,
        )
        cancelRawStream(stream, error)
        onError(error)
        return
      }
      pendingRawStreams.push({ id, stream })
    },
  )

  const dispose = toCrossJSONStream(res, {
    refs: new Map(),
    plugins: [rawStreamPlugin, ...plugins],
    onParse(value, initial) {
      onParse(value, initial)
    },
    onDone() {
      onDone()
    },
    onError: (error) => {
      onError(error)
    },
  })
  if (serializationFailure) {
    runSerializationCleanup(dispose)
    for (const registration of pendingRawStreams) {
      cancelRawStream(registration.stream, serializationFailure[0])
    }
    throw serializationFailure[0]
  }
  if (!done) {
    disposeSerialization = dispose
  }

  if (done && pendingRawStreams.length === 0 && initialRecords.length === 1) {
    return new DeferredResponse(initialRecords[0]!)
  }

  if (done && initialRecords.length === 1) {
    const json = initialRecords[0]!
    if (json.byteLength > MAX_FRAME_PAYLOAD_SIZE) {
      const error = new Error(
        'Server function serialization exceeded its pending output limit',
      )
      for (const registration of pendingRawStreams) {
        cancelRawStream(registration.stream, error)
      }
      throw error
    }

    // Serialization is complete, so this one bounded record needs no writer
    // or pending-serialization lifecycle. The mux still controls raw demand.
    const rawStreams = pendingRawStreams.splice(0)
    initialRecords.length = 0
    return createFramedResponse(
      new ReadableStream<MultiplexedStreamRecord>({
        start(controller) {
          controller.enqueue({ json, rawStreams })
          controller.close()
        },
        cancel(reason) {
          for (const registration of rawStreams) {
            cancelRawStream(registration.stream, reason)
          }
        },
      }),
      { signal: request.signal },
    )
  }

  // Couple every JSON patch to the RawStreams it introduces. The mux admits
  // each JSON reference before it starts that stream's chunks.
  const { readable, writable } = new TransformStream<MultiplexedStreamRecord>()
  const writer = writable.getWriter()
  const recordAbortController = new AbortController()
  let pendingBytes = 0
  const pendingRecords = new Set<MultiplexedStreamRecord>()

  const abortRecordStream = (error: unknown) => {
    if (serializationFailure) {
      return
    }
    serializationFailure = [error]
    const disposeCurrentSerialization = disposeSerialization
    disposeSerialization = undefined
    for (const registration of pendingRawStreams.splice(0)) {
      cancelRawStream(registration.stream, error)
    }
    for (const record of pendingRecords) {
      for (const registration of record.rawStreams) {
        cancelRawStream(registration.stream, error)
      }
    }
    pendingRecords.clear()
    recordAbortController.abort(error)
    void writer.abort(error).catch(() => {})
    if (disposeCurrentSerialization) {
      runSerializationCleanup(disposeCurrentSerialization)
    }
  }

  const writeRecord = (
    json: Uint8Array,
    rawStreams: Array<LateStreamRegistration>,
  ) => {
    if (serializationFailure) {
      for (const registration of rawStreams) {
        cancelRawStream(registration.stream, serializationFailure[0])
      }
      return false
    }

    if (
      json.byteLength > MAX_FRAME_PAYLOAD_SIZE ||
      exceedsPendingSerializationLimit(json, pendingRecords.size, pendingBytes)
    ) {
      const error = new Error(
        'Server function serialization exceeded its pending output limit',
      )
      for (const registration of rawStreams) {
        cancelRawStream(registration.stream, error)
      }
      onError(error)
      return false
    }

    pendingBytes += json.byteLength
    const record = { json, rawStreams }
    pendingRecords.add(record)
    void writer.write(record).then(
      () => {
        pendingRecords.delete(record)
        pendingBytes -= json.byteLength
      },
      (error) => {
        const stillOwned = pendingRecords.delete(record)
        pendingBytes -= json.byteLength
        if (stillOwned) {
          for (const registration of rawStreams) {
            cancelRawStream(registration.stream, error)
          }
        }
      },
    )
    return true
  }

  onParse = (value) => {
    if (serializationFailure) {
      return
    }
    writeRecord(encodeSerializationRecord(value), pendingRawStreams.splice(0))
  }
  onDone = () => {
    if (serializationFailure) {
      return
    }
    disposeSerialization = undefined
    void writer.close().catch(() => {})
  }
  onError = (error) => {
    abortRecordStream(error)
  }

  // Seroval buffers nested patches during its initial traversal. Their
  // RawStream callbacks may precede the root callback, so start every
  // synchronously discovered stream only after all initial records.
  const initialRawStreams = pendingRawStreams.splice(0)
  for (let index = 0; index < initialRecords.length; index++) {
    const isLast = index === initialRecords.length - 1
    if (!writeRecord(initialRecords[index]!, isLast ? initialRawStreams : [])) {
      // `writeRecord` recorded the failure. Nothing was handed to the client
      // yet, so fail the whole call.
      if (!isLast) {
        for (const registration of initialRawStreams) {
          cancelRawStream(registration.stream, serializationFailure![0])
        }
      }
      initialRecords.length = 0
      throw serializationFailure![0]
    }
  }
  initialRecords.length = 0
  if (done) {
    onDone()
  }

  void writer.closed.catch((error) => {
    abortRecordStream(error)
  })

  return createFramedResponse(readable, {
    signal: AbortSignal.any([recordAbortController.signal, request.signal]),
    onCancel: abortRecordStream,
  })
}

function createFramedResponse(
  records: ReadableStream<MultiplexedStreamRecord>,
  options: MultiplexedStreamOptions,
) {
  const multiplexedStream = createMultiplexedStream(records, options)
  // Completed JSON reads helper state later, when the pipeline accepts it.
  const { status, statusText } = getSerializedResponseState()
  try {
    const response = new Response(multiplexedStream, {
      status,
      statusText,
      headers: {
        'Content-Type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
        [X_TSS_SERIALIZED]: 'true',
      },
    })
    protectResponseHeaders(response, SERIALIZED_FRAMED_HEADERS)
    return response
  } catch (error) {
    cancelRawStream(multiplexedStream, error)
    throw error
  }
}

function isNotFoundResponse(error: any) {
  const { headers, ...rest } = error
  let responseHeaders: HeadersInit
  if (headers) {
    // Snapshot caller headers before serialization can run user callbacks.
    const copiedHeaders = new Headers(headers)
    copiedHeaders.set('Content-Type', 'application/json')
    copiedHeaders.delete(X_TSS_SERIALIZED)
    copiedHeaders.delete(X_TSS_RAW_RESPONSE)
    copiedHeaders.delete('location')
    responseHeaders = copiedHeaders
  } else {
    responseHeaders = { 'Content-Type': 'application/json' }
  }

  const response = new Response(JSON.stringify(rest), {
    status: 404,
    headers: responseHeaders,
  })
  protectResponseHeaders(response, NOT_FOUND_HEADERS)
  return response
}
