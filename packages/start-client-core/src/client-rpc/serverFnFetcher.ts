import {
  encode,
  isNotFound,
  isPlainObject,
  parseRedirect,
} from '@tanstack/router-core'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import invariant from 'tiny-invariant'
import { getDefaultSerovalPlugins } from '../getDefaultSerovalPlugins'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
} from '../constants'
import type { FunctionMiddlewareClientFnOptions } from '../createMiddleware'
import type { Plugin as SerovalPlugin } from 'seroval'

let serovalPlugins: Array<SerovalPlugin<any, any>> | null = null

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  if (!serovalPlugins) {
    serovalPlugins = getDefaultSerovalPlugins()
  }
  const _first = args[0]

  // If createServerFn was used to wrap the fetcher,
  // We need to handle the arguments differently
  if (isPlainObject(_first) && _first.method) {
    const first = _first as FunctionMiddlewareClientFnOptions<any, any, any> & {
      headers: HeadersInit
    }
    const type = first.data instanceof FormData ? 'formData' : 'payload'

    // Arrange the headers
    const headers = new Headers({
      'x-tsr-redirect': 'manual',
      ...(first.headers instanceof Headers
        ? Object.fromEntries(first.headers.entries())
        : first.headers),
    })

    if (type === 'payload') {
      headers.set('accept', 'application/x-ndjson, application/json')
    }

    // If the method is GET, we need to move the payload to the query string
    if (first.method === 'GET') {
      if (type === 'formData') {
        throw new Error('FormData is not supported with GET requests')
      }
      const serializedPayload = await serializePayload(first)
      if (serializedPayload !== undefined) {
        const encodedPayload = encode({
          payload: await serializePayload(first),
        })
        if (url.includes('?')) {
          url += `&${encodedPayload}`
        } else {
          url += `?${encodedPayload}`
        }
      }
    }

    if (url.includes('?')) {
      url += `&createServerFn`
    } else {
      url += `?createServerFn`
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

  // If not a custom fetcher, it was probably
  // a `use server` function, so just proxy the arguments
  // through as a POST request
  return await getResponse(() =>
    handler(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
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
  if (opts.context && Object.keys(opts.context).length > 0) {
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
    if (opts.context && Object.keys(opts.context).length > 0) {
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
  const response = await (async () => {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof Response) {
        return error
      }
      console.log(error)
      throw error
    }
  })()

  if (response.headers.get(X_TSS_RAW_RESPONSE) === 'true') {
    return response
  }
  const contentType = response.headers.get('content-type')
  invariant(contentType, 'expected content-type header to be set')
  const serializedByStart = !!response.headers.get(X_TSS_SERIALIZED)
  // If the response is not ok, throw an error
  if (!response.ok) {
    if (serializedByStart && contentType.includes('application/json')) {
      const jsonPayload = await response.json()
      const result = fromCrossJSON(jsonPayload, { plugins: serovalPlugins! })
      throw result
    }

    throw new Error(await response.text())
  }

  if (serializedByStart) {
    let result
    if (contentType.includes('application/x-ndjson')) {
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
    if (contentType.includes('application/json')) {
      const jsonPayload = await response.json()
      result = fromCrossJSON(jsonPayload, { plugins: serovalPlugins! })
    }
    invariant(result, 'expected result to be resolved')
    if (result instanceof Error) {
      throw result
    }
    return result
  }

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
