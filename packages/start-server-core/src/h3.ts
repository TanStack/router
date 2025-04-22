import { AsyncLocalStorage } from 'node:async_hooks'
import {
  H3Event,
  appendCorsHeaders as _appendCorsHeaders,
  appendCorsPreflightHeaders as _appendCorsPreflightHeaders,
  appendHeader as _appendHeader,
  appendHeaders as _appendHeaders,
  appendResponseHeader as _appendResponseHeader,
  appendResponseHeaders as _appendResponseHeaders,
  assertMethod as _assertMethod,
  clearResponseHeaders as _clearResponseHeaders,
  clearSession as _clearSession,
  defaultContentType as _defaultContentType,
  defineEventHandler as _defineEventHandler,
  deleteCookie as _deleteCookie,
  eventHandler as _eventHandler,
  fetchWithEvent as _fetchWithEvent,
  getCookie as _getCookie,
  getHeader as _getHeader,
  getHeaders as _getHeaders,
  getProxyRequestHeaders as _getProxyRequestHeaders,
  getQuery as _getQuery,
  getRequestFingerprint as _getRequestFingerprint,
  getRequestHeader as _getRequestHeader,
  getRequestHeaders as _getRequestHeaders,
  getRequestHost as _getRequestHost,
  getRequestIP as _getRequestIP,
  getRequestProtocol as _getRequestProtocol,
  getRequestURL as _getRequestURL,
  getRequestWebStream as _getRequestWebStream,
  getResponseHeader as _getResponseHeader,
  getResponseHeaders as _getResponseHeaders,
  getResponseStatus as _getResponseStatus,
  getResponseStatusText as _getResponseStatusText,
  getRouterParam as _getRouterParam,
  getRouterParams as _getRouterParams,
  getSession as _getSession,
  getValidatedQuery as _getValidatedQuery,
  getValidatedRouterParams as _getValidatedRouterParams,
  handleCacheHeaders as _handleCacheHeaders,
  handleCors as _handleCors,
  isMethod as _isMethod,
  isPreflightRequest as _isPreflightRequest,
  parseCookies as _parseCookies,
  proxyRequest as _proxyRequest,
  readBody as _readBody,
  readFormData as _readFormData,
  readMultipartFormData as _readMultipartFormData,
  readRawBody as _readRawBody,
  readValidatedBody as _readValidatedBody,
  removeResponseHeader as _removeResponseHeader,
  sealSession as _sealSession,
  send as _send,
  sendError as _sendError,
  sendNoContent as _sendNoContent,
  sendProxy as _sendProxy,
  sendRedirect as _sendRedirect,
  sendStream as _sendStream,
  sendWebResponse as _sendWebResponse,
  setCookie as _setCookie,
  setHeader as _setHeader,
  setHeaders as _setHeaders,
  setResponseHeader as _setResponseHeader,
  setResponseHeaders as _setResponseHeaders,
  setResponseStatus as _setResponseStatus,
  toWebRequest as _toWebRequest,
  unsealSession as _unsealSession,
  updateSession as _updateSession,
  useSession as _useSession,
  writeEarlyHints as _writeEarlyHints,
} from 'h3'

import type {
  Encoding,
  EventHandler,
  HTTPHeaderName,
  InferEventInput,
  _RequestMiddleware,
  _ResponseMiddleware,
} from 'h3'

const eventStorage = new AsyncLocalStorage()

function _setContext(event: H3Event, key: string, value: any) {
  event.context[key] = value
}

function _getContext(event: H3Event, key: string) {
  return event.context[key]
}

export function defineMiddleware(options: {
  onRequest?: _RequestMiddleware | Array<_RequestMiddleware>
  onBeforeResponse?: _ResponseMiddleware | Array<_ResponseMiddleware>
}) {
  return options
}

// function toWebRequestH3(event: H3Event) {
//   /**
//    * @type {ReadableStream | undefined}
//    */
//   let readableStream: ReadableStream | undefined

//   const url = _getRequestURL(event)
//   const base = {
//     // @ts-ignore Undici option
//     duplex: 'half',
//     method: event.method,
//     headers: event.headers,
//   }

//   if ((event.node.req as any).body instanceof ArrayBuffer) {
//     return new Request(url, {
//       ...base,
//       body: (event.node.req as any).body,
//     })
//   }

//   return new Request(url, {
//     ...base,
//     get body() {
//       if (readableStream) {
//         return readableStream
//       }
//       readableStream = _getRequestWebStream(event)
//       return readableStream
//     },
//   })
// }

