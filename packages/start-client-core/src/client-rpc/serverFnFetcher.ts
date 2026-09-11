import {
  encode,
  invariant,
  isNotFound,
  parseRedirect,
} from '@tanstack/router-core'
import {
  deserialize as deserializeBundled,
  serialize as serializeBundled,
} from '#tanstack-start-server-fn-codec'
import { TSS_CONTENT_TYPE_FRAMED } from '../framed-content-type'
import { getStartOptions } from '../getStartOptions'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
} from '../constants'
import { loadServerFnCodec } from './serverFnCodecLoader.lazy'
import { setPostProcessContext } from './postProcessContext'
import type { ServerFnCodec } from './serverFnCodecLoader'

const hop = Object.prototype.hasOwnProperty
function hasOwnProperties(obj: object): boolean {
  for (const key in obj) {
    if (hop.call(obj, key)) {
      return true
    }
  }
  return false
}

// Cancel only this caller's wait; other requests still share the codec import.
function waitForCodec(
  codec: Promise<ServerFnCodec>,
  signal: AbortSignal | undefined,
): Promise<ServerFnCodec> {
  signal?.throwIfAborted()
  if (!signal) {
    return codec
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    codec.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  const first = args[0] as {
    method: string
    data?: unknown
    context?: Record<string, unknown>
    signal?: AbortSignal
    fetch?: typeof handler
    headers?: HeadersInit
  }
  if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
    first.signal?.throwIfAborted()
  }
  const isFormData = first.data instanceof FormData
  if (first.method === 'GET' && isFormData) {
    throw new Error('FormData is not supported with GET requests')
  }

  // Begin loading before fetch so responses can overlap the codec download.
  const codec =
    process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
      ? loadServerFnCodec()
      : undefined
  if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
    // Observe an early import failure while the RPC is still in flight.
    void codec!.catch(() => {})
  }
  const adapters = getStartOptions()?.serializationAdapters
  const fetchImpl = first.fetch ?? handler
  const headers = first.headers ? new Headers(first.headers) : new Headers()
  headers.set('x-tsr-serverFn', 'true')
  if (!isFormData) {
    headers.set(
      'accept',
      `${TSS_CONTENT_TYPE_FRAMED}, application/x-ndjson, application/json`,
    )
  }

  let body: BodyInit | undefined
  const hasContext = first.context && hasOwnProperties(first.context)
  if (first.method === 'POST' && isFormData) {
    body = first.data as FormData
    if (hasContext) {
      const serialize =
        process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
          ? (await waitForCodec(codec!, first.signal)).serialize
          : serializeBundled
      if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
        first.signal?.throwIfAborted()
      }
      const context = await serialize(first.context, adapters)
      if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
        first.signal?.throwIfAborted()
      }
      body.set(TSS_FORMDATA_CONTEXT, context)
    }
  } else if (
    (first.method === 'GET' || first.method === 'POST') &&
    (first.data !== undefined || hasContext)
  ) {
    const payload: { data?: unknown; context?: unknown } = {}
    if (first.data !== undefined) {
      payload.data = first.data
    }
    if (hasContext) {
      payload.context = first.context
    }
    const serialize =
      process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
        ? (await waitForCodec(codec!, first.signal)).serialize
        : serializeBundled
    if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
      first.signal?.throwIfAborted()
    }
    const serialized = await serialize(payload, adapters)
    if (first.method === 'GET') {
      url += (url.includes('?') ? '&' : '?') + encode({ payload: serialized })
    } else {
      body = serialized
      headers.set('content-type', 'application/json')
    }
  }
  if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
    first.signal?.throwIfAborted()
  }
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: first.method,
      headers,
      signal: first.signal,
      body,
    })
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
    let deserialize: ServerFnCodec['deserialize'] | undefined
    if (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy') {
      try {
        deserialize = (await waitForCodec(codec!, first.signal)).deserialize
        first.signal?.throwIfAborted()
      } catch (error) {
        // The RPC may already have completed. Release its body without resending it.
        void response.body?.cancel().catch(() => {})
        throw error
      }
    }
    const result = await (process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
      ? deserialize!(
          response,
          contentType,
          adapters,
          contentType.includes(TSS_CONTENT_TYPE_FRAMED),
          setPostProcessContext,
        )
      : deserializeBundled(response, contentType, adapters))
    if (!result) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Invariant failed: expected result to be resolved')
      }
      invariant()
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
