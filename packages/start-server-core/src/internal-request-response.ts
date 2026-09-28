import { AsyncLocalStorage } from 'node:async_hooks'
import { isRedirect } from '@tanstack/router-core'

import { parseCookie, parseSetCookie, serializeCookie } from 'cookie-es'
import { cloneHeaders, getSetCookieValues } from './headers'
import type {
  RequestHeaderMap,
  RequestHeaderName,
  ResponseHeaderMap,
  ResponseHeaderName,
  TypedHeaders,
} from 'fetchdts'

import type { CookieSerializeOptions } from 'cookie-es'
import type { RequestHandler } from './request-handler'

interface StartEvent {
  request: Request
  requestUrl?: URL
  /**
   * Lazily created response state. Stays `undefined` until the first
   * response helper write so requests that never use helpers pay nothing.
   */
  responseState?: ResponseState
  /** The most recently reconciled response, used by response read helpers. */
  currentResponse?: Response
  /** Applied helper operations belong to this invocation, across runtime copies. */
  responseHeaderAppends?: WeakMap<Response, Map<string, HeaderAppendOperation>>
}

/**
 * Event-owned mutable response state, recorded by the response helpers.
 *
 * A plain `Headers` object cannot distinguish between "not set" and
 * "explicitly removed", so removals and Set-Cookie intent are tracked
 * alongside the headers. All mutations flow through the helper functions in
 * this module (`setResponseHeader`, `setCookie`, ...), which record that
 * intent directly.
 */
interface ResponseState {
  status?: number
  statusText?: string
  headers: Headers
  removedHeaders?: Set<string>
  clearHeaders: boolean
  setCookieBehavior?: 'merge' | 'replace'
  headerAppends?: Map<string, HeaderAppendOperation>
}

interface HeaderAppendOperation {
  value: string
  previous?: HeaderAppendOperation
}

// Use a global symbol to ensure the same AsyncLocalStorage instance is shared
// across different bundles that may each bundle this module.
const GLOBAL_EVENT_STORAGE_KEY = Symbol.for('tanstack-start:event-storage')

const globalObj = globalThis as typeof globalThis & {
  [GLOBAL_EVENT_STORAGE_KEY]?: AsyncLocalStorage<StartEvent>
}

if (!globalObj[GLOBAL_EVENT_STORAGE_KEY]) {
  globalObj[GLOBAL_EVENT_STORAGE_KEY] = new AsyncLocalStorage<StartEvent>()
}

const eventStorage = globalObj[GLOBAL_EVENT_STORAGE_KEY]

export type { ResponseHeaderName, RequestHeaderName }

/** A detached view of outgoing headers. Use the response helpers for writes. */
export type ReadonlyResponseHeaders = Omit<
  TypedHeaders<ResponseHeaderMap>,
  'append' | 'delete' | 'set' | 'forEach'
> & {
  forEach: (
    callback: (
      value: string,
      name: ResponseHeaderName,
      headers: ReadonlyResponseHeaders,
    ) => void,
    thisArg?: unknown,
  ) => void
}

type ProtectedHeaders = ReadonlyMap<string, string | null>

type MaybePromise<T> = T | Promise<T>

// Protocol requirements describe the response body, so they follow the response
// through delegated requests as well as separately bundled runtime copies.
const PROTECTED_RESPONSE_HEADERS = Symbol.for(
  'tanstack-start:protected-response-headers',
)
type ProtectedResponse = Response & {
  [PROTECTED_RESPONSE_HEADERS]?: ProtectedHeaders
}

function getProtectedResponseHeaders(
  response: Response,
): ProtectedHeaders | undefined {
  return (response as ProtectedResponse)[PROTECTED_RESPONSE_HEADERS]
}

function installProtectedResponseHeaders(
  response: Response,
  headers: ProtectedHeaders,
): void {
  Object.defineProperty(response, PROTECTED_RESPONSE_HEADERS, {
    value: headers,
    configurable: true,
  })
}

/** Transport requirements belong to the encoded body, not its wrapper. */
export function transferResponseProtocol(
  source: Response,
  target: Response,
): void {
  const protectedHeaders = getProtectedResponseHeaders(source)
  if (protectedHeaders) {
    installProtectedResponseHeaders(target, protectedHeaders)
  }
}

/** Preserve metadata when Start reconstructs an existing response. */
export function transferResponseMetadata(
  source: Response,
  target: Response,
): void {
  transferResponseProtocol(source, target)
  const event = eventStorage.getStore()
  const appliedHeaderAppends = event?.responseHeaderAppends?.get(source)
  if (appliedHeaderAppends) {
    event!.responseHeaderAppends!.set(target, appliedHeaderAppends)
  }
}

