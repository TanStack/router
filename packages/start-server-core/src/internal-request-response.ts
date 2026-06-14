import { AsyncLocalStorage } from 'node:async_hooks'

import {
  H3Event,
  clearSession as h3_clearSession,
  getSession as h3_getSession,
  sealSession as h3_sealSession,
  unsealSession as h3_unsealSession,
  updateSession as h3_updateSession,
  useSession as h3_useSession,
} from 'h3-v2'
import { parseCookie, parseSetCookie, serializeCookie } from 'cookie-es'
import { cloneHeaders, copyHeaders, getSetCookieValues } from './headers'
import type {
  RequestHeaderMap,
  RequestHeaderName,
  ResponseHeaderMap,
  ResponseHeaderName,
  TypedHeaders,
} from 'fetchdts'

import type { CookieSerializeOptions } from 'cookie-es'
import type {
  Session,
  SessionConfig,
  SessionData,
  SessionManager,
  SessionUpdate,
} from './session'
import type { RequestHandler } from './request-handler'

interface StartEvent {
  request: Request
  requestUrl?: URL
  h3Event?: H3Event
  h3SessionQueue?: Promise<void>
  response: StartResponse
  responseMeta: ResponseMeta
}

interface StartResponse {
  status?: number
  statusText?: string
  headers: Headers
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

type ProtectedHeaders = Map<string, string | null>

type MaybePromise<T> = T | Promise<T>

interface ResponseMeta {
  currentResponse?: Response
  removedHeaders?: Set<string>
  clearHeaders: boolean
  settingCookie: boolean
  setCookieBehavior?: 'merge' | 'replace'
}

const protectedResponseHeaders = new WeakMap<Response, ProtectedHeaders>()
const startErrorEvents = new WeakMap<object, StartEvent>()

function normalizeHeaderName(name: string): string {
  return name.toLowerCase()
}

function sanitizeStatusMessage(statusMessage = ''): string {
  let sanitized = ''
  for (const char of statusMessage) {
    const code = char.charCodeAt(0)
    if (code === 0x09 || (code >= 0x20 && code <= 0x7e)) {
      sanitized += char
    }
  }
  return sanitized
}

function sanitizeStatusCode(
  statusCode: string | number | undefined,
  defaultStatusCode: number | undefined = 200,
): number {
  const fallbackStatusCode = defaultStatusCode
  if (!statusCode) {
    return fallbackStatusCode
  }
  const code = typeof statusCode === 'string' ? Number(statusCode) : statusCode
  if (!Number.isInteger(code) || code < 200 || code > 599) {
    return fallbackStatusCode
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

function getRemovedHeaders(meta: ResponseMeta): Set<string> {
  return (meta.removedHeaders ||= new Set())
}

function markHeaderSet(meta: ResponseMeta, name: string): void {
  const normalizedName = normalizeHeaderName(name)
  meta.removedHeaders?.delete(normalizedName)
  if (normalizedName === 'set-cookie' && meta.setCookieBehavior !== 'replace') {
    meta.setCookieBehavior = 'merge'
  }
}

function markHeaderDeleted(meta: ResponseMeta, name: string): void {
  const normalizedName = normalizeHeaderName(name)
  getRemovedHeaders(meta).add(normalizedName)
  if (normalizedName === 'set-cookie' && !meta.settingCookie) {
    meta.setCookieBehavior = 'replace'
  }
}

function trackResponseHeaders(headers: Headers, meta: ResponseMeta): void {
  const set = headers.set.bind(headers)
  const append = headers.append.bind(headers)
  const del = headers.delete.bind(headers)

  headers.set = (name, value) => {
    if (normalizeHeaderName(name) === 'set-cookie') {
      meta.setCookieBehavior = 'replace'
    }
    markHeaderSet(meta, name)
    return set(name, value)
  }

  headers.append = (name, value) => {
    markHeaderSet(meta, name)
    return append(name, value)
  }

  headers.delete = (name) => {
    markHeaderDeleted(meta, name)
    return del(name)
  }
}

function trackStartResponse(response: StartResponse, meta: ResponseMeta): void {
  let status = response.status
  let statusText = response.statusText

  Object.defineProperties(response, {
    status: {
      configurable: true,
      enumerable: true,
      get() {
        return status
      },
      set(value: number | undefined) {
        status =
          value === undefined ? undefined : sanitizeStatusCode(value, status)
      },
    },
    statusText: {
      configurable: true,
      enumerable: true,
      get() {
        return statusText
      },
      set(value: string | undefined) {
        statusText =
          value === undefined ? undefined : sanitizeStatusMessage(value)
      },
    },
  })

  trackResponseHeaders(response.headers, meta)
}

function createResponseMeta(): ResponseMeta {
  return {
    clearHeaders: false,
    settingCookie: false,
  }
}

function createStartResponse(): StartResponse {
  return {
    headers: new Headers(),
  }
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function'
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

function mergeSetCookieValues(
  headers: Headers,
  cookiesToMerge: Array<string>,
): void {
  if (cookiesToMerge.length === 0) {
    return
  }

  const cookieKeysToMerge = new Set(
    cookiesToMerge.map(getDistinctCookieKeyFromHeader).filter(Boolean),
  )
  const currentCookies = getSetCookieValues(headers).filter((cookie) => {
    const cookieKey = getDistinctCookieKeyFromHeader(cookie)
    return !cookieKey || !cookieKeysToMerge.has(cookieKey)
  })
  replaceSetCookieValues(headers, currentCookies)
  for (const cookie of cookiesToMerge) {
    headers.append('set-cookie', cookie)
  }
}

function hasProtectedHeaderChanges(
  response: Response,
  protectedHeaders?: ProtectedHeaders,
): boolean {
  if (!protectedHeaders) {
    return false
  }

  for (const [name, value] of protectedHeaders) {
    if (response.headers.get(name) !== value) {
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
  eventHeaders: Headers,
  meta: ResponseMeta,
  protectedHeaders?: ProtectedHeaders,
): void {
  if (meta.clearHeaders) {
    for (const name of Array.from(target.keys())) {
      if (!protectedHeaders?.has(name)) {
        target.delete(name)
      }
    }
  }

  if (!meta.clearHeaders && meta.removedHeaders) {
    for (const name of meta.removedHeaders) {
      if (!protectedHeaders?.has(name)) {
        target.delete(name)
      }
    }
  }

  for (const [name, value] of eventHeaders) {
    if (name !== 'set-cookie' && !protectedHeaders?.has(name)) {
      target.set(name, value)
    }
  }

  if (meta.setCookieBehavior && !protectedHeaders?.has('set-cookie')) {
    const eventSetCookies = getSetCookieValues(eventHeaders)
    if (meta.setCookieBehavior === 'replace') {
      replaceSetCookieValues(target, eventSetCookies)
    } else {
      mergeSetCookieValues(target, eventSetCookies)
    }
  }
}

function hasHeaders(headers: Headers): boolean {
  return !headers.keys().next().done
}

function hasHeaderState(headers: Headers, meta: ResponseMeta): boolean {
  return (
    meta.clearHeaders ||
    !!meta.removedHeaders?.size ||
    !!meta.setCookieBehavior ||
    hasHeaders(headers)
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

function cancelDroppedBody(response: Response): void {
  try {
    response.body
      ?.cancel('Response body dropped by Start reconciliation')
      .catch(() => {})
  } catch {
    // Ignore locked or already-consumed bodies.
  }
}

function createReconciledResponse(
  response: Response,
  event: StartEvent,
  status: number,
  statusText: string,
  headers: Headers,
): Response {
  const shouldKeepBody = canHaveBody(event.request.method, status)
  if (!shouldKeepBody) {
    cancelDroppedBody(response)
  }
  const body = shouldKeepBody ? response.body : null

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

function reconcileResponseWithEvent(response: Response, event: StartEvent) {
  const { response: eventResponse, responseMeta } = event
  const status = eventResponse.status ?? response.status
  const statusText = eventResponse.statusText ?? response.statusText
  const statusChanged = status !== response.status
  const statusTextChanged = statusText !== response.statusText
  const mustDropBody =
    response.body !== null && !canHaveBody(event.request.method, status)
  const headersChanged = hasHeaderState(eventResponse.headers, responseMeta)
  const protectedHeaders = protectedResponseHeaders.get(response)
  const protectedHeadersChanged = hasProtectedHeaderChanges(
    response,
    protectedHeaders,
  )

  if (
    !statusChanged &&
    !statusTextChanged &&
    !mustDropBody &&
    !headersChanged &&
    !protectedHeadersChanged
  ) {
    responseMeta.currentResponse = response
    return response
  }

  if (!statusChanged && !statusTextChanged && !mustDropBody) {
    try {
      if (headersChanged) {
        applyHeaderState(
          response.headers,
          eventResponse.headers,
          responseMeta,
          protectedHeaders,
        )
      }
      if (protectedHeadersChanged) {
        applyProtectedHeaders(protectedHeaders, response.headers)
      }
      responseMeta.currentResponse = response
      return response
    } catch {
      // Readonly response headers require cloning below.
    }
  }

  const headers = cloneHeaders(response.headers)
  if (headersChanged) {
    applyHeaderState(
      headers,
      eventResponse.headers,
      responseMeta,
      protectedHeaders,
    )
  }
  if (protectedHeadersChanged) {
    applyProtectedHeaders(protectedHeaders, headers)
  }

  const reconciled = createReconciledResponse(
    response,
    event,
    status,
    statusText,
    headers,
  )
  if (protectedHeaders) {
    protectedResponseHeaders.set(reconciled, protectedHeaders)
  }
  responseMeta.currentResponse = reconciled
  return reconciled
}

function createErrorResponse(error: unknown, event: StartEvent): Response {
  const eventResponse = event.response
  const errorStatus = getErrorStatus(error)
  const status = eventResponse.status ?? errorStatus ?? 500
  const statusText = eventResponse.statusText ?? getErrorStatusText(error) ?? ''
  const body = canHaveBody(event.request.method, status)
    ? JSON.stringify({
        status,
        statusText,
        unhandled: true,
        message: 'HTTPError',
        data: undefined,
      })
    : null
  const headers = getErrorHeaders(error) ?? new Headers()

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (eventResponse.status === undefined && errorStatus === undefined) {
    console.error(error)
  }

  return new Response(body, {
    status,
    statusText,
    headers,
  })
}

function finalizeError(error: unknown, event: StartEvent): Response {
  if (error instanceof Response) {
    return reconcileResponseWithEvent(error, event)
  }
  return reconcileResponseWithEvent(createErrorResponse(error, event), event)
}

function rememberStartError(error: unknown, event: StartEvent): never {
  if ((typeof error === 'object' && error) || typeof error === 'function') {
    startErrorEvents.set(error, event)
    throw error
  }

  throw error
}

export function handleStartError(error: unknown): Response {
  let event = eventStorage.getStore()
  if (
    !event &&
    ((typeof error === 'object' && error) || typeof error === 'function')
  ) {
    event = startErrorEvents.get(error)
    startErrorEvents.delete(error)
  }
  if (event) {
    return finalizeError(error, event)
  }
  if (error instanceof Response) {
    return error
  }
  const response = createStartResponse()
  const responseMeta = createResponseMeta()
  trackStartResponse(response, responseMeta)
  // No request context exists for primitive errors, so this fallback cannot
  // recover the original method for HEAD/null-body handling.
  return createErrorResponse(error, {
    request: new Request('http://localhost'),
    response,
    responseMeta,
  })
}

export function reconcileResponse(response: Response): Response {
  const event = eventStorage.getStore()
  if (!event) {
    return response
  }
  return reconcileResponseWithEvent(response, event)
}

export function protectResponseHeaders(
  response: Response,
  headerNames: Array<string>,
): void {
  const protectedHeaders = protectedResponseHeaders.get(response) ?? new Map()
  for (const name of headerNames) {
    const normalizedName = normalizeHeaderName(name)
    if (normalizedName === 'set-cookie') {
      throw new Error('Set-Cookie headers cannot be protected.')
    }
    protectedHeaders.set(normalizedName, response.headers.get(normalizedName))
  }
  protectedResponseHeaders.set(response, protectedHeaders)
}

function setResponseHeaderOnResponse(
  response: Response,
  name: string,
  value: string,
): Response {
  try {
    response.headers.set(name, value)
    return response
  } catch {
    const headers = cloneHeaders(response.headers)
    headers.set(name, value)
    let nextResponse: Response
    try {
      nextResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (cause) {
      throw new Error(
        'Unable to set response header because the response body has already been consumed or locked.',
        { cause },
      )
    }
    const protectedHeaders = protectedResponseHeaders.get(response)
    if (protectedHeaders) {
      protectedResponseHeaders.set(nextResponse, protectedHeaders)
    }
    return nextResponse
  }
}

/**
 * Atomically sets a response header AND marks it as protected from
 * reconciliation overwrites.
 *
 * Ownership: the input `response` MUST NOT be referenced after this call.
 * When the input has immutable headers (e.g. an opaque fetched Response) the
 * helper clones it, transferring ownership of the body stream to the returned
 * Response — accessing the original body afterwards will throw "body locked".
 *
 * All code that needs to layer a header onto an arbitrary user Response should
 * go through this single chokepoint so the body-reuse hazard stays contained.
 */
export function setProtectedResponseHeader(
  response: Response,
  name: string,
  value: string,
): Response {
  const next = setResponseHeaderOnResponse(response, name, value)
  protectResponseHeaders(next, [name])
  return next
}

export function requestHandler<TRegister = unknown>(
  handler: RequestHandler<TRegister>,
) {
  return (request: Request, requestOpts: any): Promise<Response> | Response => {
    let requestUrl: URL
    try {
      requestUrl = new URL(request.url)
    } catch (error) {
      if (error instanceof URIError || error instanceof TypeError) {
        return new Response(null, {
          status: 400,
          statusText: 'Bad Request',
        })
      }
      throw error
    }

    const response = createStartResponse()
    const responseMeta = createResponseMeta()
    trackStartResponse(response, responseMeta)

    const startEvent = { request, requestUrl, response, responseMeta }
    return eventStorage.run(startEvent, () => {
      try {
        const response = handler(request, requestOpts)
        if (isPromiseLike(response)) {
          return response.then(
            (resolved) => reconcileResponseWithEvent(resolved, startEvent),
            (error) => {
              return rememberStartError(error, startEvent)
            },
          )
        }
        return reconcileResponseWithEvent(response, startEvent)
      } catch (error) {
        return rememberStartError(error, startEvent)
      }
    })
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

function getSessionH3Event(event: StartEvent): H3Event {
  return (event.h3Event ||= new H3Event(event.request))
}

function syncStartResponseToH3(event: StartEvent): H3Event {
  const h3Event = getSessionH3Event(event)
  h3Event.res.status = event.response.status
  h3Event.res.statusText = event.response.statusText
  copyHeaders(event.response.headers, h3Event.res.headers)
  return h3Event
}

function syncH3ResponseToStart(event: StartEvent): void {
  const h3Event = event.h3Event
  if (!h3Event) {
    return
  }

  if (h3Event.res.status !== undefined) {
    event.response.status = h3Event.res.status
  }
  if (h3Event.res.statusText !== undefined) {
    event.response.statusText = h3Event.res.statusText
  }

  for (const [name, value] of h3Event.res.headers) {
    if (name !== 'set-cookie') {
      event.response.headers.set(name, value)
    }
  }
  mergeStartSetCookieValues(event, getSetCookieValues(h3Event.res.headers))
}

function mergeStartSetCookieValues(
  event: StartEvent,
  cookies: Array<string>,
): void {
  if (cookies.length === 0) {
    return
  }

  const wasSettingCookie = event.responseMeta.settingCookie
  event.responseMeta.settingCookie = true
  if (event.responseMeta.setCookieBehavior !== 'replace') {
    event.responseMeta.setCookieBehavior = 'merge'
  }
  try {
    mergeSetCookieValues(event.response.headers, cookies)
  } finally {
    event.responseMeta.settingCookie = wasSettingCookie
  }
}

async function withH3SessionResponse<T>(
  event: StartEvent,
  fn: (h3Event: H3Event) => T | Promise<T>,
): Promise<T> {
  const previousSession = event.h3SessionQueue
  let releaseSession!: () => void
  event.h3SessionQueue = new Promise<void>((resolve) => {
    releaseSession = resolve
  })

  await previousSession

  let h3Event: H3Event | undefined
  try {
    h3Event = syncStartResponseToH3(event)
    return await fn(h3Event)
  } finally {
    try {
      if (h3Event) {
        syncH3ResponseToStart(event)
      }
    } finally {
      releaseSession()
    }
  }
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
    const forwardedIp = forwardedFor?.split(',')[0]?.trim()
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
 * If no host header is found, it will default to "localhost".
 */
export function getRequestHost(opts?: { xForwardedHost?: boolean }) {
  const headers = getRequestHeaders()
  if (opts?.xForwardedHost) {
    const forwardedHost = headers.get('x-forwarded-host')
    const host = forwardedHost?.split(',')[0]?.trim()
    if (host) {
      return host
    }
  }
  return headers.get('host') || 'localhost'
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
      ?.split(',')[0]
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
  headers: TypedHeaders<ResponseHeaderMap>,
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

export function getResponseHeaders(): TypedHeaders<ResponseHeaderMap> {
  const event = getStartEvent()
  const currentResponse = event.responseMeta.currentResponse
  if (!currentResponse) {
    return cloneHeaders(
      event.response.headers,
    ) as TypedHeaders<ResponseHeaderMap>
  }
  const protectedHeaders = protectedResponseHeaders.get(currentResponse)
  const headers = cloneHeaders(currentResponse.headers)
  if (hasHeaderState(event.response.headers, event.responseMeta)) {
    applyHeaderState(
      headers,
      event.response.headers,
      event.responseMeta,
      protectedHeaders,
    )
  }
  if (protectedHeaders) {
    applyProtectedHeaders(protectedHeaders, headers)
  }
  return headers as TypedHeaders<ResponseHeaderMap>
}

export function getResponseHeader(
  name: ResponseHeaderName,
): string | undefined {
  const event = getStartEvent()
  const normalizedName = normalizeHeaderName(name)
  const currentResponse = event.responseMeta.currentResponse
  const protectedHeaders = currentResponse
    ? protectedResponseHeaders.get(currentResponse)
    : undefined
  if (protectedHeaders?.has(normalizedName)) {
    return protectedHeaders.get(normalizedName) ?? undefined
  }

  const eventHeaders = event.response.headers
  const eventValue = eventHeaders.get(name)
  if (eventValue !== null) {
    return eventValue
  }

  if (event.responseMeta.clearHeaders) {
    return undefined
  }

  if (event.responseMeta.removedHeaders?.has(normalizedName)) {
    return undefined
  }

  return currentResponse?.headers.get(name) ?? undefined
}

export function setResponseHeader(
  name: ResponseHeaderName,
  value: string | Array<string>,
): void {
  const startEvent = getStartEvent()
  if (Array.isArray(value)) {
    startEvent.response.headers.delete(name)
    for (const valueItem of value) {
      startEvent.response.headers.append(name, valueItem)
    }
  } else {
    startEvent.response.headers.set(name, value)
  }
}
export function removeResponseHeader(name: ResponseHeaderName): void {
  const startEvent = getStartEvent()
  startEvent.response.headers.delete(name)
}

export function clearResponseHeaders(
  headerNames?: Array<ResponseHeaderName>,
): void {
  const event = getStartEvent()
  if (headerNames && headerNames.length > 0) {
    for (const name of headerNames) {
      event.response.headers.delete(name)
    }
    return
  }

  event.responseMeta.clearHeaders = true
  for (const name of Array.from(event.response.headers.keys())) {
    event.response.headers.delete(name)
  }
}

export function getResponseStatus(): number {
  return getStartEvent().response.status || 200
}

export function setResponseStatus(code?: number, text?: string): void {
  const event = getStartEvent().response
  if (code) {
    event.status = sanitizeStatusCode(code, event.status)
  }
  if (text) {
    event.statusText = sanitizeStatusMessage(text)
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

function getDefaultSessionConfig(config: SessionConfig): SessionConfig {
  return {
    name: 'start',
    ...config,
  }
}

/**
 * Create a session manager for the current request.
 */
export function useSession<TSessionData extends SessionData = SessionData>(
  config: SessionConfig,
): Promise<SessionManager<TSessionData>> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_useSession<TSessionData>(h3Event, getDefaultSessionConfig(config))
  }).then((manager) => {
    const wrappedManager: SessionManager<TSessionData> = {
      get id() {
        return manager.id
      },
      get data() {
        return manager.data
      },
      update: async (update) => {
        await withH3SessionResponse(event, () => manager.update(update))
        return wrappedManager
      },
      clear: async () => {
        await withH3SessionResponse(event, () => manager.clear())
        return wrappedManager
      },
    }
    return wrappedManager
  })
}
/**
 * Get the session for the current request
 */
export function getSession<TSessionData extends SessionData = SessionData>(
  config: SessionConfig,
): Promise<Session<TSessionData>> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_getSession<TSessionData>(h3Event, getDefaultSessionConfig(config))
  })
}

/**
 * Update the session data for the current request.
 */
export function updateSession<TSessionData extends SessionData = SessionData>(
  config: SessionConfig,
  update?: SessionUpdate<TSessionData>,
): Promise<Session<TSessionData>> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_updateSession<TSessionData>(
      h3Event,
      getDefaultSessionConfig(config),
      update,
    )
  })
}

/**
 * Encrypt and sign the session data for the current request.
 */
export function sealSession(config: SessionConfig): Promise<string> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_sealSession(h3Event, getDefaultSessionConfig(config))
  })
}
/**
 * Decrypt and verify the session data for the current request.
 */
export function unsealSession(
  config: SessionConfig,
  sealed: string,
): Promise<Partial<Session>> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_unsealSession(h3Event, getDefaultSessionConfig(config), sealed)
  })
}

/**
 * Clear the session data for the current request.
 */
export function clearSession(config: Partial<SessionConfig>): Promise<void> {
  const event = getStartEvent()
  return withH3SessionResponse(event, (h3Event) => {
    return h3_clearSession(h3Event, { name: 'start', ...config })
  })
}

export function getResponse() {
  return getStartEvent().response
}
