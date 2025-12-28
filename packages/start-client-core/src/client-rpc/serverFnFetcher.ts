import {
  createRawStreamDeserializePlugin,
  encode,
  isNotFound,
  parseRedirect,
} from '@tanstack/router-core'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import invariant from 'tiny-invariant'
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

  return await getResponse(async () =>
    handler(url, {
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
  return JSON.stringify(
    await Promise.resolve(toJSONAsync(data, { plugins: serovalPlugins! })),
  )
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
  invariant(contentType, 'expected content-type header to be set')
  const serializedByStart = !!response.headers.get(X_TSS_SERIALIZED)

  // If the response is serialized by the start server, we need to process it
  // differently than a normal response.
  if (serializedByStart) {
    let result

    // If it's a framed response (contains RawStream), use frame decoder
    if (contentType.includes(TSS_CONTENT_TYPE_FRAMED)) {
      // Validate protocol version compatibility
      validateFramedProtocolVersion(contentType)

      if (!response.body) {
        throw new Error('No response body for framed response')
      }

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(
        response.body,
      )

      // Create deserialize plugin that wires up the raw streams
      const rawStreamPlugin =
        createRawStreamDeserializePlugin(getOrCreateStream)
      const plugins = [rawStreamPlugin, ...(serovalPlugins || [])]

      const refs = new Map()
      result = await processFramedResponse({
        jsonStream: jsonChunks,
        onMessage: (msg: any) => fromCrossJSON(msg, { refs, plugins }),
        onError(msg, error) {
          console.error(msg, error)
        },
      })
    }
    // If it's a stream from the start serializer, process it as such
    else if (contentType.includes('application/x-ndjson')) {
      const refs = new Map()
      result = await processServerFnResponse({
        response,
        onMessage: (msg) =>
          fromCrossJSON(msg, { refs, plugins: serovalPlugins! }),
        onError(msg, error) {
          // TODO how could we notify consumer that an error occurred?
          console.error(msg, error)
        },
      })
    }
    // If it's a JSON response, it can be simpler
    else if (contentType.includes('application/json')) {
      const jsonPayload = await response.json()
      result = fromCrossJSON(jsonPayload, { plugins: serovalPlugins! })
    }

    invariant(result, 'expected result to be resolved')
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

async function processServerFnResponse({
  response,
  onMessage,
  onError,
}: {
  response: Response
  onMessage: (msg: any) => any
  onError?: (msg: string, error?: any) => void
}) {
  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

  let buffer = ''
  let firstRead = false
  let firstObject

  while (!firstRead) {
    const { value, done } = await reader.read()
    if (value) buffer += value

    if (buffer.length === 0 && done) {
      throw new Error('Stream ended before first object')
    }

    // common case: buffer ends with newline
    if (buffer.endsWith('\n')) {
      const lines = buffer.split('\n').filter(Boolean)
      const firstLine = lines[0]
      if (!firstLine) throw new Error('No JSON line in the first chunk')
      firstObject = JSON.parse(firstLine)
      firstRead = true
      buffer = lines.slice(1).join('\n')
    } else {
      // fallback: wait for a newline to parse first object safely
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) {
          firstObject = JSON.parse(line)
          firstRead = true
        }
      }
    }
  }

  // process rest of the stream asynchronously
  ;(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { value, done } = await reader.read()
        if (value) buffer += value

        const lastNewline = buffer.lastIndexOf('\n')
        if (lastNewline >= 0) {
          const chunk = buffer.slice(0, lastNewline)
          buffer = buffer.slice(lastNewline + 1)
          const lines = chunk.split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              onMessage(JSON.parse(line))
            } catch (e) {
              onError?.(`Invalid JSON line: ${line}`, e)
            }
          }
        }

        if (done) {
          break
        }
      }
    } catch (err) {
      onError?.('Stream processing error:', err)
    }
  })()

  return onMessage(firstObject)
}

/**
 * Processes a framed response where each JSON chunk is a complete JSON string
 * (already decoded by frame decoder).
 */
async function processFramedResponse({
  jsonStream,
  onMessage,
  onError,
}: {
  jsonStream: ReadableStream<string>
  onMessage: (msg: any) => any
  onError?: (msg: string, error?: any) => void
}) {
  const reader = jsonStream.getReader()

  // Read first JSON frame - this is the main result
  const { value: firstValue, done: firstDone } = await reader.read()
  if (firstDone || !firstValue) {
    throw new Error('Stream ended before first object')
  }

  // Each frame is a complete JSON string
  const firstObject = JSON.parse(firstValue)

  // Process remaining frames asynchronously (for streaming refs like RawStream)
  ;(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          try {
            onMessage(JSON.parse(value))
          } catch (e) {
            onError?.(`Invalid JSON: ${value}`, e)
          }
        }
      }
    } catch (err) {
      onError?.('Stream processing error:', err)
    }
  })()

  return onMessage(firstObject)
}