function normalizeHeaderName(name: string): string {
  return name.toLowerCase()
}

function sanitizeStatusMessage(statusMessage = ''): string {
  // Strip everything except horizontal tab and printable ASCII (space–'~')
  // to prevent header injection through status text.
  return statusMessage.replace(/[^\t\x20-\x7e]/g, '')
}

// The Fetch `Response` constructor only accepts statuses in the 200-599
// range (anything else throws a RangeError). Start responses are always
// represented as `Response` objects — for server routes and SSR documents
// just like for server functions — so out-of-range statuses (1xx, or exotic
// codes like 783/999) cannot be carried through the pipeline at all.
function sanitizeStatusCode(
  statusCode: string | number | undefined,
  defaultStatusCode: number | undefined = 200,
): number {
  if (!statusCode) {
    return defaultStatusCode
  }
  const code = typeof statusCode === 'string' ? Number(statusCode) : statusCode
  if (!Number.isInteger(code) || code < 200 || code > 599) {
    return defaultStatusCode
  }
  return code
}

function getObjectProperty(value: unknown, key: string): unknown {
  if ((typeof value === 'object' && value) || typeof value === 'function') {
    return (value as Record<string, unknown>)[key]
  }
  return undefined
}

function getStatusCodeProperty(
  value: unknown,
  key: 'status' | 'statusCode',
): string | number | undefined {
  const property = getObjectProperty(value, key)
  if (typeof property === 'string' || typeof property === 'number') {
    return property
  }
  return undefined
}

export function getErrorStatus(error: unknown): number | undefined {
  const cause = getObjectProperty(error, 'cause')
  const status = sanitizeStatusCode(
    getStatusCodeProperty(error, 'status') ??
      getStatusCodeProperty(error, 'statusCode') ??
      getStatusCodeProperty(cause, 'status') ??
      getStatusCodeProperty(cause, 'statusCode'),
    0,
  )
  return status || undefined
}

export function getErrorStatusText(error: unknown): string | undefined {
  const cause = getObjectProperty(error, 'cause')
  const statusText =
    getObjectProperty(error, 'statusText') ??
    getObjectProperty(error, 'statusMessage') ??
    getObjectProperty(cause, 'statusText') ??
    getObjectProperty(cause, 'statusMessage')
  if (typeof statusText === 'string') {
    return sanitizeStatusMessage(statusText)
  }
  return undefined
}

export function getErrorHeaders(error: unknown): Headers | undefined {
  const cause = getObjectProperty(error, 'cause')
  const headers =
    getObjectProperty(error, 'headers') ?? getObjectProperty(cause, 'headers')
  if (!headers) {
    return undefined
  }
  try {
    return new Headers(headers as HeadersInit)
  } catch {
    return undefined
  }
}

function getResponseState(event: StartEvent): ResponseState {
  return (event.responseState ||= {
    headers: new Headers(),
    clearHeaders: false,
  })
}

function setHeaderState(event: StartEvent, name: string, value: string): void {
  const state = getResponseState(event)
  const normalizedName = normalizeHeaderName(name)
  state.headers.set(name, value)
  state.headerAppends?.delete(normalizedName)
  state.removedHeaders?.delete(normalizedName)
  if (normalizedName === 'set-cookie') {
    state.setCookieBehavior = 'replace'
  }
}

function appendHeaderState(
  event: StartEvent,
  name: string,
  value: string,
): void {
  const state = getResponseState(event)
  const normalizedName = normalizeHeaderName(name)
  const appendToReturnedHeader =
    normalizedName !== 'set-cookie' &&
    !state.clearHeaders &&
    !state.removedHeaders?.has(normalizedName) &&
    (!state.headers.has(normalizedName) ||
      state.headerAppends?.has(normalizedName))
  // Validate and normalize through native Headers before recording intent.
  state.headers.append(name, value)
  if (appendToReturnedHeader) {
    const appends = (state.headerAppends ||= new Map())
    appends.set(normalizedName, {
      value,
      previous: appends.get(normalizedName),
    })
  }
  state.removedHeaders?.delete(normalizedName)
  if (
    normalizedName === 'set-cookie' &&
    state.setCookieBehavior !== 'replace'
  ) {
    state.setCookieBehavior = 'merge'
  }
}

function deleteHeaderState(event: StartEvent, name: string): void {
  const state = getResponseState(event)
  const normalizedName = normalizeHeaderName(name)
  state.headers.delete(name)
  state.headerAppends?.delete(normalizedName)
  ;(state.removedHeaders ||= new Set()).add(normalizedName)
  if (normalizedName === 'set-cookie') {
    state.setCookieBehavior = 'replace'
  }
}