export {
  H3Error,
  H3Event,
  MIMES,
  callNodeListener,
  createApp,
  createAppEventHandler,
  createEvent,
  createRouter,
  defineLazyEventHandler,
  defineNodeListener,
  defineNodeMiddleware,
  defineRequestMiddleware,
  defineResponseMiddleware,
  dynamicEventHandler,
  defineWebSocket,
  splitCookiesString,
  fromNodeMiddleware,
  fromPlainHandler,
  fromWebHandler,
  isError,
  isEventHandler,
  isWebResponse,
  lazyEventHandler,
  promisifyNodeListener,
  serveStatic,
  toEventHandler,
  toNodeListener,
  toPlainHandler,
  toWebHandler,
  toWebRequest,
  isCorsOriginAllowed,
  isStream,
  createError,
  sanitizeStatusCode,
  sanitizeStatusMessage,
  useBase,
  type AddRouteShortcuts,
  type App,
  type AppOptions,
  type AppUse,
  type CacheConditions,
  type CreateRouterOptions,
  type Duplex,
  type DynamicEventHandler,
  type Encoding,
  type EventHandler,
  type EventHandlerObject,
  type EventHandlerRequest,
  type EventHandlerResponse,
  type H3CorsOptions,
  type H3EventContext,
  type HTTPHeaderName,
  type HTTPMethod,
  type InferEventInput,
  type InputLayer,
  type InputStack,
  type Layer,
  type LazyEventHandler,
  type Matcher,
  type MultiPartData,
  type NodeEventContext,
  type NodeListener,
  type NodeMiddleware,
  type NodePromisifiedHandler,
  type PlainHandler,
  type PlainRequest,
  type PlainResponse,
  type ProxyOptions,
  type RequestFingerprintOptions,
  type RequestHeaders,
  type RouteNode,
  type Router,
  type RouterMethod,
  type RouterUse,
  type ServeStaticOptions,
  type Session,
  type SessionConfig,
  type SessionData,
  type Stack,
  type StaticAssetMeta,
  type ValidateFunction,
  type ValidateResult,
  type WebEventContext,
  type WebHandler,
  type _RequestMiddleware,
  type _ResponseMiddleware,
} from 'h3'

export function defineEventHandler(handler: EventHandler) {
  return _defineEventHandler((event) => {
    return runWithEvent(event, () => handler(event))
  })
}

export function eventHandler(handler: EventHandler) {
  return _eventHandler((event) => {
    return runWithEvent(event, () => handler(event))
  })
}

export async function runWithEvent<T>(
  event: H3Event,
  fn: () => T | Promise<T>,
): Promise<T> {
  return eventStorage.run(event, fn)
}

export function getEvent() {
  const event = eventStorage.getStore() as H3Event | undefined
  if (!event) {
    throw new Error(
      `No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`,
    )
  }
  return event
}

export const HTTPEventSymbol = Symbol('$HTTPEvent')

export function isEvent(
  obj: any,
): obj is H3Event | { [HTTPEventSymbol]: H3Event } {
  return (
    typeof obj === 'object' &&
    (obj instanceof H3Event ||
      obj?.[HTTPEventSymbol] instanceof H3Event ||
      obj?.__is_event__ === true)
  )
  // Implement logic to check if obj is an H3Event
}

type Tail<T> = T extends [any, ...infer U] ? U : never

type PrependOverload<
  TOriginal extends (...args: Array<any>) => any,
  TOverload extends (...args: Array<any>) => any,
> = TOverload & TOriginal

// add an overload to the function without the event argument
type WrapFunction<TFn extends (...args: Array<any>) => any> = PrependOverload<
  TFn,
  (
    ...args: Parameters<TFn> extends [H3Event, ...infer TArgs]
      ? TArgs
      : Parameters<TFn>
  ) => ReturnType<TFn>
>

function createWrapperFunction<TFn extends (...args: Array<any>) => any>(
  h3Function: TFn,
): WrapFunction<TFn> {
  return function (...args: Array<any>) {
    const event = args[0]
    if (!isEvent(event)) {
      args.unshift(getEvent())
    } else {
      args[0] =
        event instanceof H3Event || (event as any).__is_event__
          ? event
          : event[HTTPEventSymbol]
    }

    return (h3Function as any)(...args)
  } as any
}

// Creating wrappers for each utility and exporting them with their original names
type WrappedReadRawBody = <TEncoding extends Encoding = 'utf8'>(
  ...args: Tail<Parameters<typeof _readRawBody<TEncoding>>>
) => ReturnType<typeof _readRawBody<TEncoding>>
export const readRawBody: PrependOverload<
  typeof _readRawBody,
  WrappedReadRawBody
> = createWrapperFunction(_readRawBody)
type WrappedReadBody = <T, TEventInput = InferEventInput<'body', H3Event, T>>(
  ...args: Tail<Parameters<typeof _readBody<T, H3Event, TEventInput>>>
) => ReturnType<typeof _readBody<T, H3Event, TEventInput>>
export const readBody: PrependOverload<typeof _readBody, WrappedReadBody> =
  createWrapperFunction(_readBody)
