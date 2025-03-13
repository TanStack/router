import { test } from 'vitest'
import * as h3 from 'h3'
import * as h3Wrappers from '../src/h3'

interface Foo {
  a: string
}

type AnyFn = (...args: Array<any>) => any
type Satisfies<T extends TConstraint, TConstraint> = T
type Tail<T> = T extends [any, ...infer U] ? U : never
type PrependOverload<
  TOriginal extends (...args: Array<any>) => any,
  TOverload extends (...args: Array<any>) => any,
> = TOverload & TOriginal

type SharedKeys = keyof typeof h3Wrappers & keyof typeof h3
// things we're not wrapping
type KeysToIgnore = Satisfies<
  | 'H3Error'
  | 'H3Event'
  | 'MIMES'
  | 'callNodeListener'
  | 'createApp'
  | 'createAppEventHandler'
  | 'createError'
  | 'createEvent'
  | 'createRouter'
  | 'defineEventHandler'
  | 'defineLazyEventHandler'
  | 'defineNodeListener'
  | 'defineNodeMiddleware'
  | 'defineRequestMiddleware'
  | 'defineResponseMiddleware'
  | 'defineWebSocket'
  | 'dynamicEventHandler'
  | 'eventHandler'
  | 'fromNodeMiddleware'
  | 'fromPlainHandler'
  | 'fromWebHandler'
  | 'isCorsOriginAllowed'
  | 'isError'
  | 'isEvent'
  | 'isEventHandler'
  | 'isStream'
  | 'isWebResponse'
  | 'lazyEventHandler'
  | 'promisifyNodeListener'
  | 'sanitizeStatusCode'
  | 'sanitizeStatusMessage'
  | 'serveStatic'
  | 'splitCookiesString'
  | 'toEventHandler'
  | 'toNodeListener'
  | 'toPlainHandler'
  | 'toWebHandler'
  | 'toWebRequest'
  | 'useBase',
  SharedKeys
>

function expectWrappersToMatchH3<
  TFnMap extends Record<Exclude<SharedKeys, KeysToIgnore>, AnyFn>,
>(_map: {
  [K in keyof TFnMap]: {
    h3: TFnMap[K]
    tss: TFnMap[K] extends AnyFn
      ? PrependOverload<
          TFnMap[K],
          (...args: Tail<Parameters<TFnMap[K]>>) => ReturnType<TFnMap[K]>
        >
      : never
  }
}) {
  /* equivalent to the below for each key

  expectTypeOf<Parameters<typeof h3Function>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()
  expectTypeOf<Tail<Parameters<typeof h3Function>>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()

  expectTypeOf(tssFunction).returns.toEqualTypeOf<
    ReturnType<typeof h3Function>
  >()
    
  */
}