function getDistinctCookieKey(
  name: string,
  options: { domain?: string; path?: string },
  defaultPath = '',
): string {
  return [name, options.domain || '', options.path ?? defaultPath].join(';')
}

function getDistinctCookieKeyFromHeader(cookie: string): string | undefined {
  const parsed = parseSetCookie(cookie)
  if (!parsed) {
    return undefined
  }
  return getDistinctCookieKey(parsed.name, parsed)
}

function replaceSetCookieValues(
  headers: Headers,
  cookies: Array<string>,
): void {
  headers.delete('set-cookie')
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }
}

function getMergedSetCookieValues(
  headers: Headers,
  cookiesToMerge: Array<string>,
): Array<string> {
  const cookieKeysToMerge = new Set(
    cookiesToMerge.map(getDistinctCookieKeyFromHeader).filter(Boolean),
  )
  const currentCookies = getSetCookieValues(headers).filter((cookie) => {
    const cookieKey = getDistinctCookieKeyFromHeader(cookie)
    return !cookieKey || !cookieKeysToMerge.has(cookieKey)
  })
  return currentCookies.concat(cookiesToMerge)
}

function mergeSetCookieValues(
  headers: Headers,
  cookiesToMerge: Array<string>,
): void {
  if (cookiesToMerge.length > 0) {
    replaceSetCookieValues(
      headers,
      getMergedSetCookieValues(headers, cookiesToMerge),
    )
  }
}

function mergeStartSetCookieValues(
  event: StartEvent,
  cookies: Array<string>,
): void {
  if (cookies.length === 0) {
    return
  }

  const state = getResponseState(event)
  state.removedHeaders?.delete('set-cookie')
  if (state.setCookieBehavior !== 'replace') {
    state.setCookieBehavior = 'merge'
  }
  mergeSetCookieValues(state.headers, cookies)
}

function hasProtectedHeaderChanges(
  response: Response,
  protectedHeaders?: ProtectedHeaders,
): boolean {
  if (!protectedHeaders) {
    return false
  }

  const headers = response.headers
  for (const [name, value] of protectedHeaders) {
    if (headers.get(name) !== value) {
      return true
    }
  }
  return false
}

function applyProtectedHeaders(
  protectedHeaders: ProtectedHeaders | undefined,
  headers: Headers,
): void {
  if (!protectedHeaders) {
    return
  }

  for (const [name, value] of protectedHeaders) {
    if (value === null) {
      headers.delete(name)
    } else {
      headers.set(name, value)
    }
  }
}

function applyHeaderState(
  target: Headers,
  state: ResponseState,
  protectedHeaders?: ProtectedHeaders,
  appliedHeaderAppends?: Map<string, HeaderAppendOperation>,
): Headers {
  let headers = target
  const mutableHeaders = () => {
    if (headers === target) {
      headers = cloneHeaders(target)
    }
    return headers
  }

  if (state.clearHeaders) {
    // Snapshot the keys before deleting: deleting during live Headers
    // iteration skips entries.
    for (const name of Array.from(target.keys())) {
      if (!protectedHeaders?.has(name)) {
        mutableHeaders().delete(name)
      }
    }
  }

  if (!state.clearHeaders && state.removedHeaders) {
    for (const name of state.removedHeaders) {
      if (!protectedHeaders?.has(name) && headers.has(name)) {
        mutableHeaders().delete(name)
      }
    }
  }

  // Headers iteration combines repeated header values into one comma-joined
  // value, so `set` carries multi-value headers (Link, Vary, ...) losslessly.
  // Set-Cookie is the one header where comma-joining is unsafe (cookie
  // attributes like Expires contain commas), so it is handled separately.
  for (const [name, value] of state.headers) {
    if (name !== 'set-cookie' && !protectedHeaders?.has(name)) {
      let append = state.headerAppends?.get(name)
      if (!append) {
        if (headers.get(name) !== value) {
          mutableHeaders().set(name, value)
        }
        continue
      }
      const applied = appliedHeaderAppends?.get(name)
      const pending: Array<string> = []
      while (append && append !== applied) {
        pending.push(append.value)
        append = append.previous
      }
      for (let index = pending.length - 1; index >= 0; index--) {
        mutableHeaders().append(name, pending[index]!)
      }
    }
  }

  if (state.setCookieBehavior && !protectedHeaders?.has('set-cookie')) {
    const eventSetCookies = getSetCookieValues(state.headers)
    const cookies =
      state.setCookieBehavior === 'replace'
        ? eventSetCookies
        : getMergedSetCookieValues(headers, eventSetCookies)
    const currentCookies = getSetCookieValues(headers)
    if (
      cookies.length !== currentCookies.length ||
      cookies.some((cookie, index) => cookie !== currentCookies[index])
    ) {
      replaceSetCookieValues(mutableHeaders(), cookies)
    }
  }
  return headers
}