type WrappedGetQuery = <
  T,
  TEventInput = Exclude<InferEventInput<'query', H3Event, T>, undefined>,
>(
  ...args: Tail<Parameters<typeof _getQuery<T, H3Event, TEventInput>>>
) => ReturnType<typeof _getQuery<T, H3Event, TEventInput>>
export const getQuery: PrependOverload<typeof _getQuery, WrappedGetQuery> =
  createWrapperFunction(_getQuery)
export const isMethod = createWrapperFunction(_isMethod)
export const isPreflightRequest = createWrapperFunction(_isPreflightRequest)
type WrappedGetValidatedQuery = <
  T,
  TEventInput = InferEventInput<'query', H3Event, T>,
>(
  ...args: Tail<Parameters<typeof _getValidatedQuery<T, H3Event, TEventInput>>>
) => ReturnType<typeof _getValidatedQuery<T, H3Event, TEventInput>>
export const getValidatedQuery: PrependOverload<
  typeof _getValidatedQuery,
  WrappedGetValidatedQuery
> = createWrapperFunction(_getValidatedQuery)
export const getRouterParams = createWrapperFunction(_getRouterParams)
export const getRouterParam = createWrapperFunction(_getRouterParam)
type WrappedGetValidatedRouterParams = <
  T,
  TEventInput = InferEventInput<'routerParams', H3Event, T>,
>(
  ...args: Tail<
    Parameters<typeof _getValidatedRouterParams<T, H3Event, TEventInput>>
  >
) => ReturnType<typeof _getValidatedRouterParams<T, H3Event, TEventInput>>
export const getValidatedRouterParams: PrependOverload<
  typeof _getValidatedRouterParams,
  WrappedGetValidatedRouterParams
> = createWrapperFunction(_getValidatedRouterParams)
export const assertMethod = createWrapperFunction(_assertMethod)
export const getRequestHeaders = createWrapperFunction(_getRequestHeaders)
export const getRequestHeader = createWrapperFunction(_getRequestHeader)
export const getRequestURL = createWrapperFunction(_getRequestURL)
export const getRequestHost = createWrapperFunction(_getRequestHost)
export const getRequestProtocol = createWrapperFunction(_getRequestProtocol)
export const getRequestIP = createWrapperFunction(_getRequestIP)
export const send = createWrapperFunction(_send)
export const sendNoContent = createWrapperFunction(_sendNoContent)
export const setResponseStatus = createWrapperFunction(_setResponseStatus)
export const getResponseStatus = createWrapperFunction(_getResponseStatus)
export const getResponseStatusText = createWrapperFunction(
  _getResponseStatusText,
)
export const getResponseHeaders = createWrapperFunction(_getResponseHeaders)
export const getResponseHeader = createWrapperFunction(_getResponseHeader)
export const setResponseHeaders = createWrapperFunction(_setResponseHeaders)
type WrappedSetResponseHeader = <T extends HTTPHeaderName>(
  ...args: Tail<Parameters<typeof _setResponseHeader<T>>>
) => ReturnType<typeof _setResponseHeader<T>>
export const setResponseHeader: PrependOverload<
  typeof _setResponseHeader,
  WrappedSetResponseHeader
> = createWrapperFunction(_setResponseHeader)
export const appendResponseHeaders = createWrapperFunction(
  _appendResponseHeaders,
)
type WrappedAppendResponseHeader = <T extends HTTPHeaderName>(
  ...args: Tail<Parameters<typeof _appendResponseHeader<T>>>
) => ReturnType<typeof _appendResponseHeader<T>>
export const appendResponseHeader: PrependOverload<
  typeof _appendResponseHeader,
  WrappedAppendResponseHeader
> = createWrapperFunction(_appendResponseHeader)
export const defaultContentType = createWrapperFunction(_defaultContentType)
export const sendRedirect = createWrapperFunction(_sendRedirect)
export const sendStream = createWrapperFunction(_sendStream)
export const writeEarlyHints = createWrapperFunction(_writeEarlyHints)
export const sendError = createWrapperFunction(_sendError)
export const sendProxy = createWrapperFunction(_sendProxy)
export const proxyRequest = createWrapperFunction(_proxyRequest)
type WrappedFetchWithEvent = <
  T = unknown,
  TResponse = any,
  TFetch extends (req: RequestInfo | URL, opts?: any) => any = typeof fetch,
>(
  ...args: Tail<Parameters<typeof _fetchWithEvent<T, TResponse, TFetch>>>
) => ReturnType<typeof _fetchWithEvent<T, TResponse, TFetch>>
export const fetchWithEvent: PrependOverload<
  typeof _fetchWithEvent,
  WrappedFetchWithEvent
