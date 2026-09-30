import { AsyncLocalStorage } from 'node:async_hooks'
import { isRedirect } from '@tanstack/router-core'

import { parseCookie, parseSetCookie, serializeCookie } from 'cookie-es'
import { getSetCookieValues } from './headers'
import type {
  RequestHeaderMap,
  RequestHeaderName,
  ResponseHeaderMap,
  ResponseHeaderName,
  TypedHeaders,
} from 'fetchdts'

import type { CookieSerializeOptions } from 'cookie-es'
import type { RequestHandler } from './request-handler'

export interface StartEvent {
  request: Request
  /** The parsed request URL. Callers must not mutate it. */
  requestUrl: URL
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
  /** Outside production: a discarded bodyless status was already reported. */
  bodylessStatusWarned?: boolean
  /** Identity of each Set-Cookie string seen by this request's merges. */
  setCookieKeys?: Map<string, string>
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

// Lowercase protocol header names mapped to a required value, or to null when
// the header must be absent. Set-Cookie is never protected: it has one value
// per cookie.
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
  if (
    protectedHeaders &&
    getProtectedResponseHeaders(target) !== protectedHeaders
  ) {
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

function sanitizeStatusMessage(statusMessage: string): string {
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
): number | undefined {
  const code = typeof statusCode === 'string' ? Number(statusCode) : statusCode
  if (
    code === undefined ||
    !Number.isInteger(code) ||
    code < 200 ||
    code > 599
  ) {
    return undefined
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

function getErrorStatus(error: unknown): number | undefined {
  const cause = getObjectProperty(error, 'cause')
  return sanitizeStatusCode(
    getStatusCodeProperty(error, 'status') ??
      getStatusCodeProperty(error, 'statusCode') ??
      getStatusCodeProperty(cause, 'status') ??
      getStatusCodeProperty(cause, 'statusCode'),
  )
}

function getErrorStatusText(error: unknown): string | undefined {
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

// Start always builds a new error body. These headers describe another body's
// framing or its connection, so they would corrupt that body on the wire.
const ERROR_BODY_EXCLUDED_HEADERS = [
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
]

// Responses from another fetch implementation or realm fail instanceof.
function isResponse(value: unknown): boolean {
  return (
    value instanceof Response ||
    Object.prototype.toString.call(value) === '[object Response]'
  )
}

export function getErrorHeaders(error: unknown): Headers | undefined {
  let init = getObjectProperty(error, 'headers')
  if (!init) {
    const cause = getObjectProperty(error, 'cause')
    // A Response cause is another server's reply, such as a failed upstream
    // fetch. Its headers were written for that reply, not for this client.
    if (isResponse(cause)) {
      return undefined
    }
    init = getObjectProperty(cause, 'headers')
  }
  if (!init) {
    return undefined
  }
  let headers: Headers
  try {
    headers = new Headers(init as HeadersInit)
  } catch {
    return undefined
  }
  for (const name of ERROR_BODY_EXCLUDED_HEADERS) {
    headers.delete(name)
  }
  return headers
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

function getDistinctCookieKeyFromHeader(cookie: string): string {
  const parsed = parseSetCookie(cookie)
  // A cookie the parser rejects is identified by its exact string, so merging
  // it again replaces it. Header values cannot contain NUL, so this key cannot
  // match a parsed name, domain, and path.
  return parsed ? getDistinctCookieKey(parsed.name, parsed) : `\0${cookie}`
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

// Every reconcile pass merges the same immutable cookie strings again, so
// parse each string's identity once per request.
function getCookieKey(state: ResponseState, cookie: string): string {
  const keys = (state.setCookieKeys ||= new Map())
  let key = keys.get(cookie)
  if (key === undefined) {
    key = getDistinctCookieKeyFromHeader(cookie)
    keys.set(cookie, key)
  }
  return key
}

function getMergedSetCookieValues(
  state: ResponseState,
  currentCookies: Array<string>,
  cookiesToMerge: Array<string>,
): Array<string> {
  if (currentCookies.length === 0) {
    return cookiesToMerge
  }
  const cookieKeysToMerge = new Set<string>()
  for (const cookie of cookiesToMerge) {
    cookieKeysToMerge.add(getCookieKey(state, cookie))
  }
  return currentCookies
    .filter((cookie) => !cookieKeysToMerge.has(getCookieKey(state, cookie)))
    .concat(cookiesToMerge)
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
  replaceSetCookieValues(
    state.headers,
    getMergedSetCookieValues(state, getSetCookieValues(state.headers), cookies),
  )
}

function hasProtectedHeaderChanges(
  response: Response,
  protectedHeaders: ProtectedHeaders,
): boolean {
  const headers = response.headers
  for (const [name, value] of protectedHeaders) {
    if (headers.get(name) !== value) {
      return true
    }
  }
  return false
}

function applyProtectedHeaders(
  protectedHeaders: ProtectedHeaders,
  headers: Headers,
): void {
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
      headers = new Headers(target)
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
    const currentCookies = getSetCookieValues(headers)
    const cookies =
      state.setCookieBehavior === 'replace'
        ? eventSetCookies
        : getMergedSetCookieValues(state, currentCookies, eventSetCookies)
    if (
      cookies.length !== currentCookies.length ||
      cookies.some((cookie, index) => cookie !== currentCookies[index])
    ) {
      replaceSetCookieValues(mutableHeaders(), cookies)
    }
  }
  return headers
}

function canHaveBody(method: string, status: number): boolean {
  return method !== 'HEAD' && status !== 204 && status !== 205 && status !== 304
}

/** A protected content type marks a Start-serialized body the client decodes. */
function isSerializedResponse(protectedHeaders: ProtectedHeaders | undefined) {
  return typeof protectedHeaders?.get('content-type') === 'string'
}

/**
 * A helper status that forbids a body never applies to a serialized
 * server-function reply, because the client must decode it. Only a HEAD request
 * drops its body.
 */
function getHelperStatus(
  state: ResponseState | undefined,
  serialized: boolean,
): number | undefined {
  const status = state?.status
  if (!serialized || status === undefined || canHaveBody('GET', status)) {
    return status
  }
  if (process.env.NODE_ENV !== 'production' && !state!.bodylessStatusWarned) {
    state!.bodylessStatusWarned = true
    console.warn(
      `setResponseStatus(${status}) does not apply to serialized server function responses, because the client must decode their body. Return a Response from the server function to send a response without a body.`,
    )
  }
  return undefined
}

/** Helper status text describes the helper status and is ignored with it. */
function getHelperStatusText(
  state: ResponseState | undefined,
  helperStatus: number | undefined,
): string | undefined {
  return helperStatus === state?.status ? state?.statusText : undefined
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

/** Apply helper state to a response, including one that bypasses middleware. */
export function finalizeResponse(
  response: Response,
  event: StartEvent,
  disposeBody?: (reason: string) => void,
): Response {
  const protectedHeaders = getProtectedResponseHeaders(response)
  const serialized = isSerializedResponse(protectedHeaders)
  let helperStatus = getHelperStatus(event.responseState, serialized)
  // Some runtimes, such as Bun, allow a body on a 204, 205, or 304 response,
  // so check the response's own status too. Read the body last: the getter
  // allocates a stream for responses that have not exposed one yet.
  const mustDropBody =
    !canHaveBody(event.request.method, helperStatus ?? response.status) &&
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
    // Cancellation/SSR cleanup can write helpers. Read their final state
    // before applying headers or recording appends.
    helperStatus = getHelperStatus(event.responseState, serialized)
  }
  const state = event.responseState

  // Without helper writes, preserve the response.
  if (!state && !mustDropBody) {
    event.currentResponse = response
    return response
  }

  const status = helperStatus ?? response.status
  const statusText =
    getHelperStatusText(state, helperStatus) ?? response.statusText
  const statusChanged = status !== response.status
  const statusTextChanged = statusText !== response.statusText
  // applyHeaderState returns the same headers when helper intent changes
  // nothing.
  const headers = state
    ? applyHeaderState(
        response.headers,
        state,
        protectedHeaders,
        event.responseHeaderAppends?.get(response),
      )
    : response.headers

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

function getHttpErrorStatus(status: number | undefined): number | undefined {
  return status !== undefined && status >= 400 ? status : undefined
}

/**
 * Status for a response built from an uncaught error. Only an error status
 * (400-599) from a helper or from error metadata describes the failure, so a
 * success or redirect status set before the throw cannot hide it. The error is
 * logged unless its own metadata marks it as an HTTP error. Reporting runs
 * before helper state is read, so hooks that write helpers are included.
 */
function resolveErrorStatus(
  error: unknown,
  event: Pick<StartEvent, 'responseState'> | undefined,
): { status: number; statusText: string } {
  const metadataStatus = getErrorStatus(error)
  const errorStatus = getHttpErrorStatus(metadataStatus)
  if (errorStatus === undefined) {
    console.error(error)
  }
  const state = event?.responseState
  const helperStatus = getHttpErrorStatus(state?.status)
  const status = helperStatus ?? errorStatus ?? 500
  const statusText =
    getHelperStatusText(state, helperStatus) ??
    (status === errorStatus || metadataStatus === undefined
      ? getErrorStatusText(error)
      : undefined) ??
    ''
  if (state && state.status !== helperStatus) {
    // The failure replaced the response that status was meant for. Discard it
    // so later reconciliation keeps the error status.
    state.status = undefined
    state.statusText = undefined
  }
  return { status, statusText }
}

/**
 * Internal: status and status text for a serialized server-function error.
 * Logs the error and discards a non-error helper status, like any error
 * response Start builds.
 */
export function resolveErrorResponseStatus(error: unknown): {
  status: number
  statusText: string
} {
  return resolveErrorStatus(error, eventStorage.getStore())
}

function createErrorResponse(error: unknown, event: StartEvent): Response {
  // Error metadata and reporting hooks can call public response helpers.
  // Materialize them before taking the state used to build the response.
  let headers = getErrorHeaders(error) ?? new Headers()
  const { status, statusText } = resolveErrorStatus(error, event)
  const state = event.responseState
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

  if (state) {
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
    return finalizeResponse(error, event)
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
  const request = new Request('http://localhost')
  return createErrorResponse(error, {
    request,
    requestUrl: new URL(request.url),
  })
}

export function reconcileResponse(
  response: Response,
  event: StartEvent,
  disposeBody?: (reason: string) => void,
): Response {
  // Without helper writes, only a bodyless status could change the response,
  // and the response Start last published already satisfies it. Router
  // redirects still need destination resolution (or an RPC envelope), so they
  // keep their identity until createStartHandler resolves them; response
  // getters can already read the helper overlay on this snapshot.
  if (
    (!event.responseState &&
      (response === event.currentResponse ||
        canHaveBody(event.request.method, response.status))) ||
    isRedirect(response)
  ) {
    event.currentResponse = response
    return response
  }
  return finalizeResponse(response, event, disposeBody)
}

/**
 * Restore protocol headers that middleware changed directly on the response.
 * Start does this once, when the response leaves the request middleware
 * pipeline; helper writes never override them.
 */
export function restoreResponseProtocol(
  response: Response,
  event: StartEvent,
): Response {
  const protectedHeaders = getProtectedResponseHeaders(response)
  if (
    !protectedHeaders ||
    !hasProtectedHeaderChanges(response, protectedHeaders)
  ) {
    return response
  }
  const headers = new Headers(response.headers)
  applyProtectedHeaders(protectedHeaders, headers)
  const restored = createReconciledResponse(
    response.body,
    response.status,
    response.statusText,
    headers,
  )
  transferResponseMetadata(response, restored)
  event.currentResponse = restored
  return restored
}

/**
 * Build a Start-owned serialized reply with already normalized protocol
 * headers. A bodyless helper status never applies to it; only a HEAD request
 * drops its body.
 */
export function createFinalizedResponse(
  body: string | Uint8Array,
  headers: Headers,
  protectedHeaders: ProtectedHeaders,
  event: StartEvent,
): Response {
  const state = event.responseState
  let status = 200
  let statusText = ''
  if (state) {
    const helperStatus = getHelperStatus(state, true)
    status = helperStatus ?? 200
    statusText = getHelperStatusText(state, helperStatus) ?? ''
    headers = applyHeaderState(headers, state, protectedHeaders)
  }
  const response = new Response(
    canHaveBody(event.request.method, status) ? (body as BodyInit) : null,
    { status, statusText, headers },
  )
  // A new response has no protection to merge with.
  installProtectedResponseHeaders(response, protectedHeaders)
  return publishResponse(response, event)
}

export function protectResponseHeaders(
  response: Response,
  headers: ProtectedHeaders,
): void {
  // Callers supply immutable protocol requirements with lowercase names.
  // Share those requirements across responses instead of capturing each one.
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

/** A Start handler that runs in a request scope and receives its event. */
type ScopedRequestHandler = (
  request: Request,
  requestOpts: any,
  event: StartEvent,
) => MaybePromise<Response>

function runInStartRequest(
  request: Request,
  requestOpts: any,
  handler: ScopedRequestHandler,
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
  return eventStorage.run(event, handler, request, requestOpts, event)
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
    fetch: withStartRequest(async (request: Request, requestOpts: any) => {
      try {
        return await entry.fetch(request, requestOpts)
      } catch (error) {
        return handleStartError(error)
      }
    }),
  }
}

/**
 * Establish request scope; the response pipeline owns reconciliation. A nested
 * handler delegating the same request participates in its scope. Independent
 * fetch invocations and different requests get a fresh event.
 */
export function withStartRequest(handler: ScopedRequestHandler) {
  return (request: Request, requestOpts: any): MaybePromise<Response> => {
    const event = eventStorage.getStore()
    if (event?.request === request) {
      return handler(request, requestOpts, event)
    }
    return runInStartRequest(request, requestOpts, handler)
  }
}

export function getStartEvent() {
  const event = eventStorage.getStore()
  if (!event) {
    throw new Error(
      `No StartEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`,
    )
  }
  return event
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
    return event.requestUrl
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
  return headers.get('host') || getStartEvent().requestUrl.host || 'localhost'
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
  const url = new URL(event.requestUrl)
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
  const url = getStartEvent().requestUrl
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

let SnapshotHeaders: typeof Headers | undefined

/**
 * Outside production, return the snapshot as a Headers subclass that warns when
 * code tries to change the outgoing response through it. Its contents and
 * behavior are identical to the production snapshot.
 */
function toResponseHeadersSnapshot(headers: Headers): ReadonlyResponseHeaders {
  if (process.env.NODE_ENV === 'production') {
    return headers as ReadonlyResponseHeaders
  }
  SnapshotHeaders ??= class ResponseHeadersSnapshot extends Headers {
    override append(name: string, value: string): void {
      warnSnapshotMutation('append')
      super.append(name, value)
    }
    override delete(name: string): void {
      warnSnapshotMutation('delete')
      super.delete(name)
    }
    override set(name: string, value: string): void {
      warnSnapshotMutation('set')
      super.set(name, value)
    }
  }
  // The constructor fills entries without calling the overridden methods.
  const entries: Array<[string, string]> = []
  for (const [name, value] of headers) {
    if (name !== 'set-cookie') {
      entries.push([name, value])
    }
  }
  for (const cookie of getSetCookieValues(headers)) {
    entries.push(['set-cookie', cookie])
  }
  return new SnapshotHeaders(entries) as ReadonlyResponseHeaders
}

function warnSnapshotMutation(method: string): void {
  console.warn(
    `getResponseHeaders().${method}() does not change the response: getResponseHeaders() returns a read-only snapshot. Use setResponseHeader, appendResponseHeader, removeResponseHeader, clearResponseHeaders, or setCookie instead.`,
  )
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
    return toResponseHeadersSnapshot(
      state ? new Headers(state.headers) : new Headers(),
    )
  }
  const protectedHeaders = getProtectedResponseHeaders(currentResponse)
  let headers = currentResponse.headers
  if (state) {
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
    headers = new Headers(headers)
  }
  if (protectedHeaders) {
    applyProtectedHeaders(protectedHeaders, headers)
  }
  return toResponseHeadersSnapshot(headers)
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
 * (name + domain + path), exactly like `setCookie`. A value that cannot be
 * parsed is identified by its exact string. This is the primitive to
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
  const currentResponse = event.currentResponse
  const serialized =
    !!currentResponse &&
    isSerializedResponse(getProtectedResponseHeaders(currentResponse))
  return (
    getHelperStatus(event.responseState, serialized) ??
    currentResponse?.status ??
    200
  )
}

export function setResponseStatus(code?: number, text?: string): void {
  const event = getStartEvent()
  if (code !== undefined) {
    // An unusable code must not replace an earlier, returned, or error status.
    // Ignore the whole call, including its status text, which describes it.
    const status = sanitizeStatusCode(code)
    if (status === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `setResponseStatus(${code}) was ignored: Fetch Response status codes must be integers from 200 to 599.`,
        )
      }
      return
    }
    getResponseState(event).status = status
  }
  if (text) {
    getResponseState(event).statusText = sanitizeStatusMessage(text)
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
 * Internal: helper status state for a serialized server-function reply.
 * Bodyless statuses never apply to it and are omitted with their status text.
 */
export function getSerializedResponseState(): {
  status: number | undefined
  statusText: string | undefined
} {
  const state = getStartEvent().responseState
  const status = getHelperStatus(state, true)
  return { status, statusText: getHelperStatusText(state, status) }
}