function hasHeaders(headers: Headers): boolean {
  return !headers.keys().next().done
}

function hasHeaderState(state: ResponseState): boolean {
  return (
    state.clearHeaders ||
    !!state.removedHeaders?.size ||
    !!state.setCookieBehavior ||
    hasHeaders(state.headers)
  )
}

export function canHaveBody(method: string, status: number): boolean {
  return (
    method !== 'HEAD' &&
    status !== 101 &&
    status !== 204 &&
    status !== 205 &&
    status !== 304
  )
}

function cancelDroppedBody(response: Response, reason: string): void {
  try {
    response.body?.cancel(reason).catch(() => {})
  } catch {
    // Ignore locked or already-consumed bodies.
  }
}

function createReconciledResponse(
  body: Response['body'],
  status: number,
  statusText: string,
  headers: Headers,
): Response {
  try {
    return new Response(body, {
      status,
      statusText,
      headers,
    })
  } catch (cause) {
    throw new Error(
      'Unable to reconcile response because its body has already been consumed or locked.',
      { cause },
    )
  }
}

function reconcileResponseWithEvent(
  response: Response,
  event: StartEvent,
  disposeBody?: (reason: string) => void,
) {
  // Fetch already enforces bodyless response statuses. Only HEAD or a helper
  // status override can require dropping an existing body.
  const mustDropBody =
    !canHaveBody(event.request.method, event.responseState?.status ?? 200) &&
    response.body !== null
  if (mustDropBody) {
    const reason =
      event.request.method === 'HEAD'
        ? 'HEAD body stripped'
        : 'Response body dropped by Start reconciliation'
    if (disposeBody) {
      disposeBody(reason)
    } else {
      cancelDroppedBody(response, reason)
    }
  }
  // Cancellation/SSR cleanup can write helpers. Read their final state before
  // applying headers or recording appends, and never reuse a canceled body.
  const state = event.responseState
  const appliedHeaderAppends = event.responseHeaderAppends?.get(response)
  const protectedHeaders = getProtectedResponseHeaders(response)
  const protectedHeadersChanged = hasProtectedHeaderChanges(
    response,
    protectedHeaders,
  )

  // Without helper writes or changed protocol headers, preserve the response.
  if (!state && !protectedHeadersChanged && !mustDropBody) {
    event.currentResponse = response
    return response
  }

  const status = state?.status ?? response.status
  const statusText = state?.statusText ?? response.statusText
  const statusChanged = status !== response.status
  const statusTextChanged = statusText !== response.statusText
  const headersChanged = !!state && hasHeaderState(state)

  if (
    !statusChanged &&
    !statusTextChanged &&
    !mustDropBody &&
    !headersChanged &&
    !protectedHeadersChanged
  ) {
    event.currentResponse = response
    return response
  }

  let headers = response.headers
  if (headersChanged) {
    headers = applyHeaderState(
      headers,
      state,
      protectedHeaders,
      appliedHeaderAppends,
    )
  }
  if (protectedHeadersChanged) {
    if (headers === response.headers) {
      headers = cloneHeaders(headers)
    }
    applyProtectedHeaders(protectedHeaders, headers)
  }

  const reconciled =
    statusChanged ||
    statusTextChanged ||
    mustDropBody ||
    headers !== response.headers
      ? createReconciledResponse(
          mustDropBody ? null : response.body,
          status,
          statusText,
          headers,
        )
      : response
  if (protectedHeaders && reconciled !== response) {
    installProtectedResponseHeaders(reconciled, protectedHeaders)
  }
  return publishResponse(reconciled, event)
}

function publishResponse(response: Response, event: StartEvent): Response {
  const headerAppends = event.responseState?.headerAppends
  if (headerAppends?.size) {
    ;(event.responseHeaderAppends ||= new WeakMap()).set(
      response,
      new Map(headerAppends),
    )
  }
  event.currentResponse = response
  return response
}

function createErrorResponse(error: unknown, event: StartEvent): Response {
  // Error metadata and reporting hooks can call public response helpers.
  // Materialize them before taking the state used to build the response.
  const errorStatus = getErrorStatus(error)
  let headers = getErrorHeaders(error) ?? new Headers()
  const errorStatusText =
    event.responseState?.statusText === undefined
      ? getErrorStatusText(error)
      : undefined
  if (event.responseState?.status === undefined && errorStatus === undefined) {
    console.error(error)
  }

  const state = event.responseState
  const status = state?.status ?? errorStatus ?? 500
  const statusText = state?.statusText ?? errorStatusText ?? ''
  const body = canHaveBody(event.request.method, status)
    ? JSON.stringify({
        status,
        statusText,
        unhandled: true,
        message: 'HTTPError',
      })
    : null
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (state && hasHeaderState(state)) {
    headers = applyHeaderState(headers, state)
  }

  // Build Start-owned errors with their final headers instead of creating a
  // response that reconciliation must immediately reconstruct. A byte body
  // keeps Fetch from restoring Content-Type after an explicit helper removal.
  return publishResponse(
    new Response(
      body !== null && !headers.has('content-type')
        ? new TextEncoder().encode(body)
        : body,
      { status, statusText, headers },
    ),
    event,
  )
}

