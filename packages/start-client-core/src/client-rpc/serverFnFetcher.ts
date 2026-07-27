import {
  createRawStreamDeserializePlugin,
  encode,
  invariant,
  isNotFound,
  parseRedirect,
} from '@tanstack/router-core'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import { getDefaultSerovalPlugins } from '../getDefaultSerovalPlugins'
import {
  TSS_CONTENT_TYPE_FRAMED,
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  validateFramedProtocolVersion,
} from '../constants'
import { createFrameDecoder } from './frame-decoder'
import type { FunctionMiddlewareClientFnOptions } from '../createMiddleware'
import type { Plugin as SerovalPlugin } from 'seroval'

let serovalPlugins: Array<SerovalPlugin<any, any>> | null = null

/**
 * Current async post-processing context for deserialization.
 *
 * Some deserializers need to perform async work after synchronous deserialization
 * (e.g., decoding RSC payloads, fetching remote data). This context allows them
 * to register promises that must complete before the deserialized value is used.
 *
 * This uses a synchronous execution context pattern:
 * - Each call to `fromCrossJSON` is synchronous
 * - Within that synchronous execution, all `fromSerializable` calls happen
 * - We set the context before `fromCrossJSON`, clear it after
 * - For streaming chunks, we set/clear context around each `onMessage` call
 *
 * Even with concurrent server function calls, each individual deserialization
 * is atomic (synchronous), so promises are correctly scoped to their call.
 */
let currentPostProcessContext: Array<Promise<unknown>> | null = null

/**
 * Set the current post-processing context for async deserialization work.
 * Called before deserialization starts.
 *
 * @param ctx - Array to collect async work promises, or null to clear
 */
export function setPostProcessContext(
  ctx: Array<Promise<unknown>> | null,
): void {
  currentPostProcessContext = ctx
}

/**
 * Get the current post-processing context.
 * Returns null if no deserialization is in progress.
 */
export function getPostProcessContext(): Array<Promise<unknown>> | null {
  return currentPostProcessContext
}

/**
 * Track an async post-processing promise in the current deserialization context.
 * Called by deserializers that need to perform async work after sync deserialization.
 *
 * If no context is active (e.g., on server), this is a no-op.
 *
 * @param promise - The async work promise to track
 */
export function trackPostProcessPromise(promise: Promise<unknown>): void {
  if (currentPostProcessContext) {
    currentPostProcessContext.push(promise)
  }
}

/**
 * Checks if an object has at least one own enumerable property.
 * More efficient than Object.keys(obj).length > 0 as it short-circuits on first property.
 */
const hop = Object.prototype.hasOwnProperty
function hasOwnProperties(obj: object): boolean {
  for (const _ in obj) {
    if (hop.call(obj, _)) {
      return true
    }
  }
  return false
}
// caller =>
//   serverFnFetcher =>
//     client =>
//       server =>
//         fn =>
//       seroval =>
//     client middleware =>
//   serverFnFetcher =>
// caller

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  if (!serovalPlugins) {
    serovalPlugins = getDefaultSerovalPlugins()
  }
  const _first = args[0]

  const first = _first as FunctionMiddlewareClientFnOptions<any, any, any> & {
    headers?: HeadersInit
  }

  // Use custom fetch if provided, otherwise fall back to the passed handler (global fetch)
  const fetchImpl = first.fetch ?? handler

  const type = first.data instanceof FormData ? 'formData' : 'payload'

  // Arrange the headers
  const headers = first.headers ? new Headers(first.headers) : new Headers()
  headers.set('x-tsr-serverFn', 'true')

  if (type === 'payload') {
    headers.set(
      'accept',
      `${TSS_CONTENT_TYPE_FRAMED}, application/x-ndjson, application/json`,
    )
  }

  // If the method is GET, we need to move the payload to the query string
  if (first.method === 'GET') {
    if (type === 'formData') {
      throw new Error('FormData is not supported with GET requests')
    }
    const serializedPayload = await serializePayload(first)
    if (serializedPayload !== undefined) {
      const encodedPayload = encode({
        payload: serializedPayload,
      })
      if (url.includes('?')) {
        url += `&${encodedPayload}`
      } else {
        url += `?${encodedPayload}`
      }
    }
  }

  let body = undefined
  if (first.method === 'POST') {
    const fetchBody = await getFetchBody(first)
    if (fetchBody?.contentType) {
      headers.set('content-type', fetchBody.contentType)
    }
    body = fetchBody?.body
  }

  return getResponse(async () =>
    fetchImpl(url, {
      method: first.method,
      headers,
      signal: first.signal,
      body,
    }),
  )
}