test('wrappers match original', () => {
  expectWrappersToMatchH3({
    readRawBody: {
      h3: h3.readRawBody<'hex'>,
      tss: h3Wrappers.readRawBody<'hex'>,
    },
    readBody: {
      h3: h3.readBody<Foo>,
      tss: h3Wrappers.readBody<Foo>,
    },
    getQuery: {
      h3: h3.getQuery<Foo>,
      tss: h3Wrappers.getQuery<Foo>,
    },
    isMethod: {
      h3: h3.isMethod,
      tss: h3Wrappers.isMethod,
    },
    isPreflightRequest: {
      h3: h3.isPreflightRequest,
      tss: h3Wrappers.isPreflightRequest,
    },
    getValidatedQuery: {
      h3: h3.getValidatedQuery<Foo>,
      tss: h3Wrappers.getValidatedQuery<Foo>,
    },
    getRouterParams: {
      h3: h3.getRouterParams,
      tss: h3Wrappers.getRouterParams,
    },
    getRouterParam: {
      h3: h3.getRouterParam,
      tss: h3Wrappers.getRouterParam,
    },
    getValidatedRouterParams: {
      h3: h3.getValidatedRouterParams<Foo>,
      tss: h3Wrappers.getValidatedRouterParams<Foo>,
    },
    assertMethod: {
      h3: h3.assertMethod,
      tss: h3Wrappers.assertMethod,
    },
    getRequestHeaders: {
      h3: h3.getRequestHeaders,
      tss: h3Wrappers.getRequestHeaders,
    },
    getRequestHeader: {
      h3: h3.getRequestHeader,
      tss: h3Wrappers.getRequestHeader,
    },
    getRequestURL: {
      h3: h3.getRequestURL,
      tss: h3Wrappers.getRequestURL,
    },
    getRequestHost: {
      h3: h3.getRequestHost,
      tss: h3Wrappers.getRequestHost,
    },
    getRequestProtocol: {
      h3: h3.getRequestProtocol,
      tss: h3Wrappers.getRequestProtocol,
    },
    getRequestIP: {
      h3: h3.getRequestIP,
      tss: h3Wrappers.getRequestIP,
    },
    send: {
      h3: h3.send,
      tss: h3Wrappers.send,
    },
    sendNoContent: {
      h3: h3.sendNoContent,
      tss: h3Wrappers.sendNoContent,
    },
    setResponseStatus: {
      h3: h3.setResponseStatus,
      tss: h3Wrappers.setResponseStatus,
    },
    getResponseStatus: {
      h3: h3.getResponseStatus,
      tss: h3Wrappers.getResponseStatus,
    },
    getResponseStatusText: {
      h3: h3.getResponseStatusText,
      tss: h3Wrappers.getResponseStatusText,
    },
    getResponseHeaders: {
      h3: h3.getResponseHeaders,
      tss: h3Wrappers.getResponseHeaders,
    },
    getResponseHeader: {
      h3: h3.getResponseHeader,
      tss: h3Wrappers.getResponseHeader,
    },
    setResponseHeaders: {
      h3: h3.setResponseHeaders,
      tss: h3Wrappers.setResponseHeaders,
    },
    setResponseHeader: {
      h3: h3.setResponseHeader<'Age'>,
      tss: h3Wrappers.setResponseHeader<'Age'>,
    },
    appendResponseHeaders: {
      h3: h3.appendResponseHeaders,
      tss: h3Wrappers.appendResponseHeaders,
    },
    appendResponseHeader: {
      h3: h3.appendResponseHeader<'Age'>,
      tss: h3Wrappers.appendResponseHeader<'Age'>,
    },
    defaultContentType: {
      h3: h3.defaultContentType,
      tss: h3Wrappers.defaultContentType,
    },
    sendRedirect: {
      h3: h3.sendRedirect,
      tss: h3Wrappers.sendRedirect,
    },
    sendStream: {
      h3: h3.sendStream,
      tss: h3Wrappers.sendStream,
    },
    writeEarlyHints: {
      h3: h3.writeEarlyHints,
      tss: h3Wrappers.writeEarlyHints,
    },
    sendError: {
      h3: h3.sendError,
      tss: h3Wrappers.sendError,
    },
    sendProxy: {
      h3: h3.sendProxy,
      tss: h3Wrappers.sendProxy,
    },
    proxyRequest: {
      h3: h3.proxyRequest,
      tss: h3Wrappers.proxyRequest,
    },
    fetchWithEvent: {
      h3: h3.fetchWithEvent<Foo, Foo, typeof fetch>,
      tss: h3Wrappers.fetchWithEvent<Foo, Foo, typeof fetch>,
    },
    getProxyRequestHeaders: {
      h3: h3.getProxyRequestHeaders,
      tss: h3Wrappers.getProxyRequestHeaders,
    },
    parseCookies: {
      h3: h3.parseCookies,
      tss: h3Wrappers.parseCookies,
    },
    getCookie: {
      h3: h3.getCookie,
      tss: h3Wrappers.getCookie,
    },
    setCookie: {
      h3: h3.setCookie,
      tss: h3Wrappers.setCookie,
    },
    deleteCookie: {
      h3: h3.deleteCookie,
      tss: h3Wrappers.deleteCookie,
    },
    useSession: {
      h3: h3.useSession<Foo>,
      tss: h3Wrappers.useSession<Foo>,
    },
    getSession: {
      h3: h3.getSession<Foo>,
      tss: h3Wrappers.getSession<Foo>,
    },
    updateSession: {
      h3: h3.updateSession<Foo>,
      tss: h3Wrappers.updateSession<Foo>,
    },
    sealSession: {
      h3: h3.sealSession<Foo>,
      tss: h3Wrappers.sealSession<Foo>,
    },
    unsealSession: {
      h3: h3.unsealSession,
      tss: h3Wrappers.unsealSession,
    },
    clearSession: {
      h3: h3.clearSession,
      tss: h3Wrappers.clearSession,
    },
    handleCacheHeaders: {
      h3: h3.handleCacheHeaders,
      tss: h3Wrappers.handleCacheHeaders,
    },
    handleCors: {
      h3: h3.handleCors,
      tss: h3Wrappers.handleCors,
    },
    appendCorsHeaders: {
      h3: h3.appendCorsHeaders,
      tss: h3Wrappers.appendCorsHeaders,
    },
    appendCorsPreflightHeaders: {
      h3: h3.appendCorsPreflightHeaders,
      tss: h3Wrappers.appendCorsPreflightHeaders,
    },
    sendWebResponse: {
      h3: h3.sendWebResponse,
      tss: h3Wrappers.sendWebResponse,
    },
    appendHeader: {
      h3: h3.appendHeader<'Age'>,
      tss: h3Wrappers.appendHeader<'Age'>,
    },
    appendHeaders: {
      h3: h3.appendHeaders,
      tss: h3Wrappers.appendHeaders,
    },
    setHeader: {
      h3: h3.setHeader<'Age'>,
      tss: h3Wrappers.setHeader<'Age'>,
    },
    setHeaders: {
      h3: h3.setHeaders,
      tss: h3Wrappers.setHeaders,
    },
    getHeader: {
      h3: h3.getHeader,
      tss: h3Wrappers.getHeader,
    },
    getHeaders: {
      h3: h3.getHeaders,
      tss: h3Wrappers.getHeaders,
    },
    getRequestFingerprint: {
      h3: h3.getRequestFingerprint,
      tss: h3Wrappers.getRequestFingerprint,
    },
    getRequestWebStream: {
      h3: h3.getRequestWebStream,
      tss: h3Wrappers.getRequestWebStream,
    },
    readFormData: {
      h3: h3.readFormData,
      tss: h3Wrappers.readFormData,
    },
    readMultipartFormData: {
      h3: h3.readMultipartFormData,
      tss: h3Wrappers.readMultipartFormData,
    },
    readValidatedBody: {
      h3: h3.readValidatedBody<Foo>,
      tss: h3Wrappers.readValidatedBody<Foo>,
    },
    removeResponseHeader: {
      h3: h3.removeResponseHeader,
      tss: h3Wrappers.removeResponseHeader,
    },
    clearResponseHeaders: {
      h3: h3.clearResponseHeaders,
      tss: h3Wrappers.clearResponseHeaders,
    },
  })
})