function finalizeError(error: unknown, event: StartEvent): Response {
  if (error instanceof Response) {
    return reconcileResponseWithEvent(error, event)
  }
  return createErrorResponse(error, event)
}

export function handleStartError(error: unknown): Response {
  const event = eventStorage.getStore()
  if (event) {
    return finalizeError(error, event)
  }
  if (error instanceof Response) {
    return error
  }
  // Outside a server entry there is no invocation to recover. The thrown
  // value is never used as a request identifier.
  return createErrorResponse(error, {
    request: new Request('http://localhost'),
  })
}

export function reconcileResponse(
  response: Response,
  disposeBody?: (reason: string) => void,
): Response {
  const event = eventStorage.getStore()
  if (!event) {
    return response
  }
  // Router redirects still need destination resolution (or an RPC envelope).
  // Keep their semantic identity until createStartHandler resolves them;
  // response getters can already read the helper overlay on this snapshot.
  if (isRedirect(response)) {
    event.currentResponse = response
    return response
  }
  return reconcileResponseWithEvent(response, event, disposeBody)
}

/** Apply helper state after a response bypasses the middleware pipeline. */
export function finalizeResponse(response: Response): Response {
  const event = eventStorage.getStore()
  return event ? reconcileResponseWithEvent(response, event) : response
}

/** Build a Start-owned body with already normalized protocol headers. */
export function createFinalizedResponse(
  body: string | Uint8Array,
  headers: HeadersInit,
  protectedHeaders: ProtectedHeaders,
): Response {
  const event = eventStorage.getStore()
  const state = event?.responseState
  const status = state?.status ?? 200
  if (state && hasHeaderState(state)) {
    headers = applyHeaderState(
      headers instanceof Headers ? headers : new Headers(headers),
      state,
      protectedHeaders,
    )
  }
  const response = new Response(
    event && !canHaveBody(event.request.method, status)
      ? null
      : (body as BodyInit),
    { status, statusText: state?.statusText ?? '', headers },
  )
  protectResponseHeaders(response, protectedHeaders)
  return event ? publishResponse(response, event) : response
}

export function protectResponseHeaders(
  response: Response,
  headers: ProtectedHeaders,
): void {
  // Callers supply immutable protocol requirements with lowercase names.
  // Share those requirements across responses instead of capturing each one.
  if (headers.has('set-cookie')) {
    throw new Error('Set-Cookie headers cannot be protected.')
  }
  const previous = getProtectedResponseHeaders(response)
  if (previous === headers) {
    return
  }
  if (previous) {
    const merged = new Map(previous)
    for (const [name, value] of headers) {
      merged.set(name, value)
    }
    headers = merged
  }
  installProtectedResponseHeaders(response, headers)
}

/**
 * Set and protect transport headers on a new response. Reuse the body stream
 * without cloning or teeing it; callers transfer ownership to the result.
 */
export function setProtectedResponseHeaders(
  response: Response,
  headers: ProtectedHeaders,
): Response {
  let next: Response
  try {
    // Response copies its initializer's headers; change only that fresh copy.
    next = new Response(response.body, response)
    applyProtectedHeaders(headers, next.headers)
  } catch (cause) {
    throw new Error(
      'Unable to set response header because its body has already been consumed or locked.',
      { cause },
    )
  }
  transferResponseMetadata(response, next)
  protectResponseHeaders(next, headers)
  return next
}

function decodePathname(pathname: string): string | undefined {
  try {
    // Return the value so bundlers preserve the potentially throwing decode.
    return decodeURI(pathname)
  } catch (error) {
    if (error instanceof URIError) {
      return undefined
    }
    throw error
  }
}

function runInStartRequest(
  request: Request,
  run: () => MaybePromise<Response>,
): MaybePromise<Response> {
  let requestUrl: URL
  try {
    requestUrl = new URL(request.url)
  } catch (error) {
    if (error instanceof TypeError) {
      return new Response(null, { status: 400, statusText: 'Bad Request' })
    }
    throw error
  }
  const pathname = requestUrl.pathname
  // Validate encoded paths without changing the pathname used for routing.
  if (pathname.includes('%') && decodePathname(pathname) === undefined) {
    return new Response(null, { status: 400, statusText: 'Bad Request' })
  }
  const event: StartEvent = { request, requestUrl }
  return eventStorage.run(event, run)
}