> = createWrapperFunction(_fetchWithEvent)
export const getProxyRequestHeaders = createWrapperFunction(
  _getProxyRequestHeaders,
)

export const parseCookies = createWrapperFunction(_parseCookies)
export const getCookie = createWrapperFunction(_getCookie)
export const setCookie = createWrapperFunction(_setCookie)
export const deleteCookie = createWrapperFunction(_deleteCookie)
// not exported :(
type SessionDataT = Record<string, any>
type WrappedUseSession = <T extends SessionDataT>(
  ...args: Tail<Parameters<typeof _useSession<T>>>
) => ReturnType<typeof _useSession<T>>
// we need to `as` these because the WrapFunction doesn't work for them
// because they also accept CompatEvent instead of H3Event
export const useSession = createWrapperFunction(_useSession) as PrependOverload<
  typeof _useSession,
  WrappedUseSession
>
type WrappedGetSession = <T extends SessionDataT>(
  ...args: Tail<Parameters<typeof _getSession<T>>>
) => ReturnType<typeof _getSession<T>>
export const getSession = createWrapperFunction(_getSession) as PrependOverload<
  typeof _getSession,
  WrappedGetSession
>
type WrappedUpdateSession = <T extends SessionDataT>(
  ...args: Tail<Parameters<typeof _updateSession<T>>>
) => ReturnType<typeof _updateSession<T>>
export const updateSession: PrependOverload<
  typeof _updateSession,
  WrappedUpdateSession
> = createWrapperFunction(_updateSession)
type WrappedSealSession = <T extends SessionDataT>(
  ...args: Tail<Parameters<typeof _sealSession<T>>>
) => ReturnType<typeof _sealSession<T>>
export const sealSession = createWrapperFunction(
  _sealSession,
) as PrependOverload<typeof _sealSession, WrappedSealSession>
export const unsealSession = createWrapperFunction(_unsealSession)
export const clearSession = createWrapperFunction(_clearSession)
export const handleCacheHeaders = createWrapperFunction(_handleCacheHeaders)
export const handleCors = createWrapperFunction(_handleCors)
export const appendCorsHeaders = createWrapperFunction(_appendCorsHeaders)
export const appendCorsPreflightHeaders = createWrapperFunction(
  _appendCorsPreflightHeaders,
)
export const sendWebResponse = createWrapperFunction(_sendWebResponse)
type WrappedAppendHeader = <T extends HTTPHeaderName>(
  ...args: Tail<Parameters<typeof _appendHeader<T>>>
) => ReturnType<typeof _appendHeader<T>>
export const appendHeader: PrependOverload<
  typeof _appendHeader,
  WrappedAppendHeader
> = createWrapperFunction(_appendHeader)
export const appendHeaders = createWrapperFunction(_appendHeaders)
type WrappedSetHeader = <T extends HTTPHeaderName>(
  ...args: Tail<Parameters<typeof _setHeader<T>>>
) => ReturnType<typeof _setHeader<T>>
export const setHeader: PrependOverload<typeof _setHeader, WrappedSetHeader> =
  createWrapperFunction(_setHeader)
export const setHeaders = createWrapperFunction(_setHeaders)
export const getHeader = createWrapperFunction(_getHeader)
export const getHeaders = createWrapperFunction(_getHeaders)
export const getRequestFingerprint = createWrapperFunction(
  _getRequestFingerprint,
)
export const getRequestWebStream = createWrapperFunction(_getRequestWebStream)
export const readFormData = createWrapperFunction(_readFormData)
export const readMultipartFormData = createWrapperFunction(
  _readMultipartFormData,
)
type WrappedReadValidatedBody = <
  T,
  TEventInput = InferEventInput<'body', H3Event, T>,
>(
  ...args: Tail<Parameters<typeof _readValidatedBody<T, H3Event, TEventInput>>>
) => ReturnType<typeof _readValidatedBody<T, H3Event, TEventInput>>
export const readValidatedBody: PrependOverload<
  typeof _readValidatedBody,
  WrappedReadValidatedBody
> = createWrapperFunction(_readValidatedBody)
export const removeResponseHeader = createWrapperFunction(_removeResponseHeader)
export const getContext = createWrapperFunction(_getContext)
export const setContext = createWrapperFunction(_setContext)
export const clearResponseHeaders = createWrapperFunction(_clearResponseHeaders)
export const getWebRequest = createWrapperFunction(_toWebRequest)

export type RequestHandler = (ctx: {
  request: Request
}) => Promise<Response> | Response

export function requestHandler(handler: RequestHandler) {
  return handler
}