async function serializePayload(
  opts: FunctionMiddlewareClientFnOptions<any, any, any>,
): Promise<string | undefined> {
  let payloadAvailable = false
  const payloadToSerialize: any = {}
  if (opts.data !== undefined) {
    payloadAvailable = true
    payloadToSerialize['data'] = opts.data
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (opts.context && hasOwnProperties(opts.context)) {
    payloadAvailable = true
    payloadToSerialize['context'] = opts.context
  }

  if (payloadAvailable) {
    return serialize(payloadToSerialize)
  }
  return undefined
}

async function serialize(data: any) {
  return JSON.stringify(await toJSONAsync(data, { plugins: serovalPlugins! }))
}

async function getFetchBody(
  opts: FunctionMiddlewareClientFnOptions<any, any, any>,
): Promise<{ body: FormData | string; contentType?: string } | undefined> {
  if (opts.data instanceof FormData) {
    let serializedContext = undefined
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (opts.context && hasOwnProperties(opts.context)) {
      serializedContext = await serialize(opts.context)
    }
    if (serializedContext !== undefined) {
      opts.data.set(TSS_FORMDATA_CONTEXT, serializedContext)
    }
    return { body: opts.data }
  }
  const serializedBody = await serializePayload(opts)
  if (serializedBody) {
    return { body: serializedBody, contentType: 'application/json' }
  }
  return undefined
}

/**
 * Retrieves a response from a given function and manages potential errors
 * and special response types including redirects and not found errors.
 *
 * @param fn - The function to execute for obtaining the response.
 * @returns The processed response from the function.
 * @throws If the response is invalid or an error occurs during processing.
 */
async function getResponse(fn: () => Promise<Response>) {
  let response: Response
  try {
    response = await fn() // client => server => fn => server => client
  } catch (error) {
    if (error instanceof Response) {
      response = error
    } else {
      console.log(error)
      throw error
    }
  }

  if (response.headers.get(X_TSS_RAW_RESPONSE) === 'true') {
    return response
  }

  const contentType = response.headers.get('content-type')
  if (!contentType) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: expected content-type header to be set',
      )
    }

    invariant()
  }
  const serializedByStart = !!response.headers.get(X_TSS_SERIALIZED)

  // If the response is serialized by the start server, we need to process it
  // differently than a normal response.
  if (serializedByStart) {
    let result

    // If it's a framed response (contains RawStream), use frame decoder
    if (contentType.includes(TSS_CONTENT_TYPE_FRAMED)) {
      // Validate protocol version compatibility
      try {
        validateFramedProtocolVersion(contentType)
      } catch (error) {
        void response.body?.cancel(error).catch(() => {})
        throw error
      }

      if (!response.body) {
        throw new Error('No response body for framed response')
      }

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(
        response.body,
      )

      // Create deserialize plugin that wires up the raw streams
      const rawStreamPlugin =
        createRawStreamDeserializePlugin(getOrCreateStream)
      const plugins = [rawStreamPlugin, ...serovalPlugins!]

      result = await processFramedResponse(jsonChunks, plugins)
    }
    // If it's a JSON response, it can be simpler
    else if (contentType.includes('application/json')) {
      const jsonPayload = await response.json()
      // Track async post-processing work for this deserialization
      const postProcessPromises: Array<Promise<unknown>> = []
      setPostProcessContext(postProcessPromises)
      try {
        result = fromCrossJSON(jsonPayload, { plugins: serovalPlugins! })
      } finally {
        setPostProcessContext(null)
      }
      // Await any async post-processing before returning
      if (postProcessPromises.length) {
        await Promise.allSettled(postProcessPromises)
      }
    }

    if (!result) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Invariant failed: expected result to be resolved')
      }

      invariant()
    }
    if (result instanceof Error) {
      throw result
    }

    return result
  }

  // If it wasn't processed by the start serializer, check
  // if it's JSON
  if (contentType.includes('application/json')) {
    const jsonPayload = await response.json()
    const redirect = parseRedirect(jsonPayload)
    if (redirect) {
      throw redirect
    }
    if (isNotFound(jsonPayload)) {
      throw jsonPayload
    }
    return jsonPayload
  }

  // Otherwise, if it's not OK, throw the content
  if (!response.ok) {
    throw new Error(await response.text())
  }

  // Or return the response itself
  return response
}

/**
 * Processes a framed response where each JSON chunk is a complete JSON string
 * (already decoded by frame decoder).
 *
 * Uses per-chunk post-processing context to ensure async deserialization work
 * completes before the next chunk is processed. This prevents issues when
 * streaming values require async post-processing (e.g., RSC decoding).
 */
async function processFramedResponse(
  jsonStream: ReadableStream<string>,
  plugins: Array<SerovalPlugin<any, any>>,
) {
  const reader = jsonStream.getReader()
  const refs = new Map<number, unknown>()
  const transportFailure = new Promise<never>((_, reject) => {
    void reader.closed.catch(reject)
  })
  void transportFailure.catch(() => {})

  const deserialize = (json: string) => {
    const postProcessPromises: Array<Promise<unknown>> = []
    setPostProcessContext(postProcessPromises)
    let result
    try {
      result = fromCrossJSON(JSON.parse(json), { refs, plugins })
    } finally {
      setPostProcessContext(null)
    }
    return postProcessPromises.length
      ? Promise.race([
          Promise.allSettled(postProcessPromises),
          transportFailure,
        ]).then(() => result)
      : result
  }

  // Read and deserialize the first frame before starting the detached drain so
  // its refs exist before the drain can observe a terminal transport error.
  let initial: Promise<any>
  try {
    const { value, done } = await reader.read()
    if (done || !value) {
      throw new Error('Stream ended before first object')
    }
    initial = Promise.resolve(deserialize(value))
  } catch (error) {
    reader.cancel(error).catch(() => {})
    reader.releaseLock()
    throw error
  }

  // Process remaining frames for streaming refs like RawStream.
  // Keep draining until the server closes the stream.
  // Each chunk gets its own post-processing context to properly scope async work.
  const drain = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (value) {
          await deserialize(value)
        }
      }
    } catch (err) {
      reader.cancel(err).catch(() => {})
      throw err
    } finally {
      reader.releaseLock()
    }
  })()

  try {
    await Promise.race([initial, drain])
    return await initial
  } catch (err) {
    reader.cancel(err).catch(() => {})
    throw err
  }
}