/**
 * Keep the complete server entry, including custom error handling, inside one
 * request scope. A custom returned response is used as-is; call handleStartError
 * in a custom catch to preserve Start's response helper state.
 */
export function createServerEntry<TRegister = unknown>(entry: {
  fetch: RequestHandler<TRegister>
}): { fetch: RequestHandler<TRegister> } {
  return {
    fetch: (request: Request, requestOpts: any) => {
      const run = async () => {
        try {
          return await entry.fetch(request, requestOpts)
        } catch (error) {
          return handleStartError(error)
        }
      }
      // A nested entry delegating the same request participates in its scope.
      // Independent fetch invocations and different requests get a fresh event.
      if (eventStorage.getStore()?.request === request) {
        return run()
      }
      return runInStartRequest(request, run)
    },
  }
}

/** Establish request scope; the response pipeline owns reconciliation. */
export function withStartRequest<TRegister = unknown>(
  handler: RequestHandler<TRegister>,
) {
  return (request: Request, requestOpts: any): MaybePromise<Response> => {
    if (eventStorage.getStore()?.request === request) {
      return handler(request, requestOpts)
    }
    return runInStartRequest(request, () => handler(request, requestOpts))
  }
}

function getStartEvent() {
  const event = eventStorage.getStore()
  if (!event) {
    throw new Error(
      `No StartEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`,
    )
  }
  return event
}

function getStartRequestUrl(event: StartEvent): URL {
  return (event.requestUrl ||= new URL(event.request.url))
}

/**
 * Internal: returns the per-request parsed URL for `request`, memoized on the
 * Start event so the framework parses each request URL only once. Falls back
 * to parsing when called outside a Start event (e.g. in unit tests) or for a
 * foreign request. Callers MUST NOT mutate the returned URL.
 */
export function getParsedRequestUrl(request: Request): URL {
  const event = eventStorage.getStore()
  if (event && event.request === request) {
    return getStartRequestUrl(event)
  }
  return new URL(request.url)
}

export function getRequest(): Request {
  return getStartEvent().request
}

export function getRequestHeaders(): TypedHeaders<RequestHeaderMap> {
  return getStartEvent().request.headers as TypedHeaders<RequestHeaderMap>
}

export function getRequestHeader(name: RequestHeaderName): string | undefined {
  return getRequestHeaders().get(name) ?? undefined
}

export function getRequestIP(opts?: {
  /**
   * Use the X-Forwarded-For HTTP header set by proxies.
   *
   * Note: Make sure that this header can be trusted (your application running behind a CDN or reverse proxy) before enabling.
   */
  xForwardedFor?: boolean
}) {
  const request = getRequest()
  if (opts?.xForwardedFor) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    const forwardedIp = forwardedFor?.split(',', 1)[0]?.trim()
    if (forwardedIp) {
      return forwardedIp
    }
  }

  return (
    (request as Request & { context?: { clientAddress?: string }; ip?: string })
      .context?.clientAddress ||
    (request as Request & { ip?: string }).ip ||
    undefined
  )
}

/**
 * Get the request hostname.
 *
 * If `xForwardedHost` is `true`, it will use the `x-forwarded-host` header if it exists.
 *
 * If no host header is found, it uses the request URL's host.
 */
export function getRequestHost(opts?: { xForwardedHost?: boolean }) {
  const headers = getRequestHeaders()
  if (opts?.xForwardedHost) {
    const forwardedHost = headers.get('x-forwarded-host')
    const host = forwardedHost?.split(',', 1)[0]?.trim()
    if (host) {
      return host
    }
  }
  return (
    headers.get('host') ||
    getStartRequestUrl(getStartEvent()).host ||
    'localhost'
  )
}

/**
 * Get the full incoming request URL.
 *
 * If `xForwardedHost` is `true`, it will use the `x-forwarded-host` header if it exists.
 *
 * If `xForwardedProto` is `false`, it will not use the `x-forwarded-proto` header.
 */
export function getRequestUrl(opts?: {
  xForwardedHost?: boolean
  xForwardedProto?: boolean
}) {
  const event = getStartEvent()
  // Clone the memoized URL so callers can mutate the result freely.
  const url = new URL(getStartRequestUrl(event))
  url.protocol = getRequestProtocol(opts)
  if (opts?.xForwardedHost) {
    const host = getRequestHost(opts)
    if (host) {
      url.host = host
      if (!/:\d+$/.test(host)) {
        url.port = ''
      }
    }
  }
  return url
}

