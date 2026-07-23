import { isNotFound, parseRedirect } from '@tanstack/router-core'
import {
  TSS_FORMDATA_CONTEXT,
  TSS_SERVER_FUNCTION,
  X_TSS_RAW_RESPONSE,
  getStartOptions,
} from '@tanstack/start-client-core'
import { ERROR_HEADER, decodeResponse } from '@solidjs/web/server-functions'
import {
  BODY_FORMAT_FORMDATA,
  BODY_FORMAT_HEADER,
  BODY_FORMAT_SERIALIZED,
  FUNCTION_ID_HEADER,
  INSTANCE_HEADER,
  X_CONTENT_RAW,
  getWireCodecOptions,
  serializeWireBody,
  serializeWireJson,
} from './directive-wire'
import type { ClientFnMeta } from '@tanstack/start-client-core'

// Kept for the split transport (serverFnTransport: 'split').
export * from '@tanstack/start-client-core/client-rpc'

interface DirectiveFetcherOptions {
  method: 'GET' | 'POST'
  data?: unknown
  context?: Record<string, unknown>
  headers?: HeadersInit
  signal?: AbortSignal
  fetch?: typeof fetch
}

let instanceCounter = 0

/**
 * Client transport for the directive server-fn pipeline: wraps the fetch stub
 * vite-plugin-solid compiled out of the "use server" trampoline. The stub is
 * only compile mechanics (its module-ordinal id is not split-safe) — calls go
 * out under the TanStack function id from `meta`, and the fetch is owned here
 * so per-call headers, abort signals and TanStack's custom `fetch` option
 * keep working.
 */
export function createDirectiveClientRpc(
  _stub: unknown,
  meta: ClientFnMeta,
) {
  const functionId = meta.id
  const url = `${process.env.TSS_SERVER_FN_BASE}?id=${encodeURIComponent(functionId)}`
  const serverFnMeta: ClientFnMeta = { id: functionId }

  const clientFn = (...args: Array<any>) => {
    const first = (args[0] ?? {}) as DirectiveFetcherOptions
    return directiveFetcher(functionId, url, first)
  }

  return Object.assign(clientFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}

async function directiveFetcher(
  functionId: string,
  baseUrl: string,
  first: DirectiveFetcherOptions,
) {
  const startFetch = getStartOptions()?.serverFns?.fetch
  const fetchImpl = first.fetch ?? startFetch ?? fetch

  const headers = new Headers(first.headers)
  headers.set('x-tsr-serverFn', 'true')
  headers.set(FUNCTION_ID_HEADER, functionId)
  // The instance header marks this as a scripted (client-runtime) call so the
  // server responds with the codec wire format instead of no-JS semantics.
  headers.set(INSTANCE_HEADER, `tss-${instanceCounter++}`)

  // The single argument the registered server trampoline receives; it is
  // passed straight to __executeServer. `context` here is the middleware
  // chain's sendContext.
  const wirePayload: Record<string, unknown> = { method: first.method }
  if (first.data !== undefined) {
    wirePayload.data = first.data
  }
  if (first.context && hasOwnProperties(first.context)) {
    wirePayload.context = first.context
  }

  let url = baseUrl
  let body: BodyInit | undefined

  if (first.method === 'GET') {
    if (first.data instanceof FormData) {
      throw new Error('FormData is not supported with GET requests')
    }
    const serialized = await serializeWireBody([wirePayload])
    url += `&args=${encodeURIComponent(serialized)}`
  } else if (first.data instanceof FormData) {
    // Native multipart body; sendContext rides in a reserved form field the
    // server trampoline extracts before invoking __executeServer.
    if (wirePayload.context) {
      first.data.set(
        TSS_FORMDATA_CONTEXT,
        await serializeWireJson(wirePayload.context),
      )
    }
    body = first.data
    headers.set(BODY_FORMAT_HEADER, BODY_FORMAT_FORMDATA)
  } else {
    body = await serializeWireBody([wirePayload])
    headers.set(BODY_FORMAT_HEADER, BODY_FORMAT_SERIALIZED)
    headers.set('content-type', 'text/plain')
  }

  return getDirectiveResponse(() =>
    fetchImpl(url, {
      method: first.method,
      headers,
      signal: first.signal,
      body,
    }),
  )
}

async function getDirectiveResponse(fn: () => Promise<Response>) {
  let response: Response
  try {
    response = await fn()
  } catch (error) {
    if (error instanceof Response) {
      response = error
    } else {
      throw error
    }
  }

  // Raw Response results pass through the transport untouched.
  if (
    response.headers.get(X_TSS_RAW_RESPONSE) === 'true' ||
    response.headers.has(X_CONTENT_RAW)
  ) {
    return response
  }

  // decodeResponse understands the runtime's body-format tags and reads from
  // a clone, so the body stays available for the fallbacks below.
  const result = await decodeResponse(response, getWireCodecOptions())

  if (response.headers.has(ERROR_HEADER)) {
    // A value thrown outside the __executeServer envelope (which itself
    // catches into { error }).
    throw result ?? new Error(`Server function ${response.status} error`)
  }

  if (result !== undefined) {
    return result
  }

  // Plain JSON responses (no wire format tag): redirects converted by
  // handleRedirectResponse, not-found payloads, and user JSON responses.
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
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

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response
}

const hop = Object.prototype.hasOwnProperty
function hasOwnProperties(obj: object): boolean {
  for (const key in obj) {
    if (hop.call(obj, key)) {
      return true
    }
  }
  return false
}
