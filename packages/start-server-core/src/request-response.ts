import { AsyncLocalStorage } from 'node:async_hooks'

import {
  H3Event,
  clearSession as h3_clearSession,
  deleteCookie as h3_deleteCookie,
  getRequestHost as h3_getRequestHost,
  getRequestIP as h3_getRequestIP,
  getRequestProtocol as h3_getRequestProtocol,
  getRequestURL as h3_getRequestURL,
  getSession as h3_getSession,
  getValidatedQuery as h3_getValidatedQuery,
  parseCookies as h3_parseCookies,
  sanitizeStatusCode as h3_sanitizeStatusCode,
  sanitizeStatusMessage as h3_sanitizeStatusMessage,
  sealSession as h3_sealSession,
  setCookie as h3_setCookie,
  toResponse as h3_toResponse,
  unsealSession as h3_unsealSession,
  updateSession as h3_updateSession,
  useSession as h3_useSession,
} from 'h3'
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
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RequestHandler } from './request-handler'

interface StartEvent {
  h3Event: H3Event
}
const eventStorage = new AsyncLocalStorage<StartEvent>()

export type { ResponseHeaderName, RequestHeaderName }

export function requestHandler<TRegister = unknown>(
  handler: RequestHandler<TRegister>,
) {
  return (request: Request, requestOpts: any): Promise<Response> | Response => {
    const h3Event = new H3Event(request)

    const response = eventStorage.run({ h3Event }, () =>
      handler(request, requestOpts),
    )
    return h3_toResponse(response, h3Event)
  }
}

function getH3Event() {
  const event = eventStorage.getStore()
  if (!event) {
    throw new Error(
      `No StartEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`,
    )
  }
  return event.h3Event
}

export function getRequest(): Request {
  const event = getH3Event()
  return event.req
}

export function getRequestHeaders(): TypedHeaders<RequestHeaderMap> {
  // TODO `as any` not needed when fetchdts is updated
  return getH3Event().req.headers as any
}

export function getRequestHeader(name: RequestHeaderName): string | undefined {
  return getRequestHeaders().get(name) || undefined
}

export function getRequestIP(opts?: {
  /**
   * Use the X-Forwarded-For HTTP header set by proxies.
   *
   * Note: Make sure that this header can be trusted (your application running behind a CDN or reverse proxy) before enabling.
   */
  xForwardedFor?: boolean
}) {
  return h3_getRequestIP(getH3Event(), opts)
}

/**
 * Get the request hostname.
 *
 * If `xForwardedHost` is `true`, it will use the `x-forwarded-host` header if it exists.
 *
 * If no host header is found, it will default to "localhost".
 */
export function getRequestHost(opts?: { xForwardedHost?: boolean }) {
  return h3_getRequestHost(getH3Event(), opts)
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
  return h3_getRequestURL(getH3Event(), opts)
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
  return h3_getRequestProtocol(getH3Event(), opts)
}

export function setResponseHeaders(
  headers: TypedHeaders<ResponseHeaderMap>,
): void {
  const event = getH3Event()
  for (const [name, value] of Object.entries(headers)) {
    event.res.headers.set(name, value)
  }
}

export function getResponseHeaders(): TypedHeaders<ResponseHeaderMap> {
  const event = getH3Event()
  return Object.fromEntries(event.res.headers.entries()) as any
}

export function getResponseHeader(
  name: ResponseHeaderName,
): string | undefined {
  const event = getH3Event()
  return event.res.headers.get(name) || undefined
}

export function setResponseHeader(
  name: ResponseHeaderName,
  value: string | Array<string>,
): void {
  const event = getH3Event()
  if (Array.isArray(value)) {
    event.res.headers.delete(name)
    for (const valueItem of value) {
      event.res.headers.append(name, valueItem)
    }
  } else {
    event.res.headers.set(name, value)
  }
}
export function removeResponseHeader(name: ResponseHeaderName): void {
  const event = getH3Event()
  event.res.headers.delete(name)
}

export function clearResponseHeaders(
  headerNames?: Array<ResponseHeaderName>,
): void {
  const event = getH3Event()
  // If headerNames is provided, clear only those headers
  if (headerNames && headerNames.length > 0) {
    for (const name of headerNames) {
      event.res.headers.delete(name)
    }
    // Otherwise, clear all headers
  } else {
    for (const name of event.res.headers.keys()) {
      event.res.headers.delete(name)
    }
  }
}

export function getResponseStatus(): number {
  return getH3Event().res.status || 200
}

export function setResponseStatus(code?: number, text?: string): void {
  const event = getH3Event()
  if (code) {
    event.res.status = h3_sanitizeStatusCode(code, event.res.status)
  }
  if (text) {
    event.res.statusText = h3_sanitizeStatusMessage(text)
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
  const event = getH3Event()
  return h3_parseCookies(event)
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
  return getCookies()[name] || undefined
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
  const event = getH3Event()
  h3_setCookie(event, name, value, options)
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
  const event = getH3Event()
  h3_deleteCookie(event, name, options)
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
  const event = getH3Event()
  return h3_useSession(event, getDefaultSessionConfig(config))
}
/**
 * Get the session for the current request
 */
export function getSession<TSessionData extends SessionData = SessionData>(
  config: SessionConfig,
): Promise<Session<TSessionData>> {
  const event = getH3Event()
  return h3_getSession(event, getDefaultSessionConfig(config))
}

/**
 * Update the session data for the current request.
 */
export function updateSession<TSessionData extends SessionData = SessionData>(
  config: SessionConfig,
  update?: SessionUpdate<TSessionData>,
): Promise<Session<TSessionData>> {
  const event = getH3Event()
  return h3_updateSession(event, getDefaultSessionConfig(config), update)
}

/**
 * Encrypt and sign the session data for the current request.
 */
export function sealSession(config: SessionConfig): Promise<string> {
  const event = getH3Event()
  return h3_sealSession(event, getDefaultSessionConfig(config))
}
/**
 * Decrypt and verify the session data for the current request.
 */
export function unsealSession(
  config: SessionConfig,
  sealed: string,
): Promise<Partial<Session>> {
  const event = getH3Event()
  return h3_unsealSession(event, getDefaultSessionConfig(config), sealed)
}

/**
 * Clear the session data for the current request.
 */
export function clearSession(config: Partial<SessionConfig>): Promise<void> {
  const event = getH3Event()
  return h3_clearSession(event, { name: 'start', ...config })
}

// not public API
export function getResponse() {
  const event = getH3Event()
  return event._res
}

// not public API (yet)
export function getValidatedQuery<TSchema extends StandardSchemaV1>(
  schema: StandardSchemaV1,
): Promise<StandardSchemaV1.InferOutput<TSchema>> {
  return h3_getValidatedQuery(getH3Event(), schema)
}