/**
 * Get the request protocol.
 *
 * If `x-forwarded-proto` header is set to "https", it will return "https". You can disable this behavior by setting `xForwardedProto` to `false`.
 *
 * If protocol cannot be determined, it will default to "http".
 */
export function getRequestProtocol(opts?: {
  xForwardedProto?: boolean
}): 'http' | 'https' | (string & {}) {
  const request = getRequest()
  if (opts?.xForwardedProto !== false) {
    const forwardedProto = request.headers
      .get('x-forwarded-proto')
      ?.split(',', 1)[0]
      ?.trim()
      .toLowerCase()
    if (forwardedProto === 'https') {
      return 'https'
    }
    if (forwardedProto === 'http') {
      return 'http'
    }
  }
  const url = getStartRequestUrl(getStartEvent())
  return url.protocol.slice(0, -1) as 'http' | 'https' | (string & {})
}

export function setResponseHeaders(
  headers: TypedHeaders<ResponseHeaderMap> | ReadonlyResponseHeaders,
): void {
  if (headers instanceof Headers) {
    for (const [name, value] of headers) {
      if (name !== 'set-cookie') {
        setResponseHeader(name as ResponseHeaderName, value)
      }
    }

    const cookies = getSetCookieValues(headers)
    if (cookies.length > 0) {
      setResponseHeader(
        'set-cookie',
        cookies.length === 1 ? cookies[0]! : cookies,
      )
    }
    return
  }

  if (!Array.isArray(headers)) {
    for (const [name, value] of Object.entries(
      headers as unknown as Record<string, string | Array<string>>,
    )) {
      setResponseHeader(name as ResponseHeaderName, value)
    }
    return
  }

  const groupedHeaders = new Map<
    string,
    { name: ResponseHeaderName; values: Array<string> }
  >()
  const addHeader = (name: string, value: string) => {
    const normalizedName = normalizeHeaderName(name)
    let header = groupedHeaders.get(normalizedName)
    if (!header) {
      header = { name: name as ResponseHeaderName, values: [] }
      groupedHeaders.set(normalizedName, header)
    }
    header.values.push(value)
  }

  for (const [name, value] of headers) {
    addHeader(name, value)
  }

  for (const { name, values } of groupedHeaders.values()) {
    setResponseHeader(name, values.length === 1 ? values[0]! : values)
  }
}

/**
 * Read a detached snapshot of the effective response headers.
 * Use response header and cookie helpers to change the outgoing response.
 */
export function getResponseHeaders(): ReadonlyResponseHeaders {
  const event = getStartEvent()
  const state = event.responseState
  const currentResponse = event.currentResponse
  if (!currentResponse) {
    return (
      state ? cloneHeaders(state.headers) : new Headers()
    ) as ReadonlyResponseHeaders
  }
  const protectedHeaders = getProtectedResponseHeaders(currentResponse)
  let headers = currentResponse.headers
  if (state && hasHeaderState(state)) {
    headers = applyHeaderState(
      headers,
      state,
      protectedHeaders,
      event.responseHeaderAppends?.get(currentResponse),
    )
  }
  // Read helpers always return a detached snapshot, including when applying
  // helper intent did not need to copy any headers.
  if (headers === currentResponse.headers) {
    headers = cloneHeaders(headers)
  }
  if (protectedHeaders) {
    applyProtectedHeaders(protectedHeaders, headers)
  }
  return headers as ReadonlyResponseHeaders
}

export function getResponseHeader(
  name: ResponseHeaderName,
): string | undefined {
  const event = getStartEvent()
  const normalizedName = normalizeHeaderName(name)
  if (
    normalizedName === 'set-cookie' ||
    event.responseState?.headerAppends?.has(normalizedName)
  ) {
    return getResponseHeaders().get(name) ?? undefined
  }
  const currentResponse = event.currentResponse
  const protectedHeaders = currentResponse
    ? getProtectedResponseHeaders(currentResponse)
    : undefined
  if (protectedHeaders?.has(normalizedName)) {
    return protectedHeaders.get(normalizedName) ?? undefined
  }

  const state = event.responseState
  if (state) {
    const stateValue = state.headers.get(name)
    if (stateValue !== null) {
      return stateValue
    }

    if (state.clearHeaders) {
      return undefined
    }

    if (state.removedHeaders?.has(normalizedName)) {
      return undefined
    }
  }

  return currentResponse?.headers.get(name) ?? undefined
}

export function setResponseHeader(
  name: ResponseHeaderName,
  value: string | Array<string>,
): void {
  const event = getStartEvent()
  if (Array.isArray(value)) {
    deleteHeaderState(event, name)
    for (const valueItem of value) {
      appendHeaderState(event, name, valueItem)
    }
  } else {
    setHeaderState(event, name, value)
  }
}

/**
 * Append a response header value without replacing existing values.
 *
 * Ordinary values are appended once per returned response. Start transfers
 * that application state when it reconstructs a response. A new response
 * created by application code is fresh input: copying already-reconciled
 * headers into it also copies their appended values, and helper appends apply
 * again. Mutate the current response or pass its middleware result through
 * when preserving an existing response's headers.
 *
 * For `set-cookie`, values must be fully serialized cookie strings; they are
 * merged into the outgoing cookies and deduped by cookie identity
 * (name + domain + path), exactly like `setCookie`. This is the primitive to
 * use when bridging external session/auth libraries that produce raw
 * `Set-Cookie` strings.
 *
 * ```ts
 * appendResponseHeader('set-cookie', await externalLib.commitSession(session))
 * ```
 */
export function appendResponseHeader(
  name: ResponseHeaderName,
  value: string | Array<string>,
): void {
  const event = getStartEvent()
  const values = Array.isArray(value) ? value : [value]
  if (normalizeHeaderName(name) === 'set-cookie') {
    // Merge one value at a time so a batched call behaves exactly like
    // sequential calls (same-identity cookies dedupe, last wins).
    for (const valueItem of values) {
      // Validate before changing cookie identity or removal intent. External
      // libraries supply serialized strings, which can fail native validation.
      const headers = new Headers({ 'set-cookie': valueItem })
      mergeStartSetCookieValues(event, getSetCookieValues(headers))
    }
    return
  }
  for (const valueItem of values) {
    appendHeaderState(event, name, valueItem)
  }
}

export function removeResponseHeader(name: ResponseHeaderName): void {
  deleteHeaderState(getStartEvent(), name)
}

export function clearResponseHeaders(
  headerNames?: Array<ResponseHeaderName>,
): void {
  const event = getStartEvent()
  if (headerNames && headerNames.length > 0) {
    for (const name of headerNames) {
      deleteHeaderState(event, name)
    }
    return
  }

  const state = getResponseState(event)
  state.clearHeaders = true
  state.headers = new Headers()
  state.headerAppends = undefined
}

export function getResponseStatus(): number {
  const event = getStartEvent()
  return event.responseState?.status ?? event.currentResponse?.status ?? 200
}

export function setResponseStatus(code?: number, text?: string): void {
  const state = getResponseState(getStartEvent())
  if (code) {
    const sanitized = sanitizeStatusCode(code, state.status)
    if (process.env.NODE_ENV === 'development' && sanitized !== code) {
      console.warn(
        `setResponseStatus(${code}) was ignored: Fetch Response objects only support status codes in the 200-599 range.`,
      )
    }
    state.status = sanitized
  }
  if (text) {
    state.statusText = sanitizeStatusMessage(text)
  }
}

/**
 * Parse the request to get HTTP Cookie header string and return an object of all cookie name-value pairs.
 * @returns Object of cookie name-value pairs
 * ```ts
 * const cookies = getCookies()
 * ```
 */
export function getCookies(): Record<string, string> {
  const cookies = parseCookie(getRequestHeaders().get('cookie') || '')
  const definedCookies: Record<string, string> = Object.create(null)

  for (const [name, value] of Object.entries(cookies)) {
    if (value !== undefined) {
      definedCookies[name] = value
    }
  }

  return definedCookies
}

/**
 * Get a cookie value by name.
 * @param name Name of the cookie to get
 * @returns {*} Value of the cookie (String or undefined)
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export function getCookie(name: string): string | undefined {
  return getCookies()[name]
}

/**
 * Set a cookie value by name.
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options {CookieSerializeOptions} Options for serializing the cookie
 * ```ts
 * setCookie('Authorization', '1234567')
 * ```
 */
export function setCookie(
  name: string,
  value: string,
  options?: CookieSerializeOptions,
): void {
  const { encode, stringify, ...attrs } = options ?? {}
  mergeStartSetCookieValues(getStartEvent(), [
    serializeCookie(
      { name, value, path: '/', ...attrs },
      { encode, stringify },
    ),
  ])
}

/**
 * Remove a cookie by name.
 * @param name Name of the cookie to delete
 * @param serializeOptions {CookieSerializeOptions} Cookie options
 * ```ts
 * deleteCookie('SessionId')
 * ```
 */
export function deleteCookie(
  name: string,
  options?: CookieSerializeOptions,
): void {
  setCookie(name, '', {
    ...options,
    maxAge: 0,
  })
}

/**
 * Internal: read-only snapshot of the event-owned response status state.
 * Use `setResponseStatus` and the header/cookie helpers for writes.
 */
export function getResponse(): {
  status: number | undefined
  statusText: string | undefined
} {
  const state = getStartEvent().responseState
  return { status: state?.status, statusText: state?.statusText }
}
